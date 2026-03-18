import * as core from "@actions/core"
import * as github from "@actions/github"
import { execSync } from "child_process"
import * as fs from "fs"
import type { ModelClient } from "./models/types"
import type { ReviewContext, FixMode, FixPlan, FixResult, CodeContext } from "./types"
import { analyzeCodebase, extractKeywords } from "./codebase"
import { parseFixPlan, parseFixReview } from "./schemas/fix"

type Octokit = ReturnType<typeof github.getOctokit>

const PLAN_SYSTEM = `You are a senior engineer analyzing a bug report for a software project.

Given the issue description and relevant source code, produce a fix plan.

Rules:
1. Be conservative — only propose changes you are confident will fix the issue
2. Use search/replace pairs for modifications so changes can be applied precisely
3. The "search" string must be an EXACT substring of the current file contents
4. Keep changes minimal — fix the bug, don't refactor
5. If you cannot determine a fix from the available context, set fixable=false

Output a JSON object (no markdown fences):
{
  "analysis": "your understanding of the issue and root cause",
  "fixable": true/false,
  "confidence": 0.0-1.0,
  "files": [
    {
      "path": "path/to/file",
      "action": "modify|create|delete",
      "changes": [{"search": "exact text to find", "replace": "replacement text"}],
      "content": "full content for new files only",
      "explanation": "why this change fixes the issue"
    }
  ],
  "commit_message": "fix: description (fixes #N)",
  "test_suggestions": ["test cases that should verify the fix"],
  "risk_notes": ["potential risks or side effects"]
}`

const REVIEW_SYSTEM = `You are a senior engineer reviewing a proposed bug fix.

Given:
- The original issue
- The proposed code changes
- The relevant source code

Evaluate whether the fix:
1. Actually addresses the root cause
2. Handles edge cases
3. Could break anything else
4. Is the minimal correct change

Output a JSON object (no markdown fences):
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "concerns": ["any concerns about the fix"],
  "verdict": "brief assessment"
}`

export async function fixIssue(
  ctx: ReviewContext,
  anthropic: ModelClient | null,
  openai: ModelClient | null,
  octokit: Octokit,
  mode: FixMode,
  confidenceThreshold: number
): Promise<FixResult> {
  if (!ctx.issue) return { success: false, error: "No issue context" }

  const planner = anthropic || openai
  const reviewer = anthropic && openai ? openai : planner
  if (!planner) return { success: false, error: "No model available" }

  core.info(`Analyzing issue #${ctx.issue.number}: ${ctx.issue.title}`)

  const keywords = extractKeywords(ctx.issue.title, ctx.issue.body)
  core.info(`Extracted ${keywords.length} keywords: ${keywords.slice(0, 5).join(", ")}`)

  const codeContext = await analyzeCodebase(keywords)

  if (codeContext.files.length === 0) {
    return { success: false, error: "Could not find relevant code for this issue" }
  }

  const fixPlan = await generateFixPlan(planner, ctx, codeContext)

  if (!fixPlan.fixable) {
    return { success: false, fixPlan, error: `Issue not fixable: ${fixPlan.analysis}` }
  }

  if (fixPlan.confidence < confidenceThreshold) {
    return {
      success: false,
      fixPlan,
      error: `Confidence too low: ${(fixPlan.confidence * 100).toFixed(0)}% (threshold: ${(confidenceThreshold * 100).toFixed(0)}%)`,
    }
  }

  if (reviewer && reviewer !== planner) {
    const reviewResult = await reviewFixPlan(reviewer, ctx, fixPlan, codeContext)
    if (!reviewResult.approved) {
      core.warning(`Fix review rejected: ${reviewResult.verdict}`)
      fixPlan.riskNotes.push(`Review concerns: ${reviewResult.concerns.join("; ")}`)

      if (reviewResult.confidence < 0.5) {
        return {
          success: false,
          fixPlan,
          error: `Fix rejected by reviewer: ${reviewResult.verdict}`,
        }
      }
    }
  }

  if (mode === "propose_only") {
    core.info("Propose-only mode — returning fix plan without applying")
    return { success: true, fixPlan }
  }

  const branch = await createFixBranch(ctx.issue.number)

  try {
    await applyChanges(fixPlan)
    await commitAndPush(branch, fixPlan.commitMessage)

    const pr = await createFixPR(octokit, ctx, fixPlan, branch)
    core.info(`Fix PR created: ${pr.url}`)

    if (mode === "yolo") {
      core.info("Yolo mode — auto-merging fix PR")
      await mergeFixPR(octokit, pr.number)
    }

    return {
      success: true,
      fixPlan,
      branch,
      prNumber: pr.number,
      prUrl: pr.url,
    }
  } catch (err) {
    core.warning(`Failed to apply fix: ${err}`)
    try {
      execSync(`git checkout ${ctx.repository.defaultBranch} 2>/dev/null || git checkout main`, { encoding: "utf-8" })
      execSync(`git branch -D ${branch} 2>/dev/null`, { encoding: "utf-8" })
    } catch { /* cleanup best effort */ }

    return {
      success: false,
      fixPlan,
      error: `Failed to apply changes: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function generateFixPlan(
  model: ModelClient,
  ctx: ReviewContext,
  codeContext: CodeContext
): Promise<FixPlan> {
  const issue = ctx.issue!
  const filesContext = codeContext.files
    .map((f) => `### ${f.path}\nRelevance: ${f.relevance}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n")

  const prompt = [
    `# Issue #${issue.number}: ${issue.title}`,
    "",
    issue.body,
    "",
    "## Project Structure",
    codeContext.structure,
    "",
    "## Dependencies",
    codeContext.dependencies,
    "",
    "## Relevant Source Files",
    filesContext,
  ].join("\n")

  const result = await model.chat(PLAN_SYSTEM, prompt)
  const parsed = parseFixPlan(result.text)

  return {
    analysis: parsed.analysis,
    fixable: parsed.fixable,
    confidence: parsed.confidence,
    files: parsed.files.map((f) => ({
      path: f.path,
      action: f.action,
      changes: f.changes,
      content: f.content,
      explanation: f.explanation,
    })),
    commitMessage: parsed.commit_message,
    testSuggestions: parsed.test_suggestions,
    riskNotes: parsed.risk_notes,
  }
}

async function reviewFixPlan(
  model: ModelClient,
  ctx: ReviewContext,
  plan: FixPlan,
  codeContext: CodeContext
): Promise<{ approved: boolean; confidence: number; concerns: string[]; verdict: string }> {
  const issue = ctx.issue!
  const changesDescription = plan.files
    .map((f) => `${f.path} (${f.action}): ${f.explanation}`)
    .join("\n")

  const prompt = [
    `# Original Issue #${issue.number}: ${issue.title}`,
    issue.body,
    "",
    "# Proposed Fix",
    `Analysis: ${plan.analysis}`,
    `Confidence: ${plan.confidence}`,
    "",
    "## Changes",
    changesDescription,
    "",
    "## Detailed Changes",
    JSON.stringify(plan.files, null, 2),
    "",
    "## Relevant Code Context",
    codeContext.files.slice(0, 5).map((f) => `### ${f.path}\n\`\`\`\n${f.content.substring(0, 3000)}\n\`\`\``).join("\n\n"),
  ].join("\n")

  try {
    const result = await model.chat(REVIEW_SYSTEM, prompt)
    const parsed = parseFixReview(result.text)
    return parsed
  } catch {
    return { approved: true, confidence: 0.5, concerns: ["Review parsing failed"], verdict: "Proceeding with caution" }
  }
}

async function createFixBranch(issueNumber: number): Promise<string> {
  const branch = `fix/issue-${issueNumber}`
  execSync(`git checkout -b ${branch}`, { encoding: "utf-8" })
  return branch
}

async function applyChanges(plan: FixPlan): Promise<void> {
  for (const file of plan.files) {
    if (file.action === "delete") {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path)
        core.info(`Deleted: ${file.path}`)
      }
      continue
    }

    if (file.action === "create") {
      const dir = file.path.split("/").slice(0, -1).join("/")
      if (dir) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file.path, file.content || "")
      core.info(`Created: ${file.path}`)
      continue
    }

    if (file.action === "modify" && file.changes) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.path}`)
      }

      let content = fs.readFileSync(file.path, "utf-8")

      for (const change of file.changes) {
        if (!content.includes(change.search)) {
          throw new Error(`Search text not found in ${file.path}: "${change.search.substring(0, 60)}..."`)
        }
        content = content.replace(change.search, change.replace)
      }

      fs.writeFileSync(file.path, content)
      core.info(`Modified: ${file.path} (${file.changes.length} change(s))`)
    }
  }
}

async function commitAndPush(branch: string, message: string): Promise<void> {
  execSync('git config user.name "sentinel[bot]"', { encoding: "utf-8" })
  execSync('git config user.email "sentinel[bot]@users.noreply.github.com"', { encoding: "utf-8" })
  execSync("git add -A", { encoding: "utf-8" })
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { encoding: "utf-8" })
  execSync(`git push origin ${branch}`, { encoding: "utf-8" })
}

async function createFixPR(
  octokit: Octokit,
  ctx: ReviewContext,
  plan: FixPlan,
  branch: string
): Promise<{ number: number; url: string }> {
  const { owner, name: repo } = ctx.repository
  const issue = ctx.issue!

  const body = [
    `Fixes #${issue.number}`,
    "",
    "## Analysis",
    plan.analysis,
    "",
    "## Changes",
    ...plan.files.map((f) => `- **${f.path}** (${f.action}): ${f.explanation}`),
    "",
    plan.riskNotes.length > 0
      ? `## Risk Notes\n${plan.riskNotes.map((n) => `- ⚠️ ${n}`).join("\n")}`
      : "",
    "",
    plan.testSuggestions.length > 0
      ? `## Suggested Tests\n${plan.testSuggestions.map((t) => `- [ ] ${t}`).join("\n")}`
      : "",
    "",
    `---`,
    `*Generated by Sentinel · Confidence: ${(plan.confidence * 100).toFixed(0)}%*`,
  ]
    .filter(Boolean)
    .join("\n")

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: plan.commitMessage,
    body,
    head: branch,
    base: ctx.repository.defaultBranch,
    draft: ctx.repoPolicies.fix.createDraftPr,
  })

  return { number: pr.number, url: pr.html_url }
}

async function mergeFixPR(octokit: Octokit, prNumber: number): Promise<void> {
  const { owner, repo } = github.context.repo

  try {
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: "squash",
    })
    core.info(`Auto-merged PR #${prNumber} (yolo mode)`)
  } catch (err) {
    core.warning(`Auto-merge failed for PR #${prNumber}: ${err}`)
  }
}

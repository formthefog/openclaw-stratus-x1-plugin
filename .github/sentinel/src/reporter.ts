import * as core from "@actions/core"
import * as github from "@actions/github"
import type { FinalDecision, FinalAction, ReviewFinding, FindingSeverity, FindingType, FixResult, FixMode } from "./types"

type Octokit = ReturnType<typeof github.getOctokit>

const COMMENT_MARKER = "<!-- sentinel-review -->"

const SEVERITY_EMOJI: Record<FindingSeverity, string> = {
  critical: "🔴",
  high: "🔴",
  medium: "🟡",
  low: "🔵",
}

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
}

const TYPE_LABEL: Record<FindingType, string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  maintainability: "Maintainability",
  test_gap: "Test Gap",
  architecture: "Architecture",
}

const SOURCE_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  merged: "Both models",
}

const REVIEW_EVENT_MAP: Partial<Record<FinalAction, "COMMENT" | "REQUEST_CHANGES" | "APPROVE">> = {
  comment_only: "COMMENT",
  request_changes: "REQUEST_CHANGES",
  needs_human_review: "REQUEST_CHANGES",
  suggest_patch: "COMMENT",
  decline: "COMMENT",
}

export async function reportReview(
  octokit: Octokit,
  decision: FinalDecision,
  prNumber: number,
  summaryOnClean = false
): Promise<void> {
  const { owner, repo } = github.context.repo
  const inlineFindings = decision.findings.filter((f) => f.lineStart && f.lineStart > 0)
  const nonInlineFindings = decision.findings.filter((f) => !f.lineStart || f.lineStart <= 0)

  await dismissPreviousReviews(octokit, prNumber)

  if (inlineFindings.length > 0) {
    await submitPRReview(octokit, decision, prNumber, inlineFindings)
  }

  if (decision.findings.length === 0 && !summaryOnClean) {
    // Still emit step summary + action outputs even when skipping the PR comment,
    // so downstream jobs and RL training can consume quality_score / findings_count.
    await postStepSummary(decision)
    setOutputs(decision)
    core.info("No findings — skipping summary comment (summary_on_clean is false)")
    return
  }

  const summaryBody = formatSummaryComment(decision, nonInlineFindings, inlineFindings.length)
  await upsertComment(octokit, prNumber, summaryBody)

  await postStepSummary(decision)
  setOutputs(decision)

  core.info(`Review posted: ${decision.action}, ${decision.findings.length} findings (${inlineFindings.length} inline, ${nonInlineFindings.length} summary)`)
}

export async function reportIssueTriage(
  octokit: Octokit,
  issueNumber: number,
  classification: string,
  summary: string
): Promise<void> {
  const { owner, repo } = github.context.repo
  const body = [
    COMMENT_MARKER,
    "## Sentinel — Issue Triage",
    "",
    `**Classification:** ${classification}`,
    "",
    summary,
    "",
    "---",
    "*Triaged by Sentinel*",
  ].join("\n")

  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body })
}

export async function reportFixResult(
  octokit: Octokit,
  issueNumber: number,
  result: FixResult,
  mode: FixMode
): Promise<void> {
  const { owner, repo } = github.context.repo
  const lines: string[] = [COMMENT_MARKER]

  if (result.success && result.fixPlan) {
    const plan = result.fixPlan
    const modeLabel =
      mode === "propose_only" ? "Proposed Fix" :
      mode === "propose_and_pr" ? "Fix PR Created" :
      "Fix Applied (Auto-merged)"

    lines.push(`## Sentinel — ${modeLabel} ✅`)
    lines.push("")
    lines.push(`**Confidence:** ${(plan.confidence * 100).toFixed(0)}%`)
    lines.push("")
    lines.push("### Analysis")
    lines.push(plan.analysis)
    lines.push("")
    lines.push("### Changes")

    for (const file of plan.files) {
      lines.push("")
      lines.push(`#### \`${file.path}\` (${file.action})`)
      lines.push(file.explanation)

      if (file.changes && file.changes.length > 0) {
        lines.push("")
        lines.push("<details>")
        lines.push("<summary>View changes</summary>")
        lines.push("")
        for (const change of file.changes) {
          lines.push("```diff")
          lines.push(`- ${change.search.split("\n").join("\n- ")}`)
          lines.push(`+ ${change.replace.split("\n").join("\n+ ")}`)
          lines.push("```")
        }
        lines.push("")
        lines.push("</details>")
      }
    }

    if (plan.testSuggestions.length > 0) {
      lines.push("")
      lines.push("### Suggested Tests")
      for (const t of plan.testSuggestions) lines.push(`- [ ] ${t}`)
    }

    if (plan.riskNotes.length > 0) {
      lines.push("")
      lines.push("### Risk Notes")
      for (const r of plan.riskNotes) lines.push(`- ⚠️ ${r}`)
    }

    if (result.prUrl) {
      lines.push("")
      lines.push(`### Pull Request`)
      lines.push(`→ ${result.prUrl}`)
    }
  } else {
    lines.push("## Sentinel — Fix Analysis ℹ️")
    lines.push("")
    lines.push(`Could not generate a fix: ${result.error}`)

    if (result.fixPlan) {
      lines.push("")
      lines.push("### Analysis")
      lines.push(result.fixPlan.analysis)

      if (result.fixPlan.confidence > 0) {
        lines.push("")
        lines.push(`Confidence was ${(result.fixPlan.confidence * 100).toFixed(0)}% (below threshold).`)
      }
    }
  }

  lines.push("")
  lines.push("---")
  lines.push("*Did we get this right? 👍 / 👎 to inform future fixes*")
  lines.push("")
  lines.push("*Sentinel*")

  const body = lines.join("\n")
  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body })
}

export async function reportFailure(
  octokit: Octokit,
  prOrIssueNumber: number,
  error: string
): Promise<void> {
  const body = [
    COMMENT_MARKER,
    "## Sentinel — Review Failed",
    "",
    `Review could not be completed: ${error}`,
    "",
    "This is non-destructive — no code was modified.",
    "",
    "---",
    "*Sentinel*",
  ].join("\n")

  try {
    await upsertComment(octokit, prOrIssueNumber, body)
  } catch {
    core.warning("Failed to post failure comment")
  }
}

// ── PR Review (inline comments with resolve/unresolve) ──

async function submitPRReview(
  octokit: Octokit,
  decision: FinalDecision,
  prNumber: number,
  inlineFindings: ReviewFinding[]
): Promise<void> {
  const { owner, repo } = github.context.repo

  try {
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    const commitSha = pr.head.sha
    const event = REVIEW_EVENT_MAP[decision.action] || "COMMENT"

    const comments = inlineFindings.slice(0, 25).map((f) => {
      const comment: {
        path: string
        body: string
        line: number
        side: "RIGHT"
        start_line?: number
        start_side?: "RIGHT"
      } = {
        path: f.file,
        body: formatFindingComment(f),
        line: f.lineEnd && f.lineEnd !== f.lineStart ? f.lineEnd : f.lineStart!,
        side: "RIGHT",
      }

      if (f.lineEnd && f.lineEnd !== f.lineStart && f.lineStart) {
        comment.start_line = f.lineStart
        comment.start_side = "RIGHT"
      }

      return comment
    })

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event,
      body: `Sentinel reviewed this PR with ${decision.findings.length} finding(s).`,
      comments,
    })

    core.info(`Submitted PR review: ${event}, ${comments.length} inline comments`)
  } catch (err) {
    core.warning(`PR review submission failed, falling back to individual comments: ${err}`)
    await postIndividualComments(octokit, inlineFindings, prNumber)
  }
}

async function postIndividualComments(
  octokit: Octokit,
  findings: ReviewFinding[],
  prNumber: number
): Promise<void> {
  const { owner, repo } = github.context.repo

  try {
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    const commitSha = pr.head.sha

    for (const f of findings.slice(0, 15)) {
      try {
        await octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          commit_id: commitSha,
          path: f.file,
          line: f.lineStart!,
          body: formatFindingComment(f),
        })
      } catch {
        core.debug(`Could not post inline comment on ${f.file}:${f.lineStart}`)
      }
    }
  } catch (err) {
    core.debug(`Inline comments skipped entirely: ${err}`)
  }
}

async function dismissPreviousReviews(octokit: Octokit, prNumber: number): Promise<void> {
  const { owner, repo } = github.context.repo

  try {
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    })

    for (const review of reviews) {
      if (
        review.body?.includes("Sentinel") &&
        review.state === "CHANGES_REQUESTED"
      ) {
        try {
          await octokit.rest.pulls.dismissReview({
            owner,
            repo,
            pull_number: prNumber,
            review_id: review.id,
            message: "Superseded by new Sentinel review",
          })
        } catch {
          core.debug(`Could not dismiss review ${review.id}`)
        }
      }
    }
  } catch {
    core.debug("Could not list previous reviews for dismissal")
  }
}

// ── Per-Finding Rich Comment (Sentry-style) ──

function formatFindingComment(f: ReviewFinding): string {
  const lines: string[] = []

  const typeLabel = TYPE_LABEL[f.type] || f.type
  lines.push(`**${typeLabel}:** ${f.explanation}`)
  lines.push("")

  const sevEmoji = SEVERITY_EMOJI[f.severity]
  const sevLabel = SEVERITY_LABEL[f.severity]
  const source = SOURCE_LABEL[f.source] || f.source
  const confidence = Math.round(f.confidence * 100)
  lines.push(`**Severity:** ${sevEmoji} ${sevLabel} · **Confidence:** ${confidence}% · **Source:** ${source}`)

  if (f.suggestedFix) {
    lines.push("")
    lines.push("<details>")
    lines.push("<summary>Suggested Fix</summary>")
    lines.push("")
    lines.push("```suggestion")
    lines.push(f.suggestedFix)
    lines.push("```")
    lines.push("")
    lines.push("</details>")
  }

  lines.push("")
  lines.push("<details>")
  lines.push("<summary>Prompt for AI Agent</summary>")
  lines.push("")
  lines.push("```")
  lines.push(buildAgentPrompt(f))
  lines.push("```")
  lines.push("")
  lines.push("</details>")

  lines.push("")
  lines.push("---")
  lines.push("*Did we get this right? 👍 / 👎 to inform future reviews*")

  return lines.join("\n")
}

function buildAgentPrompt(f: ReviewFinding): string {
  const typeLabel = TYPE_LABEL[f.type] || f.type
  const location = f.lineStart
    ? `${f.file}#L${f.lineStart}${f.lineEnd && f.lineEnd !== f.lineStart ? `-L${f.lineEnd}` : ""}`
    : f.file

  const parts: string[] = []
  parts.push("Review the code at the location below. A potential issue has been")
  parts.push("identified by an AI agent.")
  parts.push("Verify if this is a real issue. If it is, propose a fix; if not,")
  parts.push("explain why it's not valid.")
  parts.push("")
  parts.push(`Location: ${location}`)
  parts.push(`Type: ${typeLabel}`)
  parts.push("")
  parts.push(`Potential issue: ${f.explanation}`)

  if (f.suggestedFix) {
    parts.push("")
    parts.push(`Suggested fix: ${f.suggestedFix}`)
  }

  return parts.join("\n")
}

// ── Summary Comment (upserted) ──

function formatSummaryComment(
  decision: FinalDecision,
  nonInlineFindings: ReviewFinding[],
  inlineCount: number
): string {
  const lines: string[] = [COMMENT_MARKER]

  const statusEmoji =
    decision.action === "comment_only" ? "✅" :
    decision.action === "request_changes" ? "⚠️" :
    decision.action === "needs_human_review" ? "🛑" : "ℹ️"

  lines.push(`## Sentinel Review ${statusEmoji}`)
  lines.push("")

  if (decision.findings.length === 0) {
    lines.push("No issues found. Code looks clean. ✨")
  } else {
    const severityCounts = countBySeverity(decision.findings)
    const countParts: string[] = []
    if (severityCounts.critical) countParts.push(`🔴 ${severityCounts.critical} critical`)
    if (severityCounts.high) countParts.push(`🔴 ${severityCounts.high} high`)
    if (severityCounts.medium) countParts.push(`🟡 ${severityCounts.medium} medium`)
    if (severityCounts.low) countParts.push(`🔵 ${severityCounts.low} low`)

    lines.push(`**${decision.findings.length} finding(s)** — ${countParts.join(" · ")}`)

    if (inlineCount > 0) {
      lines.push("")
      lines.push(`> ${inlineCount} finding(s) posted as inline review comments on the diff.`)
    }
  }

  if (nonInlineFindings.length > 0) {
    lines.push("")
    lines.push("### Findings without line context")
    lines.push("")

    for (const f of nonInlineFindings) {
      const sevEmoji = SEVERITY_EMOJI[f.severity]
      const typeLabel = TYPE_LABEL[f.type] || f.type
      lines.push(`#### ${sevEmoji} ${f.title}`)
      lines.push("")
      lines.push(`**${typeLabel}** in \`${f.file}\` · **Severity:** ${SEVERITY_LABEL[f.severity]} · **Confidence:** ${Math.round(f.confidence * 100)}%`)
      lines.push("")
      lines.push(f.explanation)

      if (f.suggestedFix) {
        lines.push("")
        lines.push("<details>")
        lines.push("<summary>Suggested Fix</summary>")
        lines.push("")
        lines.push("```suggestion")
        lines.push(f.suggestedFix)
        lines.push("```")
        lines.push("")
        lines.push("</details>")
      }

      lines.push("")
      lines.push("<details>")
      lines.push("<summary>Prompt for AI Agent</summary>")
      lines.push("")
      lines.push("```")
      lines.push(buildAgentPrompt(f))
      lines.push("```")
      lines.push("")
      lines.push("</details>")
      lines.push("")
    }
  }

  if (decision.anthropicReview && decision.openaiReview) {
    lines.push("")
    lines.push("<details>")
    lines.push("<summary>Model Summaries</summary>")
    lines.push("")
    lines.push(`**Anthropic (architecture):** ${decision.anthropicReview.summary}`)
    lines.push("")
    lines.push(`**OpenAI (implementation):** ${decision.openaiReview.summary}`)
    lines.push("")
    lines.push("</details>")
  }

  if (decision.critique) {
    const { agreedFindings, disputedFindings } = decision.critique
    if (agreedFindings.length || disputedFindings.length) {
      lines.push("")
      lines.push("<details>")
      lines.push("<summary>Adversarial Debate</summary>")
      lines.push("")
      if (agreedFindings.length) {
        lines.push("**Agreed:**")
        for (const a of agreedFindings) lines.push(`- ✓ ${a}`)
        lines.push("")
      }
      if (disputedFindings.length) {
        lines.push("**Disputed:**")
        for (const d of disputedFindings) lines.push(`- ✗ ${d.finding}: *${d.reason}*`)
        lines.push("")
      }
      lines.push("</details>")
    }
  }

  lines.push("")
  lines.push("---")
  lines.push("")

  const verdict =
    decision.action === "comment_only" ? "No blockers — ready to merge" :
    decision.action === "request_changes" ? "Changes requested — address findings before merge" :
    decision.action === "needs_human_review" ? "Human review required — sensitive changes detected" :
    decision.action

  lines.push(`**Verdict:** ${verdict}`)

  const totalTokens =
    decision.tokenUsage.anthropic.input + decision.tokenUsage.anthropic.output +
    decision.tokenUsage.openai.input + decision.tokenUsage.openai.output
  const seconds = (decision.durationMs / 1000).toFixed(1)

  lines.push("")
  lines.push(`*Sentinel — dual-model review in ${seconds}s · ${totalTokens.toLocaleString()} tokens*`)

  return lines.join("\n")
}

// ── Helpers ──

function countBySeverity(findings: ReviewFinding[]): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) counts[f.severity]++
  return counts
}

async function upsertComment(octokit: Octokit, issueNumber: number, body: string): Promise<void> {
  const { owner, repo } = github.context.repo

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
    })

    const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER))
    if (existing) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
    } else {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body })
    }
  } catch (err) {
    core.warning(`Failed to upsert comment: ${err}`)
    try {
      const { owner, repo } = github.context.repo
      await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body })
    } catch {
      core.warning("Failed to create comment as fallback")
    }
  }
}

async function postStepSummary(decision: FinalDecision): Promise<void> {
  const lines: string[] = []
  lines.push("### Sentinel Review")
  lines.push("")
  lines.push("| Metric | Value |")
  lines.push("|--------|-------|")
  lines.push(`| Findings | ${decision.findings.length} |`)
  lines.push(`| Action | \`${decision.action}\` |`)
  lines.push(`| Duration | ${(decision.durationMs / 1000).toFixed(1)}s |`)
  lines.push(`| Anthropic tokens | ${(decision.tokenUsage.anthropic.input + decision.tokenUsage.anthropic.output).toLocaleString()} |`)
  lines.push(`| OpenAI tokens | ${(decision.tokenUsage.openai.input + decision.tokenUsage.openai.output).toLocaleString()} |`)

  if (decision.findings.length > 0) {
    lines.push("")
    lines.push("| Severity | Count |")
    lines.push("|----------|-------|")
    const counts = countBySeverity(decision.findings)
    for (const [sev, count] of Object.entries(counts)) {
      if (count > 0) lines.push(`| ${SEVERITY_EMOJI[sev as FindingSeverity]} ${SEVERITY_LABEL[sev as FindingSeverity]} | ${count} |`)
    }
  }

  core.summary.addRaw(lines.join("\n"))
  await core.summary.write()
}

function setOutputs(decision: FinalDecision): void {
  const quality = computeQualitySignal(decision)

  const artifact = {
    version: 2,
    timestamp: new Date().toISOString(),
    action: decision.action,
    rationale: decision.rationale,
    findings: decision.findings,
    token_usage: decision.tokenUsage,
    duration_ms: decision.durationMs,
    quality_score: quality.quality_score,
    model_agreement: quality.model_agreement,
    dimensions: quality.dimensions,
    severity_counts: quality.severity_counts,
  }

  core.setOutput("review_json", JSON.stringify(artifact))
  core.setOutput("findings_count", decision.findings.length.toString())
  core.setOutput("action", decision.action)
  core.setOutput("quality_score", quality.quality_score.toFixed(4))
  core.setOutput("model_agreement", quality.model_agreement.toFixed(4))
  core.setOutput("findings_critical", quality.severity_counts.critical.toString())
  core.setOutput("findings_high", quality.severity_counts.high.toString())
  core.setOutput("findings_medium", quality.severity_counts.medium.toString())
  core.setOutput("findings_low", quality.severity_counts.low.toString())
  core.setOutput("dim_correctness", quality.dimensions.correctness.toFixed(4))
  core.setOutput("dim_coverage", quality.dimensions.coverage.toFixed(4))
  core.setOutput("dim_architecture", quality.dimensions.architecture.toFixed(4))
  core.setOutput("dim_value", quality.dimensions.value.toFixed(4))
}

interface QualitySignal {
  quality_score: number
  model_agreement: number
  dimensions: { correctness: number; coverage: number; architecture: number; value: number }
  severity_counts: Record<FindingSeverity, number>
}

function computeQualitySignal(decision: FinalDecision): QualitySignal {
  const counts = countBySeverity(decision.findings)

  const penalties = counts.critical * 0.25 + counts.high * 0.15 + counts.medium * 0.05 + counts.low * 0.01
  const quality_score = Math.max(0, Math.min(1, 1.0 - penalties))

  let model_agreement = 1.0
  if (decision.anthropicReview && decision.openaiReview) {
    const agreedCount = decision.critique?.agreedFindings?.length ?? 0
    const disputedCount = decision.critique?.disputedFindings?.length ?? 0
    const totalDebated = agreedCount + disputedCount
    model_agreement = totalDebated > 0 ? agreedCount / totalDebated : 1.0
  }

  const dimPenalties: Record<FindingType, keyof QualitySignal["dimensions"]> = {
    bug: "correctness",
    security: "correctness",
    performance: "value",
    maintainability: "value",
    test_gap: "coverage",
    architecture: "architecture",
  }

  const dims = { correctness: 1.0, coverage: 1.0, architecture: 1.0, value: 1.0 }
  for (const f of decision.findings) {
    const dim = dimPenalties[f.type]
    if (!dim) continue
    const penalty = f.severity === "critical" ? 0.3 : f.severity === "high" ? 0.2 : f.severity === "medium" ? 0.1 : 0.03
    dims[dim] = Math.max(0, dims[dim] - penalty)
  }

  return { quality_score, model_agreement, dimensions: dims, severity_counts: counts }
}

import * as core from "@actions/core"
import type { ModelClient } from "./models/types"
import type {
  ReviewContext,
  ReviewFinding,
  ModelReview,
  FinalDecision,
  FinalAction,
  FindingSeverity,
  TokenUsage,
  ChangedFile,
} from "./types"

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

export async function orchestrateReview(
  ctx: ReviewContext,
  anthropic: ModelClient | null,
  openai: ModelClient | null
): Promise<FinalDecision> {
  const start = Date.now()
  const usage = {
    anthropic: { input: 0, output: 0 },
    openai: { input: 0, output: 0 },
  }

  if (!anthropic && !openai) {
    return failedDecision("Both model clients unavailable", start)
  }

  const userPrompt = buildReviewPrompt(ctx)

  // ── Phase 1: Independent analysis (parallel) ──

  core.info("Phase 1: Independent analysis")

  const [anthropicResult, openaiResult] = await Promise.allSettled([
    anthropic?.review({
      context: ctx,
      systemPrompt: "",
      userPrompt,
    }),
    openai?.review({
      context: ctx,
      systemPrompt: "",
      userPrompt,
    }),
  ])

  let anthropicReview: ModelReview | null = null
  let openaiReview: ModelReview | null = null

  if (anthropicResult.status === "fulfilled" && anthropicResult.value) {
    anthropicReview = anthropicResult.value.review
    addUsage(usage.anthropic, anthropicResult.value.usage)
    core.info(`Anthropic review: ${anthropicReview.findings.length} findings, severity=${anthropicReview.severity}`)
  } else {
    const reason = anthropicResult.status === "rejected" ? anthropicResult.reason : "not configured"
    core.warning(`Anthropic review failed: ${reason}`)
  }

  if (openaiResult.status === "fulfilled" && openaiResult.value) {
    openaiReview = openaiResult.value.review
    addUsage(usage.openai, openaiResult.value.usage)
    core.info(`OpenAI review: ${openaiReview.findings.length} findings, severity=${openaiReview.severity}`)
  } else {
    const reason = openaiResult.status === "rejected" ? openaiResult.reason : "not configured"
    core.warning(`OpenAI review failed: ${reason}`)
  }

  if (!anthropicReview && !openaiReview) {
    return failedDecision("Both models failed to produce reviews", start)
  }

  // ── Single-model fallback ──

  if (!anthropicReview || !openaiReview) {
    const singleReview = anthropicReview || openaiReview!
    const source = anthropicReview ? "anthropic" : "openai"
    core.warning(`Running single-model mode (${source} only)`)

    return {
      action: determineAction(singleReview.findings, ctx),
      rationale: `Single-model review (${source}): ${singleReview.summary}`,
      findings: singleReview.findings,
      anthropicReview: anthropicReview || undefined,
      openaiReview: openaiReview || undefined,
      tokenUsage: usage,
      durationMs: Date.now() - start,
    }
  }

  // ── Phase 2: Anthropic critiques OpenAI's findings ──

  core.info("Phase 2: Anthropic critiques OpenAI findings")

  let critique = null
  try {
    const critiqueResult = await anthropic!.critique({
      context: ctx,
      otherModelReview: openaiReview,
      systemPrompt: "",
    })
    critique = critiqueResult.critique
    addUsage(usage.anthropic, critiqueResult.usage)
    core.info(`Critique: ${critique.agreedFindings.length} agreed, ${critique.disputedFindings.length} disputed, ${critique.missedIssues.length} missed`)
  } catch (err) {
    core.warning(`Critique phase failed: ${err}`)
  }

  // ── Phase 3: OpenAI responds to critique ──

  let critiqueResponse = null
  if (critique) {
    core.info("Phase 3: OpenAI responds to critique")

    try {
      const responseResult = await openai!.respondToCritique({
        context: ctx,
        critique,
        originalReview: openaiReview,
        systemPrompt: "",
      })
      critiqueResponse = responseResult.response
      addUsage(usage.openai, responseResult.usage)
      core.info(`Response: ${critiqueResponse.accepted.length} accepted, ${critiqueResponse.disputed.length} disputed`)
    } catch (err) {
      core.warning(`Critique response phase failed: ${err}`)
    }
  }

  // ── Phase 4: Synthesis ──

  core.info("Phase 4: Merging findings")

  const mergedFindings = mergeFindings(
    anthropicReview,
    openaiReview,
    critique,
    critiqueResponse
  )

  const action = determineAction(mergedFindings, ctx)

  return {
    action,
    rationale: buildRationale(anthropicReview, openaiReview, critique, mergedFindings),
    findings: mergedFindings,
    anthropicReview,
    openaiReview,
    critique: critique || undefined,
    critiqueResponse: critiqueResponse || undefined,
    tokenUsage: usage,
    durationMs: Date.now() - start,
  }
}

function buildReviewPrompt(ctx: ReviewContext): string {
  const pr = ctx.pullRequest
  if (!pr) return "No PR context available."

  const parts: string[] = []

  parts.push(`# PR #${pr.number}: ${pr.title}`)
  if (pr.body) parts.push(`\n## Description\n${pr.body.substring(0, 2000)}`)
  parts.push(`\nBase: ${pr.baseRef} ← Head: ${pr.headRef}`)
  if (pr.labels.length) parts.push(`Labels: ${pr.labels.join(", ")}`)
  if (pr.ciStatus) parts.push(`CI Status: ${pr.ciStatus}`)

  parts.push(`\n## Changed Files (${pr.changedFiles.length})`)

  for (const file of pr.changedFiles) {
    parts.push(`\n### ${file.path} (${file.status}, +${file.additions}/-${file.deletions})`)
    if (file.patch) {
      const truncated = file.patch.length > 3000
        ? file.patch.substring(0, 3000) + "\n... (truncated)"
        : file.patch
      parts.push(`\`\`\`diff\n${truncated}\n\`\`\``)
    }
  }

  return parts.join("\n")
}

function mergeFindings(
  anthropicReview: ModelReview,
  openaiReview: ModelReview,
  critique: { agreedFindings: string[]; disputedFindings: Array<{ finding: string; reason: string }>; missedIssues: ReviewFinding[] } | null,
  critiqueResponse: { revisedFindings: ReviewFinding[] } | null
): ReviewFinding[] {
  const merged: ReviewFinding[] = []
  const seen = new Set<string>()

  for (const finding of anthropicReview.findings) {
    const key = dedupeKey(finding)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(finding)
    }
  }

  const openaiSource = critiqueResponse?.revisedFindings || openaiReview.findings
  for (const finding of openaiSource) {
    const key = dedupeKey(finding)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(finding)
    }
  }

  if (critique?.missedIssues) {
    for (const finding of critique.missedIssues) {
      const key = dedupeKey(finding)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(finding)
      }
    }
  }

  merged.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])

  return merged
}

function dedupeKey(f: ReviewFinding): string {
  return `${f.file}:${f.lineStart || 0}:${f.type}:${f.title.toLowerCase().substring(0, 40)}`
}

function determineAction(findings: ReviewFinding[], ctx: ReviewContext): FinalAction {
  if (findings.length === 0) return "comment_only"

  const hasCritical = findings.some((f) => f.severity === "critical")
  const hasHigh = findings.some((f) => f.severity === "high")
  const hasSecurity = findings.some((f) => f.type === "security" && SEVERITY_RANK[f.severity] >= SEVERITY_RANK["high"])

  const restrictedTouched = ctx.pullRequest?.changedFiles.some((file: ChangedFile) =>
    ctx.repoPolicies.restrictedPaths.some((pattern: string) => fileMatchesPattern(file.path, pattern))
  )

  if (hasSecurity || (hasCritical && restrictedTouched)) return "needs_human_review"
  if (hasCritical || hasHigh) return "request_changes"
  return "comment_only"
}

function fileMatchesPattern(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*")
  return new RegExp(`^${regex}$`).test(filePath)
}

function buildRationale(
  anthropicReview: ModelReview,
  openaiReview: ModelReview,
  critique: { overallAssessment: string } | null,
  findings: ReviewFinding[]
): string {
  const parts: string[] = []
  parts.push(`Anthropic: ${anthropicReview.summary}`)
  parts.push(`OpenAI: ${openaiReview.summary}`)
  if (critique) parts.push(`Synthesis: ${critique.overallAssessment}`)
  parts.push(`Merged: ${findings.length} findings`)
  return parts.join(" | ")
}

function failedDecision(reason: string, startTime: number): FinalDecision {
  return {
    action: "decline",
    rationale: reason,
    findings: [],
    tokenUsage: { anthropic: { input: 0, output: 0 }, openai: { input: 0, output: 0 } },
    durationMs: Date.now() - startTime,
  }
}

function addUsage(target: TokenUsage, source: TokenUsage): void {
  target.input += source.input
  target.output += source.output
}

import Anthropic from "@anthropic-ai/sdk"
import * as core from "@actions/core"
import type { ModelClient, ReviewRequest, CritiqueRequest, CritiqueResponseRequest } from "./types"
import type { ModelReview, CritiqueOutput, CritiqueResponse, ReviewFinding, TokenUsage } from "../types"
import { parseModelReview, parseCritiqueOutput, parseCritiqueResponse } from "../schemas/review"

const REVIEW_SYSTEM = `You are a principal engineer conducting a code review. You are thorough, skeptical, and focused on long-term code health.

Your priorities:
1. Intent mismatch — does the code do what the PR says it does?
2. Hidden edge cases — what breaks under unusual input or concurrency?
3. Correctness risks — logic errors, off-by-one, race conditions, null derefs
4. Security — injection, XSS, credential exposure, unsafe deserialization
5. Test gaps — what should be tested that isn't?
6. Maintainability — will this be clear in 6 months?

You are NOT a style checker. Only flag real problems that affect correctness, security, or maintainability.

Respond with a JSON object matching this exact schema:
{
  "summary": "2-3 sentence overall assessment",
  "severity": "low | medium | high | critical",
  "confidence": 0.0-1.0,
  "findings": [
    {
      "type": "bug | security | performance | maintainability | test_gap | architecture",
      "severity": "low | medium | high | critical",
      "title": "short title",
      "file": "path/to/file",
      "line_start": 1,
      "line_end": 1,
      "explanation": "detailed explanation of the issue",
      "suggested_fix": "optional concrete fix",
      "confidence": 0.0-1.0
    }
  ],
  "merge_blocking": true/false,
  "needs_human_attention": true/false
}

If the code is clean, return an empty findings array with a positive summary.
Output ONLY the JSON object, no markdown fences.`

const CRITIQUE_SYSTEM = `You are a principal engineer reviewing another engineer's code review findings.

For each finding from the other reviewer:
1. If you agree, acknowledge it and explain why it matters
2. If you disagree, explain specifically why with code references
3. Identify any issues they missed entirely

You MUST acknowledge the strongest points from the other review, even if you disagree with others.

Respond with a JSON object:
{
  "agreed_findings": ["description of each finding you agree with"],
  "disputed_findings": [{"finding": "what they said", "reason": "why you disagree"}],
  "missed_issues": [same schema as review findings above],
  "overall_assessment": "your synthesis",
  "revised_severity": "low | medium | high | critical"
}

Output ONLY the JSON object, no markdown fences.`

export class AnthropicClient implements ModelClient {
  name = "anthropic" as const
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async review(req: ReviewRequest): Promise<{ review: ModelReview; usage: TokenUsage }> {
    const contextBlock = buildContextBlock(req)

    const response = await this.call(
      REVIEW_SYSTEM,
      `Review this pull request:\n\n${contextBlock}\n\n${req.userPrompt}`
    )

    const parsed = parseModelReview(response.text)
    return {
      review: normalizeReview(parsed, "anthropic"),
      usage: response.usage,
    }
  }

  async critique(req: CritiqueRequest): Promise<{ critique: CritiqueOutput; usage: TokenUsage }> {
    const findingsJson = JSON.stringify(req.otherModelReview, null, 2)

    const response = await this.call(
      CRITIQUE_SYSTEM,
      `Here are the findings from another code reviewer:\n\n${findingsJson}\n\nCritique these findings. What did they get right? What did they get wrong? What did they miss?`
    )

    const parsed = parseCritiqueOutput(response.text)
    return {
      critique: {
        agreedFindings: parsed.agreed_findings,
        disputedFindings: parsed.disputed_findings,
        missedIssues: parsed.missed_issues.map((f) => normalizeFinding(f, "anthropic")),
        overallAssessment: parsed.overall_assessment,
        revisedSeverity: parsed.revised_severity,
      },
      usage: response.usage,
    }
  }

  async respondToCritique(req: CritiqueResponseRequest): Promise<{
    response: CritiqueResponse
    usage: TokenUsage
  }> {
    const critiqueJson = JSON.stringify(req.critique, null, 2)
    const originalJson = JSON.stringify(req.originalReview, null, 2)

    const response = await this.call(
      REVIEW_SYSTEM,
      `Your original review:\n${originalJson}\n\nA senior reviewer critiqued your findings:\n${critiqueJson}\n\nRespond to the critique. Accept valid points. Defend findings you believe are correct. Output revised findings.`
    )

    const text = response.text
    let parsed
    try {
      parsed = parseCritiqueResponse(text)
    } catch {
      return {
        response: {
          accepted: [],
          disputed: [],
          revisedFindings: req.originalReview.findings,
          finalSummary: text.substring(0, 500),
        },
        usage: response.usage,
      }
    }

    return {
      response: {
        accepted: parsed.accepted,
        disputed: parsed.disputed,
        revisedFindings: parsed.revised_findings.map((f) => normalizeFinding(f, "anthropic")),
        finalSummary: parsed.final_summary,
      },
      usage: response.usage,
    }
  }

  async chat(system: string, user: string): Promise<{ text: string; usage: TokenUsage }> {
    return this.call(system, user)
  }

  private async call(
    system: string,
    user: string,
    retries = 1
  ): Promise<{ text: string; usage: TokenUsage }> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
        })

        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")

        return {
          text,
          usage: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        }
      } catch (err: unknown) {
        const isRetryable = err instanceof Error && ("status" in err) &&
          [429, 500, 529].includes((err as { status: number }).status)

        if (attempt < retries && isRetryable) {
          core.warning(`Anthropic call failed (attempt ${attempt + 1}), retrying...`)
          await sleep(2000 * (attempt + 1))
          continue
        }
        throw err
      }
    }

    throw new Error("Anthropic call exhausted retries")
  }
}

function buildContextBlock(req: ReviewRequest): string {
  const parts: string[] = []
  const ctx = req.context

  if (ctx.repoPolicies.reviewRulesMarkdown) {
    parts.push(`## Repository Review Rules\n${ctx.repoPolicies.reviewRulesMarkdown}`)
  }
  if (ctx.repoPolicies.architectureNotes) {
    parts.push(`## Architecture Notes\n${ctx.repoPolicies.architectureNotes}`)
  }

  return parts.join("\n\n")
}

function normalizeReview(
  parsed: ReturnType<typeof parseModelReview>,
  source: "anthropic" | "openai"
): ModelReview {
  return {
    summary: parsed.summary,
    severity: parsed.severity,
    confidence: parsed.confidence,
    findings: parsed.findings.map((f) => normalizeFinding(f, source)),
    mergeBlocking: parsed.merge_blocking,
    needsHumanAttention: parsed.needs_human_attention,
  }
}

function normalizeFinding(
  f: { type: string; severity: string; title: string; file: string; line_start?: number; line_end?: number; explanation: string; suggested_fix?: string; confidence: number },
  source: "anthropic" | "openai"
): ReviewFinding {
  return {
    type: f.type as ReviewFinding["type"],
    severity: f.severity as ReviewFinding["severity"],
    title: f.title,
    file: f.file,
    lineStart: f.line_start,
    lineEnd: f.line_end,
    explanation: f.explanation,
    suggestedFix: f.suggested_fix,
    confidence: f.confidence,
    source,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

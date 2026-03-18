import OpenAI from "openai"
import * as core from "@actions/core"
import type { ModelClient, ReviewRequest, CritiqueRequest, CritiqueResponseRequest } from "./types"
import type { ModelReview, CritiqueOutput, CritiqueResponse, ReviewFinding, TokenUsage } from "../types"
import { parseModelReview, parseCritiqueOutput, parseCritiqueResponse } from "../schemas/review"

const REVIEW_SYSTEM = `You are a repo-aware implementation engineer reviewing code changes. You are precise, concrete, and focused on correctness at the code level.

Your priorities:
1. Concrete bugs — specific lines with specific problems
2. Input validation — missing checks, unhandled errors, boundary conditions
3. Type safety — incorrect types, unsafe casts, missing null checks
4. Resource handling — unclosed connections, memory leaks, missing cleanup
5. Test coverage — specific test cases that should exist for this change
6. Convention violations — does this match the rest of the codebase?

Focus on code-level specifics, not high-level architecture. Be precise about file paths and line numbers.

Respond with a JSON object matching this exact schema:
{
  "summary": "2-3 sentence code-level assessment",
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
      "explanation": "detailed explanation with code reference",
      "suggested_fix": "concrete code fix",
      "confidence": 0.0-1.0
    }
  ],
  "merge_blocking": true/false,
  "needs_human_attention": true/false
}

If the code is clean, return an empty findings array with a positive summary.
Output ONLY the JSON object, no markdown fences.`

const CRITIQUE_RESPONSE_SYSTEM = `You are an implementation engineer responding to a senior reviewer's critique of your code review.

For each critique:
1. If they're right, accept it explicitly
2. If you disagree, provide a specific rebuttal with code references
3. Update your findings list based on valid critiques

You MUST accept valid critiques. Do not be defensive.

Respond with a JSON object:
{
  "accepted": ["description of each accepted critique"],
  "disputed": [{"critique": "what they said", "rebuttal": "your specific rebuttal"}],
  "revised_findings": [same schema as review findings — your FINAL revised list],
  "final_summary": "updated assessment incorporating valid critiques"
}

Output ONLY the JSON object, no markdown fences.`

export class OpenAIClient implements ModelClient {
  name = "openai" as const
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey })
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
      review: normalizeReview(parsed, "openai"),
      usage: response.usage,
    }
  }

  async critique(req: CritiqueRequest): Promise<{ critique: CritiqueOutput; usage: TokenUsage }> {
    const findingsJson = JSON.stringify(req.otherModelReview, null, 2)

    const response = await this.call(
      REVIEW_SYSTEM,
      `Here are findings from another reviewer:\n\n${findingsJson}\n\nCritique these findings. What's correct? What's wrong? What's missing?\n\nRespond as JSON: {"agreed_findings":[],"disputed_findings":[{"finding":"","reason":""}],"missed_issues":[],"overall_assessment":"","revised_severity":""}`
    )

    const parsed = parseCritiqueOutput(response.text)
    return {
      critique: {
        agreedFindings: parsed.agreed_findings,
        disputedFindings: parsed.disputed_findings,
        missedIssues: parsed.missed_issues.map((f) => normalizeFinding(f, "openai")),
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
      CRITIQUE_RESPONSE_SYSTEM,
      `Your original review:\n${originalJson}\n\nA senior reviewer critiqued your findings:\n${critiqueJson}\n\nRespond to the critique.`
    )

    let parsed
    try {
      parsed = parseCritiqueResponse(response.text)
    } catch {
      return {
        response: {
          accepted: [],
          disputed: [],
          revisedFindings: req.originalReview.findings,
          finalSummary: response.text.substring(0, 500),
        },
        usage: response.usage,
      }
    }

    return {
      response: {
        accepted: parsed.accepted,
        disputed: parsed.disputed,
        revisedFindings: parsed.revised_findings.map((f) => normalizeFinding(f, "openai")),
        finalSummary: parsed.final_summary,
      },
      usage: response.usage,
    }
  }

  async chat(system: string, user: string): Promise<{ text: string; usage: import("../types").TokenUsage }> {
    return this.call(system, user)
  }

  private async call(
    system: string,
    user: string,
    retries = 1
  ): Promise<{ text: string; usage: TokenUsage }> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 4096,
          temperature: 0.1,
          response_format: { type: "json_object" },
        })

        const text = response.choices[0]?.message?.content || ""
        return {
          text,
          usage: {
            input: response.usage?.prompt_tokens || 0,
            output: response.usage?.completion_tokens || 0,
          },
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        const isRetryable = status === 429 || status === 500 || status === 503

        if (attempt < retries && isRetryable) {
          core.warning(`OpenAI call failed (attempt ${attempt + 1}), retrying...`)
          await sleep(2000 * (attempt + 1))
          continue
        }
        throw err
      }
    }

    throw new Error("OpenAI call exhausted retries")
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

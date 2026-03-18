import { z } from "zod"

export const FindingSeveritySchema = z.enum(["low", "medium", "high", "critical"])

export const FindingTypeSchema = z.enum([
  "bug",
  "security",
  "performance",
  "maintainability",
  "test_gap",
  "architecture",
])

export const ReviewFindingSchema = z.object({
  type: FindingTypeSchema,
  severity: FindingSeveritySchema,
  title: z.string(),
  file: z.string(),
  line_start: z.number().optional(),
  line_end: z.number().optional(),
  explanation: z.string(),
  suggested_fix: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

export const ModelReviewSchema = z.object({
  summary: z.string(),
  severity: FindingSeveritySchema,
  confidence: z.number().min(0).max(1),
  findings: z.array(ReviewFindingSchema),
  merge_blocking: z.boolean(),
  needs_human_attention: z.boolean(),
})

export const CritiqueOutputSchema = z.object({
  agreed_findings: z.array(z.string()),
  disputed_findings: z.array(
    z.object({ finding: z.string(), reason: z.string() })
  ),
  missed_issues: z.array(ReviewFindingSchema),
  overall_assessment: z.string(),
  revised_severity: FindingSeveritySchema,
})

export const CritiqueResponseSchema = z.object({
  accepted: z.array(z.string()),
  disputed: z.array(
    z.object({ critique: z.string(), rebuttal: z.string() })
  ),
  revised_findings: z.array(ReviewFindingSchema),
  final_summary: z.string(),
})

export function parseModelReview(raw: string): z.infer<typeof ModelReviewSchema> {
  const json = extractJson(raw)
  return ModelReviewSchema.parse(json)
}

export function parseCritiqueOutput(raw: string): z.infer<typeof CritiqueOutputSchema> {
  const json = extractJson(raw)
  return CritiqueOutputSchema.parse(json)
}

export function parseCritiqueResponse(raw: string): z.infer<typeof CritiqueResponseSchema> {
  const json = extractJson(raw)
  return CritiqueResponseSchema.parse(json)
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON object found in model response")
  return JSON.parse(match[0])
}

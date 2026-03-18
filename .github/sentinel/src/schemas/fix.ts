import { z } from "zod"

export const FileChangeSchema = z.object({
  path: z.string(),
  action: z.enum(["modify", "create", "delete"]),
  changes: z
    .array(z.object({ search: z.string(), replace: z.string() }))
    .optional(),
  content: z.string().optional(),
  explanation: z.string(),
})

export const FixPlanSchema = z.object({
  analysis: z.string(),
  fixable: z.boolean(),
  confidence: z.number().min(0).max(1),
  files: z.array(FileChangeSchema),
  commit_message: z.string(),
  test_suggestions: z.array(z.string()),
  risk_notes: z.array(z.string()),
})

export const FixReviewSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1),
  concerns: z.array(z.string()),
  verdict: z.string(),
})

export function parseFixPlan(raw: string): z.infer<typeof FixPlanSchema> {
  const json = extractJson(raw)
  return FixPlanSchema.parse(json)
}

export function parseFixReview(raw: string): z.infer<typeof FixReviewSchema> {
  const json = extractJson(raw)
  return FixReviewSchema.parse(json)
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON object found in model response")
  return JSON.parse(match[0])
}

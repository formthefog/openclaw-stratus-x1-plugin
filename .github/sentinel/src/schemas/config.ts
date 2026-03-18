import { z } from "zod"

export const SentinelConfigSchema = z.object({
  mode: z
    .enum([
      "review",
      "review_and_suggest",
      "review_and_patch",
      "issue_triage",
      "issue_fix",
      "manual_only",
    ])
    .default("review"),

  models: z
    .object({
      anthropic: z
        .object({
          enabled: z.boolean().default(true),
          model: z.string().default("claude-sonnet-4-20250514"),
        })
        .default({}),
      openai: z
        .object({
          enabled: z.boolean().default(true),
          model: z.string().default("gpt-4o"),
        })
        .default({}),
    })
    .default({}),

  trigger: z
    .object({
      require_label: z.string().default("agent"),  // set to "" to run on every PR/issue
      respond_to_mentions: z.boolean().default(true),
      respond_to_replies: z.boolean().default(true),
      bot_name: z.string().default("sentinel"),
    })
    .default({}),

  review: z
    .object({
      max_files: z.number().default(50),
      max_patch_chars: z.number().default(200_000),
      comment_style: z.enum(["concise", "comprehensive"]).default("comprehensive"),
      inline_comments: z.boolean().default(true),
      severity_threshold: z
        .enum(["low", "medium", "high", "critical"])
        .default("medium"),
      summary_on_clean: z.boolean().default(false),
    })
    .default({}),

  fix: z
    .object({
      mode: z.enum(["propose_only", "propose_and_pr", "yolo"]).default("propose_and_pr"),
      confidence_threshold: z.number().min(0).max(1).default(0.7),
      max_retry_count: z.number().default(2),
      create_draft_pr: z.boolean().default(true),
    })
    .default({}),

  security: z
    .object({
      restricted_paths: z
        .array(z.string())
        .default([
          ".github/workflows/**",
          "infra/**",
          "auth/**",
          "payments/**",
        ]),
      block_fork_mutation: z.boolean().default(true),
    })
    .default({}),

  validation: z
    .object({
      commands: z.array(z.string()).default([]),
    })
    .default({}),
})

export type SentinelConfig = z.infer<typeof SentinelConfigSchema>

import * as core from "@actions/core"
import * as github from "@actions/github"
import * as fs from "fs"
import { parse as parseYaml } from "yaml"
import { SentinelConfigSchema, type SentinelConfig } from "./schemas/config"
import type { RepoPolicies, ReviewMode, FindingSeverity, FixMode } from "./types"

type Octokit = ReturnType<typeof github.getOctokit>

export async function loadPolicies(
  octokit: Octokit,
  configPath: string,
  modeOverride?: string
): Promise<RepoPolicies> {
  const raw = await loadConfigFile(octokit, configPath)
  const config = parseConfig(raw)

  const mode = (modeOverride as ReviewMode) || config.mode
  const anthropicModel = core.getInput("anthropic_model") || config.models.anthropic.model
  const openaiModel = core.getInput("openai_model") || config.models.openai.model
  const botNameInput = core.getInput("bot_name")
  const fixModeInput = core.getInput("fix_mode")
  const triggerLabelInput = core.getInput("trigger_label", { required: false, trimWhitespace: true })
  const triggerLabelProvided = triggerLabelInput !== ""

  return {
    mode,
    autoFixEnabled: config.fix.mode !== "propose_only",
    restrictedPaths: config.security.restricted_paths,
    testCommands: config.validation.commands,
    maxFiles: config.review.max_files,
    maxPatchChars: config.review.max_patch_chars,
    reviewRulesMarkdown: undefined,
    architectureNotes: undefined,
    severityThreshold: config.review.severity_threshold as FindingSeverity,
    blockForkMutation: config.security.block_fork_mutation,
    inlineComments: config.review.inline_comments,
    commentStyle: config.review.comment_style,
    models: {
      anthropic: { enabled: config.models.anthropic.enabled, model: anthropicModel },
      openai: { enabled: config.models.openai.enabled, model: openaiModel },
    },
    trigger: {
      requireLabel: triggerLabelProvided ? triggerLabelInput : config.trigger.require_label,
      respondToMentions: config.trigger.respond_to_mentions,
      respondToReplies: config.trigger.respond_to_replies,
      botName: botNameInput || config.trigger.bot_name,
    },
    fix: {
      mode: (fixModeInput as FixMode) || config.fix.mode,
      confidenceThreshold: config.fix.confidence_threshold,
      createDraftPr: config.fix.create_draft_pr,
      maxRetryCount: config.fix.max_retry_count,
    },
    review: {
      summaryOnClean: config.review.summary_on_clean,
    },
  }
}

export function evaluateTrust(ctx: {
  actor: string
  isFork: boolean
  policies: RepoPolicies
}): { trusted: boolean; canMutate: boolean; reason: string } {
  if (ctx.isFork && ctx.policies.blockForkMutation) {
    return { trusted: false, canMutate: false, reason: "Fork PR — mutation blocked by policy" }
  }

  if (ctx.policies.mode === "manual_only") {
    return { trusted: true, canMutate: false, reason: "Manual-only mode — review permitted, mutation requires command" }
  }

  return { trusted: true, canMutate: ctx.policies.autoFixEnabled, reason: "Trusted actor" }
}

export function isRestrictedPath(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(filePath, pattern)) return true
  }
  return false
}

async function loadConfigFile(
  octokit: Octokit,
  configPath: string
): Promise<Record<string, unknown> | null> {
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf-8")
      return parseYaml(content) as Record<string, unknown>
    } catch (err) {
      core.warning(`Failed to parse local config at ${configPath}: ${err}`)
    }
  }

  try {
    const { owner, repo } = github.context.repo
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: configPath,
    })
    if ("content" in data && data.content) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8")
      return parseYaml(decoded) as Record<string, unknown>
    }
  } catch {
    core.info(`No config file found at ${configPath} — using defaults`)
  }

  return null
}

function parseConfig(raw: Record<string, unknown> | null): SentinelConfig {
  if (!raw) return SentinelConfigSchema.parse({})

  try {
    return SentinelConfigSchema.parse(raw)
  } catch (err) {
    core.warning(`Config validation failed, using defaults: ${err}`)
    return SentinelConfigSchema.parse({})
  }
}

function matchGlob(path: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*")
  return new RegExp(`^${regex}$`).test(path)
}

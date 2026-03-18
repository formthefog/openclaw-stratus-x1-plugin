import * as core from "@actions/core"
import * as github from "@actions/github"
import type { ActionType, EventType, SlashCommand, RoutedEvent, ReviewContext, RepoPolicies, ResponseContext } from "./types"

const SLASH_COMMANDS = ["review", "fix", "triage", "plan", "explain", "retry", "ignore", "security-review", "tests"]
const BOT_MARKER = "Sentinel"
const TRUSTED_ASSOCIATIONS = ["MEMBER", "OWNER", "COLLABORATOR"]

export function routeEvent(policies: RepoPolicies): RoutedEvent {
  const { context } = github
  const eventName = context.eventName
  const action = context.payload.action || ""
  const actor = context.actor

  const pr = context.payload.pull_request
  const isFork = pr ? pr.head?.repo?.full_name !== context.payload.repository?.full_name : false
  const authorAssociation = (context.payload.comment?.author_association as string) || undefined

  core.info(`Routing event: ${eventName} / ${action} from ${actor} (assoc=${authorAssociation || "N/A"}, fork=${isFork})`)

  const baseContext: ReviewContext = {
    repository: {
      owner: context.repo.owner,
      name: context.repo.repo,
      defaultBranch: context.payload.repository?.default_branch || "main",
    },
    event: {
      type: mapEventType(eventName),
      action,
      actor,
      trustedActor: TRUSTED_ASSOCIATIONS.includes(authorAssociation || ""),
      isFork,
      authorAssociation,
    },
    repoPolicies: policies,
  }

  if (eventName === "pull_request") {
    return routePullRequest(baseContext, action, policies)
  }

  if (eventName === "issues") {
    return routeIssue(baseContext, action, policies)
  }

  if (eventName === "issue_comment") {
    return routeComment(baseContext, policies)
  }

  if (eventName === "pull_request_review_comment") {
    return routeReviewComment(baseContext, policies)
  }

  if (eventName === "workflow_dispatch") {
    return { actionType: "pr_review", context: baseContext }
  }

  core.info(`Unhandled event: ${eventName}`)
  return { actionType: "noop", context: baseContext }
}

// ── Pull Request Events ──

function routePullRequest(ctx: ReviewContext, action: string, policies: RepoPolicies): RoutedEvent {
  const pr = github.context.payload.pull_request
  if (!pr) return { actionType: "noop", context: ctx }

  const labels: string[] = (pr.labels || []).map((l: { name: string }) => l.name)

  const labelGateEnabled = policies.trigger.requireLabel !== ""

  if (action === "labeled") {
    if (labelGateEnabled) {
      const addedLabel = github.context.payload.label?.name || ""
      if (addedLabel.toLowerCase() !== policies.trigger.requireLabel.toLowerCase()) {
        return { actionType: "noop", context: ctx }
      }
    }
  } else if (["opened", "synchronize", "reopened"].includes(action)) {
    if (labelGateEnabled && !hasLabel(labels, policies.trigger.requireLabel)) {
      core.info(`PR #${pr.number} missing "${policies.trigger.requireLabel}" label — skipping`)
      return { actionType: "noop", context: ctx }
    }
  } else {
    return { actionType: "noop", context: ctx }
  }

  ctx.pullRequest = {
    number: pr.number,
    title: pr.title || "",
    body: pr.body || "",
    baseRef: pr.base?.ref || "main",
    headRef: pr.head?.ref || "",
    labels,
    changedFiles: [],
  }

  return { actionType: "pr_review", context: ctx }
}

// ── Issue Events ──

function routeIssue(ctx: ReviewContext, action: string, policies: RepoPolicies): RoutedEvent {
  const issue = github.context.payload.issue
  if (!issue) return { actionType: "noop", context: ctx }

  const labels: string[] = (issue.labels || []).map((l: { name: string }) => l.name)

  const labelGateEnabled = policies.trigger.requireLabel !== ""

  if (action === "labeled") {
    if (labelGateEnabled) {
      const addedLabel = github.context.payload.label?.name || ""
      if (addedLabel.toLowerCase() !== policies.trigger.requireLabel.toLowerCase()) {
        return { actionType: "noop", context: ctx }
      }
    }
  } else if (action === "opened") {
    if (labelGateEnabled && !hasLabel(labels, policies.trigger.requireLabel)) {
      core.info(`Issue #${issue.number} missing "${policies.trigger.requireLabel}" label — skipping`)
      return { actionType: "noop", context: ctx }
    }
  } else {
    return { actionType: "noop", context: ctx }
  }

  ctx.issue = {
    number: issue.number,
    title: issue.title || "",
    body: issue.body || "",
    labels,
  }

  return { actionType: "issue_fix", context: ctx }
}

// ── Issue / PR Comment Events ──

function routeComment(ctx: ReviewContext, policies: RepoPolicies): RoutedEvent {
  const comment = github.context.payload.comment
  const issue = github.context.payload.issue
  if (!comment || !issue) return { actionType: "noop", context: ctx }

  if (!ctx.event.trustedActor) {
    core.info(`Ignoring comment from untrusted actor ${ctx.event.actor} (association: ${ctx.event.authorAssociation || "NONE"})`)
    return { actionType: "noop", context: ctx }
  }

  const body = (comment.body || "").trim()
  const isPR = !!issue.pull_request
  const labels: string[] = (issue.labels || []).map((l: { name: string }) => l.name)
  const hasAgentLabel = hasLabel(labels, policies.trigger.requireLabel)
  const botName = policies.trigger.botName

  const slashCommand = parseSlashCommand(body, ctx.event.actor, issue.number, isPR)
  if (slashCommand) {
    const actionType = resolveCommandAction(slashCommand, isPR)
    attachIssueOrPR(ctx, issue, isPR)
    return { actionType, context: ctx, slashCommand }
  }

  const mentioned = isMentioned(body, botName)
  if (mentioned) {
    attachIssueOrPR(ctx, issue, isPR)
    const actionType = isPR ? "pr_review" : "issue_fix"
    core.info(`@${botName} mentioned in comment on ${isPR ? "PR" : "issue"} #${issue.number}`)
    return { actionType, context: ctx }
  }

  if (policies.trigger.respondToReplies && hasAgentLabel) {
    const isReplyToBot = isBotComment(comment.body, body)
    if (isReplyToBot) {
      attachIssueOrPR(ctx, issue, isPR)
      const responseContext: ResponseContext = {
        parentCommentBody: "",
        replyBody: body,
        commentId: comment.id,
        isPRReviewComment: false,
      }
      return { actionType: "respond", context: ctx, responseContext }
    }
  }

  return { actionType: "noop", context: ctx }
}

// ── PR Review Comment Events (reply detection) ──

function routeReviewComment(ctx: ReviewContext, policies: RepoPolicies): RoutedEvent {
  const comment = github.context.payload.comment
  const pr = github.context.payload.pull_request
  if (!comment || !pr) return { actionType: "noop", context: ctx }

  if (!ctx.event.trustedActor) {
    core.info(`Ignoring review comment from untrusted actor ${ctx.event.actor} (association: ${ctx.event.authorAssociation || "NONE"})`)
    return { actionType: "noop", context: ctx }
  }

  const body = (comment.body || "").trim()
  const botName = policies.trigger.botName
  const inReplyToId = comment.in_reply_to_id

  ctx.pullRequest = {
    number: pr.number,
    title: pr.title || "",
    body: pr.body || "",
    baseRef: pr.base?.ref || "main",
    headRef: pr.head?.ref || "",
    labels: (pr.labels || []).map((l: { name: string }) => l.name),
    changedFiles: [],
  }

  if (isMentioned(body, botName)) {
    core.info(`@${botName} mentioned in review comment on PR #${pr.number}`)
    return { actionType: "pr_review", context: ctx }
  }

  if (policies.trigger.respondToReplies && inReplyToId) {
    const responseContext: ResponseContext = {
      parentCommentBody: "",
      replyBody: body,
      commentId: comment.id,
      isPRReviewComment: true,
    }
    return { actionType: "respond", context: ctx, responseContext }
  }

  return { actionType: "noop", context: ctx }
}

// ── Helpers ──

function hasLabel(labels: string[], target: string): boolean {
  return labels.some((l) => l.toLowerCase() === target.toLowerCase())
}

function isMentioned(body: string, botName: string): boolean {
  return body.toLowerCase().includes(`@${botName.toLowerCase()}`)
}

function isBotComment(_commentBody: string, _body: string): boolean {
  return false
}

function attachIssueOrPR(
  ctx: ReviewContext,
  issue: { number: number; title?: string; body?: string; labels?: Array<{ name: string }>; pull_request?: unknown },
  isPR: boolean
): void {
  if (isPR) {
    ctx.pullRequest = {
      number: issue.number,
      title: issue.title || "",
      body: issue.body || "",
      baseRef: "",
      headRef: "",
      labels: (issue.labels || []).map((l: { name: string }) => l.name),
      changedFiles: [],
    }
  } else {
    ctx.issue = {
      number: issue.number,
      title: issue.title || "",
      body: issue.body || "",
      labels: (issue.labels || []).map((l: { name: string }) => l.name),
    }
  }
}

function parseSlashCommand(body: string, actor: string, issueNumber: number, isPR: boolean): SlashCommand | undefined {
  const match = body.match(/^\/bot\s+(\S+)(.*)$/m)
  if (!match) return undefined

  const command = match[1].toLowerCase()
  if (!SLASH_COMMANDS.includes(command)) return undefined

  const args = match[2].trim().split(/\s+/).filter(Boolean)
  return { command, args, actor, issueNumber, isPR }
}

function resolveCommandAction(cmd: SlashCommand, isPR: boolean): ActionType {
  switch (cmd.command) {
    case "review":
      return isPR ? "pr_review" : "noop"
    case "fix":
      return isPR ? "pr_fix" : "issue_fix"
    case "triage":
      return "issue_triage"
    case "plan":
    case "explain":
      return isPR ? "pr_review" : "issue_triage"
    case "security-review":
    case "tests":
      return isPR ? "pr_review" : "noop"
    case "ignore":
    case "retry":
    default:
      return "noop"
  }
}

function mapEventType(eventName: string): EventType {
  if (eventName === "pull_request") return "pull_request"
  if (eventName === "issues") return "issue"
  if (eventName === "issue_comment") return "issue_comment"
  if (eventName === "pull_request_review_comment") return "pull_request_review_comment"
  return "issue_comment"
}

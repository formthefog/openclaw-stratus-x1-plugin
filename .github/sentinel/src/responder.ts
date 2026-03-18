import * as core from "@actions/core"
import * as github from "@actions/github"
import type { ModelClient } from "./models/types"
import type { ReviewContext, ResponseContext } from "./types"

type Octokit = ReturnType<typeof github.getOctokit>

const RESPOND_SYSTEM = `You are Sentinel, an AI code review bot responding to a developer's question or comment about a code review finding.

Guidelines:
1. If they point out your finding was wrong, acknowledge it clearly
2. If they ask for clarification, provide specific code-level detail
3. If they ask you to fix something, describe the fix precisely
4. If they disagree, engage constructively with their reasoning
5. Be concise and direct — developers don't want fluff
6. Reference specific files and line numbers when relevant

Do NOT output JSON. Respond in plain markdown as a conversation reply.`

export async function handleResponse(
  ctx: ReviewContext,
  responseContext: ResponseContext,
  model: ModelClient,
  octokit: Octokit
): Promise<void> {
  const { owner, repo } = github.context.repo
  const parentBody = await resolveParentComment(octokit, responseContext)

  const contextParts: string[] = []

  if (parentBody) {
    contextParts.push(`## Original Sentinel Comment\n${parentBody}`)
  }

  if (ctx.pullRequest) {
    contextParts.push(`## PR Context\nPR #${ctx.pullRequest.number}: ${ctx.pullRequest.title}\n${ctx.pullRequest.body || ""}`)
  }

  if (ctx.issue) {
    contextParts.push(`## Issue Context\nIssue #${ctx.issue.number}: ${ctx.issue.title}\n${ctx.issue.body || ""}`)
  }

  const prompt = [
    ...contextParts,
    "",
    "## Developer's Comment",
    responseContext.replyBody,
  ].join("\n\n")

  core.info("Generating response to developer comment")

  const result = await model.chat(RESPOND_SYSTEM, prompt)
  const responseBody = formatResponse(result.text)

  if (responseContext.isPRReviewComment) {
    await replyToReviewComment(octokit, responseContext.commentId, responseBody)
  } else {
    const issueNumber = ctx.pullRequest?.number || ctx.issue?.number
    if (issueNumber) {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: responseBody,
      })
    }
  }

  core.info("Response posted")
}

async function resolveParentComment(
  octokit: Octokit,
  responseContext: ResponseContext
): Promise<string> {
  if (responseContext.parentCommentBody) {
    return responseContext.parentCommentBody
  }

  const { owner, repo } = github.context.repo

  if (responseContext.isPRReviewComment) {
    const inReplyToId = github.context.payload.comment?.in_reply_to_id
    if (inReplyToId) {
      try {
        const { data: parent } = await octokit.rest.pulls.getReviewComment({
          owner,
          repo,
          comment_id: inReplyToId,
        })
        return parent.body || ""
      } catch {
        core.debug(`Could not fetch parent review comment ${inReplyToId}`)
      }
    }
  } else {
    const issueNumber = github.context.payload.issue?.number
    if (issueNumber) {
      try {
        const { data: comments } = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: issueNumber,
          per_page: 10,
        })

        for (let i = comments.length - 1; i >= 0; i--) {
          if (comments[i].body?.includes("Sentinel") && comments[i].id !== responseContext.commentId) {
            return comments[i].body || ""
          }
        }
      } catch {
        core.debug("Could not fetch previous comments")
      }
    }
  }

  return ""
}

async function replyToReviewComment(
  octokit: Octokit,
  commentId: number,
  body: string
): Promise<void> {
  const { owner, repo } = github.context.repo
  const prNumber = github.context.payload.pull_request?.number

  if (!prNumber) {
    core.warning("No PR number for review comment reply")
    return
  }

  try {
    await octokit.rest.pulls.createReplyForReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      comment_id: commentId,
      body,
    })
  } catch (err) {
    core.warning(`Could not reply to review comment, posting as issue comment: ${err}`)
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })
  }
}

function formatResponse(text: string): string {
  const cleaned = text.trim()
  return `${cleaned}\n\n---\n*Sentinel*`
}

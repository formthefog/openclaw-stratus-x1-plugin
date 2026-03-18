import * as core from "@actions/core"
import * as github from "@actions/github"
import type { ReviewContext, ChangedFile, RepoPolicies } from "./types"

type Octokit = ReturnType<typeof github.getOctokit>

export async function buildPRContext(
  ctx: ReviewContext,
  octokit: Octokit
): Promise<ReviewContext> {
  if (!ctx.pullRequest) return ctx

  const { owner, name } = ctx.repository
  const prNumber = ctx.pullRequest.number

  const [files, prDetail, ciStatus] = await Promise.all([
    fetchChangedFiles(octokit, owner, name, prNumber, ctx.repoPolicies),
    fetchPRDetail(octokit, owner, name, prNumber),
    fetchCIStatus(octokit, owner, name, ctx.pullRequest.headRef),
  ])

  ctx.pullRequest.changedFiles = files
  ctx.pullRequest.body = prDetail.body || ctx.pullRequest.body
  ctx.pullRequest.baseRef = prDetail.baseRef || ctx.pullRequest.baseRef
  ctx.pullRequest.headRef = prDetail.headRef || ctx.pullRequest.headRef
  ctx.pullRequest.ciStatus = ciStatus
  ctx.event.trustedActor = !prDetail.isFork

  const [reviewRules, architectureNotes] = await Promise.all([
    fetchFileContent(octokit, owner, name, ".github/review-rules.md"),
    fetchFileContent(octokit, owner, name, ".github/architecture-notes.md"),
  ])

  if (reviewRules) ctx.repoPolicies.reviewRulesMarkdown = reviewRules
  if (architectureNotes) ctx.repoPolicies.architectureNotes = architectureNotes

  core.info(`Context built: ${files.length} files, fork=${prDetail.isFork}, ci=${ciStatus || "unknown"}`)
  return ctx
}

export async function buildIssueContext(
  ctx: ReviewContext,
  octokit: Octokit
): Promise<ReviewContext> {
  if (!ctx.issue) return ctx

  const { owner, name } = ctx.repository
  const comments = await fetchIssueComments(octokit, owner, name, ctx.issue.number)
  ctx.issue.comments = comments

  return ctx
}

async function fetchChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  policies: RepoPolicies
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = []

  try {
    const response = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    })

    let totalPatchChars = 0

    for (const file of response.data) {
      if (files.length >= policies.maxFiles) {
        core.warning(`Truncated at ${policies.maxFiles} files (policy limit)`)
        break
      }

      const patchLen = file.patch?.length || 0
      if (totalPatchChars + patchLen > policies.maxPatchChars) {
        core.warning(`Truncated patch content at ${policies.maxPatchChars} chars`)
        files.push({
          path: file.filename,
          status: mapFileStatus(file.status),
          additions: file.additions,
          deletions: file.deletions,
        })
        continue
      }

      totalPatchChars += patchLen
      files.push({
        path: file.filename,
        patch: file.patch,
        status: mapFileStatus(file.status),
        additions: file.additions,
        deletions: file.deletions,
      })
    }
  } catch (err) {
    core.warning(`Failed to fetch changed files: ${err}`)
  }

  return files
}

async function fetchPRDetail(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ body: string; baseRef: string; headRef: string; isFork: boolean }> {
  try {
    const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    return {
      body: data.body || "",
      baseRef: data.base.ref,
      headRef: data.head.ref,
      isFork: data.head.repo?.fork ?? false,
    }
  } catch {
    return { body: "", baseRef: "main", headRef: "", isFork: false }
  }
}

async function fetchCIStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<string | undefined> {
  if (!ref) return undefined
  try {
    const { data } = await octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref })
    return data.state
  } catch {
    return undefined
  }
}

async function fetchIssueComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<string[]> {
  try {
    const { data } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 20,
    })
    return data.map((c) => c.body || "").filter(Boolean)
  } catch {
    return []
  }
}

async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path })
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8")
    }
  } catch {
    // file doesn't exist
  }
  return undefined
}

function mapFileStatus(status: string): ChangedFile["status"] {
  if (status === "added") return "added"
  if (status === "removed") return "removed"
  if (status === "renamed") return "renamed"
  return "modified"
}

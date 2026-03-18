import * as https from "https"
import * as http from "http"
import * as fs from "fs"
import * as path from "path"
import * as cp from "child_process"
import * as core from "@actions/core"
import type { SubwayContact, FinalDecision, FindingSeverity } from "./types"

const CONTACT_FILE = ".subway/pr-contact"
const DIRECT_CALL_MAX_AGE_MS = 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10_000
const SUBWAY_TRAILER = "Subway-Agent"

export interface SubwayNotifyContext {
  prNumber: number
  prUrl: string
  repo: string
  runUrl: string
  headSha: string
  prState: "open" | "closed" | "merged"
}

export interface SubwayPayload {
  pr_number: number
  pr_url: string
  repo: string
  head_sha: string
  pr_state: "open" | "closed" | "merged"
  action: string
  has_blockers: boolean
  findings_count: number
  critical: number
  high: number
  medium: number
  low: number
  quality_score: number
  model_agreement: number
  run_url: string
}

export function readPrContact(workspaceDir = process.cwd()): SubwayContact | null {
  try {
    const contactPath = path.join(workspaceDir, CONTACT_FILE)
    if (!fs.existsSync(contactPath)) return null
    const raw = fs.readFileSync(contactPath, "utf-8").trim()
    const parsed = JSON.parse(raw) as Partial<SubwayContact>
    if (!parsed.name || typeof parsed.name !== "string") {
      core.warning("Subway: .subway/pr-contact missing required 'name' field")
      return null
    }
    return {
      name: parsed.name,
      relay: parsed.relay ?? "relay.subway.dev",
      registered_at: parsed.registered_at ?? new Date(0).toISOString(),
      source: parsed.source ?? "cli",
    }
  } catch (err) {
    core.info(`Subway: could not read .subway/pr-contact — ${(err as Error).message}`)
    return null
  }
}

export function parseTrailerContact(msg: string): SubwayContact | null {
  for (const line of msg.split("\n").reverse()) {
    const match = line.match(new RegExp(`^${SUBWAY_TRAILER}:\\s*(.+)$`, "i"))
    if (match) {
      const name = match[1].trim()
      if (!name) continue
      return {
        name,
        relay: "relay.subway.dev",
        registered_at: new Date().toISOString(),
        source: "cli",
      }
    }
  }
  return null
}

export function readCommitContact(headSha = "HEAD"): SubwayContact | null {
  try {
    const result = cp.spawnSync("git", ["log", "-1", "--format=%B", headSha], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })

    if (result.error) {
      core.info(`Subway: git spawn failed — ${result.error.message}`)
      return null
    }
    if (result.status !== 0) {
      core.info(`Subway: git log failed — ${result.stderr?.trim() || "unknown error"}`)
      return null
    }

    const msg = (result.stdout ?? "").trim()
    const contact = parseTrailerContact(msg)
    if (contact) core.info(`Subway: found ${SUBWAY_TRAILER} trailer → ${contact.name}`)
    return contact
  } catch (err) {
    core.info(`Subway: could not read commit message — ${(err as Error).message}`)
    return null
  }
}

export function isContactFresh(contact: SubwayContact, maxAgeMs = DIRECT_CALL_MAX_AGE_MS): boolean {
  try {
    const registeredAt = new Date(contact.registered_at).getTime()
    if (isNaN(registeredAt)) return false
    return Date.now() - registeredAt < maxAgeMs
  } catch {
    return false
  }
}

function buildPayload(decision: FinalDecision, ctx: SubwayNotifyContext): SubwayPayload {
  const counts = countBySeverity(decision.findings)

  const qualityArtifact = computeQuality(decision)

  return {
    pr_number: ctx.prNumber,
    pr_url: ctx.prUrl,
    repo: ctx.repo,
    head_sha: ctx.headSha,
    pr_state: ctx.prState,
    action: decision.action,
    has_blockers: decision.action === "request_changes" || decision.action === "needs_human_review",
    findings_count: decision.findings.length,
    critical: counts.critical,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
    quality_score: qualityArtifact.quality_score,
    model_agreement: qualityArtifact.model_agreement,
    run_url: ctx.runUrl,
  }
}

function safeBroadcastTopic(repo: string, prNumber: number): string {
  const safeRepo = repo.replace(/[^a-zA-Z0-9]/g, ".")
  return `ci.sentinel.${safeRepo}.pr${prNumber}`
}

export async function notifySubwayAgent(
  contact: SubwayContact | null,
  decision: FinalDecision,
  ctx: SubwayNotifyContext,
  bridgeUrl: string
): Promise<void> {
  const payload = buildPayload(decision, ctx)
  const payloadJson = JSON.stringify(payload)
  const topic = safeBroadcastTopic(ctx.repo, ctx.prNumber)
  const base = bridgeUrl.replace(/\/$/, "")

  let directCallSucceeded = false

  if (contact && isContactFresh(contact)) {
    core.info(`Subway: agent contact found — ${contact.name} (registered ${contact.registered_at})`)
    try {
      await post(base + "/v1/call", JSON.stringify({
        to: contact.name,
        method: "ci_sentinel_result",
        payload: payloadJson,
      }))
      core.info(`Subway: direct call delivered to ${contact.name}`)
      directCallSucceeded = true
    } catch (err) {
      core.info(`Subway: direct call to ${contact.name} failed (${(err as Error).message}) — falling back to broadcast`)
    }
  } else if (contact) {
    core.info(`Subway: contact ${contact.name} is stale (registered ${contact.registered_at}) — broadcast only`)
  } else {
    core.info("Subway: no .subway/pr-contact — broadcast only")
  }

  try {
    await post(base + "/v1/broadcast", JSON.stringify({
      topic,
      message_type: "ci_sentinel_result",
      payload: payloadJson,
    }))
    core.info(`Subway: broadcast → ${topic}`)
  } catch (err) {
    if (!directCallSucceeded) {
      core.warning(`Subway: broadcast also failed — ${(err as Error).message}. Is the bridge reachable at ${base}?`)
    } else {
      core.info(`Subway: broadcast failed (${(err as Error).message}) but direct call succeeded`)
    }
  }
}

function post(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === "https:" ? https : http
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }

    const req = transport.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => { data += chunk })
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
        } else {
          resolve(data)
        }
      })
    })

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    })

    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

function countBySeverity(findings: { severity: FindingSeverity }[]): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) counts[f.severity]++
  return counts
}

function computeQuality(decision: FinalDecision): { quality_score: number; model_agreement: number } {
  const counts = countBySeverity(decision.findings)
  const penalties = counts.critical * 0.25 + counts.high * 0.15 + counts.medium * 0.05 + counts.low * 0.01
  const quality_score = Math.max(0, Math.min(1, 1.0 - penalties))

  let model_agreement = 1.0
  if (decision.anthropicReview && decision.openaiReview && decision.critique) {
    const agreed = decision.critique.agreedFindings.length
    const disputed = decision.critique.disputedFindings.length
    const total = agreed + disputed
    model_agreement = total > 0 ? agreed / total : 1.0
  }

  return { quality_score, model_agreement }
}

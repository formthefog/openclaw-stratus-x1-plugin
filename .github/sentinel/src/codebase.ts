import * as fs from "fs"
import { execSync } from "child_process"
import * as core from "@actions/core"
import type { CodeContext } from "./types"

const CODE_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "py", "go", "rs", "rb",
  "java", "kt", "swift", "c", "cpp", "h", "cs",
]

const MAX_FILE_SIZE = 50_000
const MAX_CONTEXT_FILES = 12

export async function analyzeCodebase(
  keywords: string[],
  maxFiles: number = MAX_CONTEXT_FILES
): Promise<CodeContext> {
  const allFiles = getFileTree()
  const searchHits = searchForKeywords(keywords, allFiles)
  const rankedFiles = rankFiles(searchHits, allFiles, keywords)
  const relevantFiles = readTopFiles(rankedFiles, maxFiles)
  const structure = getProjectStructure(allFiles)
  const dependencies = getDependencies()

  core.info(`Codebase analysis: ${allFiles.length} files, ${keywords.length} keywords, ${relevantFiles.length} relevant files`)

  return { files: relevantFiles, structure, dependencies }
}

export function extractKeywords(title: string, body: string): string[] {
  const text = `${title} ${body}`
  const codeRefs = text.match(/`([^`]+)`/g)?.map((m) => m.replace(/`/g, "")) || []
  const fileRefs = text.match(/[\w/.-]+\.\w{1,5}/g) || []
  const fnRefs = text.match(/\b[a-z][a-zA-Z0-9_]+(?=\()/g) || []
  const classRefs = text.match(/\b[A-Z][a-zA-Z0-9]+\b/g)?.filter((w) => w.length > 3) || []

  const stopwords = new Set([
    "the", "and", "for", "that", "this", "with", "from", "have", "been",
    "should", "would", "could", "when", "where", "what", "which", "there",
    "about", "into", "more", "some", "than", "them", "then", "these",
    "Error", "Warning", "Issue", "Problem", "Bug", "Feature", "Request",
    "TODO", "FIXME", "NOTE", "String", "Number", "Boolean", "Object", "Array",
  ])

  const all = [...codeRefs, ...fileRefs, ...fnRefs, ...classRefs]
  const unique = [...new Set(all)].filter((k) => k.length > 2 && !stopwords.has(k))

  return unique.slice(0, 20)
}

function getFileTree(): string[] {
  try {
    return execSync("git ls-files", { encoding: "utf-8", timeout: 5000 })
      .split("\n")
      .filter((f) => f && !f.startsWith(".git"))
  } catch {
    try {
      return execSync("find . -type f -not -path './.git/*' -not -path './node_modules/*' | head -2000", {
        encoding: "utf-8",
        timeout: 5000,
      })
        .split("\n")
        .filter(Boolean)
        .map((f) => f.replace(/^\.\//, ""))
    } catch {
      return []
    }
  }
}

interface SearchHit {
  file: string
  line: number
  text: string
  keyword: string
}

function searchForKeywords(keywords: string[], _files: string[]): SearchHit[] {
  const hits: SearchHit[] = []
  const extGlob = CODE_EXTENSIONS.map((e) => `--include='*.${e}'`).join(" ")

  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      const output = execSync(
        `grep -rn ${extGlob} -i "${escaped}" . 2>/dev/null | head -30`,
        { encoding: "utf-8", timeout: 5000 }
      )
      for (const line of output.split("\n").filter(Boolean)) {
        const match = line.match(/^\.\/(.+):(\d+):(.+)$/)
        if (match) {
          hits.push({
            file: match[1],
            line: parseInt(match[2]),
            text: match[3].trim(),
            keyword,
          })
        }
      }
    } catch {
      // no matches
    }
  }

  return hits
}

function rankFiles(
  hits: SearchHit[],
  allFiles: string[],
  keywords: string[]
): Array<{ path: string; score: number; relevance: string }> {
  const scores = new Map<string, { score: number; reasons: string[] }>()

  for (const hit of hits) {
    const existing = scores.get(hit.file) || { score: 0, reasons: [] }
    existing.score += 1
    if (!existing.reasons.includes(hit.keyword)) {
      existing.reasons.push(hit.keyword)
    }
    scores.set(hit.file, existing)
  }

  for (const keyword of keywords) {
    for (const file of allFiles) {
      const basename = file.split("/").pop() || ""
      if (basename.toLowerCase().includes(keyword.toLowerCase())) {
        const existing = scores.get(file) || { score: 0, reasons: [] }
        existing.score += 3
        existing.reasons.push(`filename match: ${keyword}`)
        scores.set(file, existing)
      }
    }
  }

  return Array.from(scores.entries())
    .map(([path, { score, reasons }]) => ({
      path,
      score,
      relevance: reasons.slice(0, 3).join(", "),
    }))
    .sort((a, b) => b.score - a.score)
}

function readTopFiles(
  ranked: Array<{ path: string; score: number; relevance: string }>,
  maxFiles: number
): Array<{ path: string; content: string; relevance: string }> {
  const result: Array<{ path: string; content: string; relevance: string }> = []

  for (const file of ranked.slice(0, maxFiles)) {
    try {
      const stat = fs.statSync(file.path)
      if (stat.size > MAX_FILE_SIZE) {
        result.push({
          path: file.path,
          content: `[File too large: ${stat.size} bytes — showing first ${MAX_FILE_SIZE} chars]\n` +
            fs.readFileSync(file.path, "utf-8").substring(0, MAX_FILE_SIZE),
          relevance: file.relevance,
        })
      } else {
        result.push({
          path: file.path,
          content: fs.readFileSync(file.path, "utf-8"),
          relevance: file.relevance,
        })
      }
    } catch {
      core.debug(`Could not read ${file.path}`)
    }
  }

  return result
}

function getProjectStructure(files: string[]): string {
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = f.split("/")
    for (let i = 1; i <= Math.min(parts.length - 1, 3); i++) {
      dirs.add(parts.slice(0, i).join("/") + "/")
    }
  }

  const sorted = Array.from(dirs).sort()
  const codeFiles = files.filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(`.${ext}`)))

  const lines: string[] = []
  lines.push(`Total files: ${files.length} (${codeFiles.length} code files)`)
  lines.push("")
  lines.push("Directories:")
  for (const dir of sorted.slice(0, 40)) {
    const count = files.filter((f) => f.startsWith(dir)).length
    lines.push(`  ${dir} (${count} files)`)
  }

  return lines.join("\n")
}

function getDependencies(): string {
  const parts: string[] = []

  if (fs.existsSync("package.json")) {
    try {
      const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"))
      const deps = Object.keys(pkg.dependencies || {})
      const devDeps = Object.keys(pkg.devDependencies || {})
      parts.push(`Node.js project: ${pkg.name || "unnamed"}`)
      if (deps.length) parts.push(`Dependencies: ${deps.join(", ")}`)
      if (devDeps.length) parts.push(`Dev dependencies: ${devDeps.join(", ")}`)
    } catch { /* */ }
  }

  if (fs.existsSync("requirements.txt")) {
    try {
      const reqs = fs.readFileSync("requirements.txt", "utf-8").split("\n").filter(Boolean).slice(0, 20)
      parts.push(`Python dependencies: ${reqs.join(", ")}`)
    } catch { /* */ }
  }

  if (fs.existsSync("go.mod")) {
    parts.push("Go module project")
  }

  if (fs.existsSync("Cargo.toml")) {
    try {
      const cargoContent = fs.readFileSync("Cargo.toml", "utf-8")
      const nameMatch = cargoContent.match(/^name\s*=\s*"([^"]+)"/m)
      const membersMatch = cargoContent.match(/members\s*=\s*\[([^\]]+)\]/s)
      const cargoName = nameMatch ? nameMatch[1] : "unnamed"

      if (membersMatch) {
        const members = membersMatch[1].match(/"([^"]+)"/g)?.map((m) => m.replace(/"/g, "")) || []
        parts.push(`Rust workspace: ${cargoName} (members: ${members.join(", ")})`)

        for (const member of members.slice(0, 8)) {
          const memberToml = `${member}/Cargo.toml`
          if (fs.existsSync(memberToml)) {
            try {
              const memberContent = fs.readFileSync(memberToml, "utf-8")
              const depsSection = memberContent.match(/\[dependencies\]([\s\S]*?)(?=\n\[|$)/)?.[1] || ""
              const depNames = depsSection.match(/^(\w[\w-]*)\s*=/gm)?.map((d) => d.replace(/\s*=.*/, "")) || []
              if (depNames.length) {
                parts.push(`  ${member}: ${depNames.join(", ")}`)
              }
            } catch { /* skip unreadable member */ }
          }
        }
      } else {
        const depsSection = cargoContent.match(/\[dependencies\]([\s\S]*?)(?=\n\[|$)/)?.[1] || ""
        const depNames = depsSection.match(/^(\w[\w-]*)\s*=/gm)?.map((d) => d.replace(/\s*=.*/, "")) || []
        parts.push(`Rust project: ${cargoName}`)
        if (depNames.length) parts.push(`Dependencies: ${depNames.join(", ")}`)
      }
    } catch {
      parts.push("Rust/Cargo project")
    }
  }

  if (fs.existsSync("tsconfig.json")) {
    parts.push("TypeScript enabled")
  }

  return parts.join("\n") || "No dependency info found"
}

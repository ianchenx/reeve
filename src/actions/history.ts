// actions/history.ts — History actions (no daemon required)

import { z } from "zod"
import { readFileSync, existsSync, readdirSync, statSync } from "fs"
import { join, resolve } from "path"
import { registerAction } from "./registry"
import type { ActionContext } from "./types"
import { TASKS_DIR } from "../paths"
import { readSessionNdjson } from "../session-log"
import { parseSessionEvents } from "../session-events"
import { ensureHistoryIndex, findHistoryEntry, type HistoryIndexEntry } from "../history-index"

/** Unified 3-level lookup: index → full scan by historyId → fallback by logDirName */
function resolveHistoryEntry(id: string): HistoryIndexEntry | undefined {
  return findHistoryEntry(id)
    ?? ensureHistoryIndex().items.find(item => item.historyId === id)
    ?? ensureHistoryIndex().items.find(item => item.logDirName === id)
}

// ── History grouping (was history-group.ts) ───────────────────

interface HistoryGroup {
  issueId: string
  identifier: string
  title: string
  latestStartedAt: string
  reviewRounds: number
  attempts: Array<HistoryIndexEntry & { projectSlug?: string; hasReview: boolean }>
}

function projectSlugForRepo(
  projects: Array<{ slug: string; repo: string }>,
  repo: string,
): string | undefined {
  const exact = projects.find(project => project.repo === repo)
  if (exact) return exact.slug
  const repoBase = repo.split("/").pop()
  if (repoBase) {
    const byBase = projects.find(p => p.repo.split("/").pop() === repoBase)
    if (byBase) return byBase.slug
  }
  if (projects.length === 1) return projects[0].slug
  return undefined
}

function decorateHistoryEntry(
  entry: HistoryIndexEntry,
  projects: Array<{ slug: string; repo: string }>,
): HistoryIndexEntry & { projectSlug?: string; hasReview: boolean } {
  const logDir = resolve(TASKS_DIR, entry.relativePath)
  const taskDir = join(logDir, "..")
  return {
    ...entry,
    projectSlug: projectSlugForRepo(projects, entry.repo),
    hasReview: existsSync(join(taskDir, "review", "session.ndjson")),
  }
}

function inferReviewRounds(entries: Array<HistoryIndexEntry & { hasReview: boolean }>): number {
  const explicitRounds = entries.reduce((maxRounds, entry) => {
    return typeof entry.hookReviewRound === "number"
      ? Math.max(maxRounds, entry.hookReviewRound)
      : maxRounds
  }, 0)
  if (explicitRounds > 0) return explicitRounds
  const reviewEntries = entries.filter(entry => entry.phase === "review").length
  if (reviewEntries > 0) return reviewEntries
  return entries.some(entry => entry.hasReview) ? 1 : 0
}

function groupHistoryEntries(
  entries: Array<HistoryIndexEntry & { projectSlug?: string; hasReview: boolean }>,
): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>()

  for (const entry of entries) {
    const current = groups.get(entry.issueId)
    if (!current) {
      groups.set(entry.issueId, {
        issueId: entry.issueId,
        identifier: entry.identifier,
        title: entry.title,
        latestStartedAt: entry.startedAt,
        reviewRounds: inferReviewRounds([entry]),
        attempts: [entry],
      })
      continue
    }

    current.attempts.push(entry)
    current.reviewRounds = inferReviewRounds(current.attempts)
    if (new Date(entry.startedAt).getTime() > new Date(current.latestStartedAt).getTime()) {
      current.latestStartedAt = entry.startedAt
      current.identifier = entry.identifier
      current.title = entry.title
    }
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      attempts: group.attempts.sort((left, right) => {
        const startedAtDiff = new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
        if (startedAtDiff !== 0) return startedAtDiff
        if (left.attempt !== right.attempt) return right.attempt - left.attempt
        return left.phase.localeCompare(right.phase)
      }),
    }))
    .sort((left, right) => new Date(right.latestStartedAt).getTime() - new Date(left.latestStartedAt).getTime())
}

// ── historyList ───────────────────────────────────────────────

const historyListInput = z.object({
  project: z.string().optional(),
  query: z.string().optional(),
  agent: z.string().optional(),
  outcome: z.string().optional(),
  limit: z.number().default(50),
  offset: z.number().default(0),
})

registerAction({
  name: "historyList",
  description: "List task history entries with optional filters",
  input: historyListInput,
  output: z.object({ items: z.array(z.any()), total: z.number() }),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: z.infer<typeof historyListInput>) {
    const index = ensureHistoryIndex()
    const entries = index.items
      .map(item => decorateHistoryEntry(item, ctx.projects))
      .filter(item => !input.project || item.projectSlug === input.project)
      .filter(item => !input.query || item.identifier.toLowerCase().includes(input.query.toLowerCase()) || item.title.toLowerCase().includes(input.query.toLowerCase()))
      .filter(item => !input.agent || item.agent.toLowerCase().includes(input.agent.toLowerCase()))
      .filter(item => !input.outcome || item.outcome === input.outcome)

    const grouped = groupHistoryEntries(entries)
    return {
      items: grouped.slice(input.offset, input.offset + input.limit),
      total: grouped.length,
    }
  },
})

// ── historyDetail ─────────────────────────────────────────────

const historyDetailInput = z.object({
  id: z.string(),
})

registerAction({
  name: "historyDetail",
  description: "Get detailed info for a single history entry",
  input: historyDetailInput,
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: z.infer<typeof historyDetailInput>) {
    const entry = resolveHistoryEntry(input.id)
    if (!entry) throw new Error("History entry not found")

    const logDir = resolve(TASKS_DIR, entry.relativePath)
    if (!logDir.startsWith(resolve(TASKS_DIR) + "/")) throw new Error("Invalid path")
    if (!existsSync(logDir)) throw new Error("History entry not found")

    const metaPath = join(logDir, "meta.json")
    if (!existsSync(metaPath)) throw new Error("Meta not found")

    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>
    const projectSlug = projectSlugForRepo(ctx.projects, entry.repo)
    const taskDir = join(logDir, "..")
    const hasReview = existsSync(join(taskDir, "review", "session.ndjson"))
    return {
      ...meta,
      historyId: entry.historyId,
      issueId: entry.issueId,
      identifier: entry.identifier,
      title: entry.title,
      agent: entry.agent,
      repo: entry.repo,
      worktree: entry.worktree,
      attempt: entry.attempt,
      phase: entry.phase,
      stage: entry.stage ?? (entry.phase === "review" ? "review" : "implement"),
      hookReviewRound: entry.hookReviewRound,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      outcome: entry.outcome,
      exitCode: entry.exitCode,
      prUrl: entry.prUrl,
      stderr: entry.stderr,
      projectSlug,
      hasReview,
    }
  },
})

// ── historySession ────────────────────────────────────────────

const historySubInput = z.object({
  id: z.string(),
  sub: z.string(),
})

registerAction({
  name: "historySub",
  description: "Get session events or prompt text for a history entry",
  input: historySubInput,
  output: z.any(),
  requiresDaemon: false,
  async handler(_ctx: ActionContext, input: z.infer<typeof historySubInput>) {
    const entry = resolveHistoryEntry(input.id)
    if (!entry) throw new Error("History entry not found")

    const logDir = resolve(TASKS_DIR, entry.relativePath)
    if (!logDir.startsWith(resolve(TASKS_DIR) + "/")) throw new Error("Invalid path")
    if (!existsSync(logDir)) throw new Error("History entry not found")

    const taskDir = join(logDir, "..")

    // Direct session/prompt (implement agent)
    if (input.sub === "session") {
      return { events: parseSessionEvents(readSessionNdjson(join(logDir, "session.ndjson"))) }
    }
    if (input.sub === "prompt") {
      const p = join(logDir, "prompt.txt")
      return { prompt: existsSync(p) ? readFileSync(p, "utf-8") : "" }
    }

    // {agent}/session or {agent}/prompt
    const match = input.sub.match(/^([a-zA-Z0-9_-]+)\/(session|prompt)$/)
    if (!match) throw new Error("Unknown sub path")
    const [, agentName, subType] = match

    if (subType === "session") {
      return { events: parseSessionEvents(readSessionNdjson(join(taskDir, agentName, "session.ndjson"))) }
    }
    // prompt
    const p = join(taskDir, agentName, "prompt.txt")
    return { prompt: existsSync(p) ? readFileSync(p, "utf-8") : "" }
  },
})

// ── historyAgents ────────────────────────────────────────────

registerAction({
  name: "historyAgents",
  description: "List agents that ran for a history entry",
  input: z.object({ id: z.string() }),
  output: z.any(),
  requiresDaemon: false,
  async handler(_ctx: ActionContext, input: { id: string }) {
    const entry = resolveHistoryEntry(input.id)
    if (!entry) return { agents: ["implement"] }

    const taskRoot = resolve(TASKS_DIR, entry.logDirName)
    if (!existsSync(taskRoot)) return { agents: ["implement"] }

    const agents: string[] = []
    for (const name of readdirSync(taskRoot)) {
      const dir = resolve(taskRoot, name)
      try {
        if (statSync(dir).isDirectory() && existsSync(join(dir, "session.ndjson"))) {
          agents.push(name)
        }
      } catch {}
    }
    // Sort: implement first, then alphabetical
    agents.sort((a, b) => a === "implement" ? -1 : b === "implement" ? 1 : a.localeCompare(b))
    return { agents: agents.length > 0 ? agents : ["implement"] }
  },
})

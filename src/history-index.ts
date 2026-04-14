import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs"
import { basename, join, relative, resolve, sep } from "path"
import { LOGS_DIR, TASKS_DIR } from "./paths"
import { writeJsonFileAtomic } from "./persistence"

const HISTORY_INDEX_VERSION = 1
const HISTORY_INDEX_PATH = resolve(LOGS_DIR, "index.json")

export interface HistoryIndexEntry {
  historyId: string
  logDirName: string
  relativePath: string
  issueId: string
  identifier: string
  title: string
  agent: string
  repo: string
  worktree?: string
  attempt: number
  phase: string
  stage?: "implement" | "review"
  hookReviewRound?: number
  startedAt: string
  endedAt?: string
  outcome?: "completed" | "failed"
  exitCode?: number
  prUrl?: string
  stderr?: string
  reviewProvider?: string
  contextUsed?: number
  contextSize?: number
  tokensUsed?: { input: number; output: number; total: number }
}

export interface HistoryIndex {
  version: number
  updatedAt: string
  items: HistoryIndexEntry[]
}

type MetaRecord = Record<string, unknown>

function readMeta(metaPath: string): MetaRecord | null {
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as MetaRecord
  } catch {
    return null
  }
}

function inferAttempt(relativePath: string, meta: MetaRecord): number {
  if (typeof meta.attempt === "number" && Number.isFinite(meta.attempt)) {
    return meta.attempt
  }

  const dirName = basename(relativePath)
  const match = dirName.match(/(?:attempt|review)-(\d+)/)
  if (match) {
    const parsed = Number.parseInt(match[1] ?? "", 10)
    if (Number.isFinite(parsed)) return parsed
  }

  return 1
}

function inferPhase(relativePath: string, meta: MetaRecord): string {
  if (typeof meta.phase === "string" && meta.phase.trim()) {
    return meta.phase.trim()
  }

  const dirName = basename(relativePath).toLowerCase()
  if (dirName.startsWith("review")) return "review"
  return "implementation"
}

function historyIdFromRelativePath(relativePath: string): string {
  return relativePath.split(sep).join("__")
}

function toIndexEntry(logDirName: string, relativePath: string, meta: MetaRecord): HistoryIndexEntry | null {
  const identifier = typeof meta.identifier === "string" ? meta.identifier : null
  const title = typeof meta.title === "string" ? meta.title : null
  const agent = typeof meta.agent === "string" ? meta.agent : null
  const repo = typeof meta.repo === "string" ? meta.repo : null
  const startedAt = typeof meta.startedAt === "string" ? meta.startedAt : null

  if (!identifier || !title || !agent || !repo || !startedAt) {
    return null
  }

  const issueId = typeof meta.issueId === "string"
    ? meta.issueId
    : typeof meta.taskId === "string"
      ? meta.taskId
      : identifier

  const attempt = inferAttempt(relativePath, meta)
  const phase = inferPhase(relativePath, meta)

  return {
    historyId: historyIdFromRelativePath(relativePath),
    logDirName,
    relativePath,
    issueId,
    identifier,
    title,
    agent,
    repo,
    worktree: typeof meta.worktree === "string" ? meta.worktree : undefined,
    attempt,
    phase,
    stage: meta.stage === "review" ? "review" : meta.stage === "implement" ? "implement" : undefined,
    hookReviewRound: typeof meta.hookReviewRound === "number" ? meta.hookReviewRound : undefined,
    startedAt,
    endedAt: typeof meta.endedAt === "string" ? meta.endedAt : undefined,
    outcome: meta.outcome === "completed" || meta.outcome === "failed" ? meta.outcome : undefined,
    exitCode: typeof meta.exitCode === "number" ? meta.exitCode : undefined,
    prUrl: typeof meta.prUrl === "string" ? meta.prUrl : undefined,
    stderr: typeof meta.stderr === "string" ? meta.stderr : undefined,
    reviewProvider: typeof meta.reviewProvider === "string" ? meta.reviewProvider : undefined,
    contextUsed: typeof meta.contextUsed === "number" ? meta.contextUsed : undefined,
    contextSize: typeof meta.contextSize === "number" ? meta.contextSize : undefined,
    tokensUsed: (meta.tokensUsed && typeof meta.tokensUsed === 'object' && typeof (meta.tokensUsed as any).total === 'number')
      ? { input: Number((meta.tokensUsed as any).input) || 0, output: Number((meta.tokensUsed as any).output) || 0, total: Number((meta.tokensUsed as any).total) }
      : undefined,
  }
}

function collectNestedEntries(taskDir: string, logDirName: string, logsDir: string): HistoryIndexEntry[] {
  const nestedEntries: HistoryIndexEntry[] = []
  for (const entry of readdirSync(taskDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const childDir = join(taskDir, entry.name)
    const metaPath = join(childDir, "meta.json")
    if (!existsSync(metaPath)) continue
    const meta = readMeta(metaPath)
    if (!meta) continue
    const relativePath = relative(logsDir, childDir)
    const item = toIndexEntry(logDirName, relativePath, meta)
    if (item) nestedEntries.push(item)
  }
  return nestedEntries
}

function collectHistoryEntriesForTaskDir(taskDir: string, logsDir: string = TASKS_DIR): HistoryIndexEntry[] {
  if (!existsSync(taskDir) || !statSync(taskDir).isDirectory()) return []

  const logDirName = basename(taskDir)
  const items = collectNestedEntries(taskDir, logDirName, logsDir)

  const rootMetaPath = join(taskDir, "meta.json")
  if (existsSync(rootMetaPath)) {
    const meta = readMeta(rootMetaPath)
    if (meta) {
      const item = toIndexEntry(logDirName, relative(logsDir, taskDir), meta)
      if (item) items.push(item)
    }
  }

  return items.sort((left, right) => {
    const startedAtDiff = new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime()
    if (startedAtDiff !== 0) return startedAtDiff
    if (left.attempt !== right.attempt) return left.attempt - right.attempt
    return left.phase.localeCompare(right.phase)
  })
}

function normalizeIndex(index: Partial<HistoryIndex> | null): HistoryIndex | null {
  if (!index || index.version !== HISTORY_INDEX_VERSION || !Array.isArray(index.items)) {
    return null
  }

  return {
    version: HISTORY_INDEX_VERSION,
    updatedAt: typeof index.updatedAt === "string" ? index.updatedAt : new Date().toISOString(),
    items: index.items
      .filter((item): item is HistoryIndexEntry => {
        return !!item && typeof item === "object"
          && typeof item.historyId === "string"
          && typeof item.logDirName === "string"
          && typeof item.relativePath === "string"
          && typeof item.issueId === "string"
          && typeof item.identifier === "string"
          && typeof item.title === "string"
          && typeof item.agent === "string"
          && typeof item.repo === "string"
          && typeof item.attempt === "number"
          && typeof item.phase === "string"
          && typeof item.startedAt === "string"
      })
      .map(item => ({ ...item })),
  }
}

function sortItems(items: HistoryIndexEntry[]): HistoryIndexEntry[] {
  return items.slice().sort((left, right) => {
    const startedAtDiff = new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
    if (startedAtDiff !== 0) return startedAtDiff
    if (left.attempt !== right.attempt) return right.attempt - left.attempt
    return left.phase.localeCompare(right.phase)
  })
}

function pruneMissingEntries(index: HistoryIndex, logsDir: string): HistoryIndex {
  const items = index.items.filter(item => existsSync(resolve(logsDir, item.relativePath, "meta.json")))
  if (items.length === index.items.length) return index
  return {
    version: HISTORY_INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    items: sortItems(items),
  }
}

export function readHistoryIndex(indexPath: string = HISTORY_INDEX_PATH, logsDir: string = TASKS_DIR): HistoryIndex | null {
  if (!existsSync(indexPath)) return null

  try {
    const raw = JSON.parse(readFileSync(indexPath, "utf-8")) as Partial<HistoryIndex>
    const normalized = normalizeIndex(raw)
    if (!normalized) return null
    const pruned = pruneMissingEntries(normalized, logsDir)
    if (pruned.items.length !== normalized.items.length) {
      writeJsonFileAtomic(indexPath, pruned)
    }
    return pruned
  } catch {
    return null
  }
}

export function rebuildHistoryIndex(logsDir: string = TASKS_DIR, indexPath: string = HISTORY_INDEX_PATH): HistoryIndex {
  mkdirSync(logsDir, { recursive: true })

  const items: HistoryIndexEntry[] = []
  for (const entry of readdirSync(logsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const taskDir = join(logsDir, entry.name)
    items.push(...collectHistoryEntriesForTaskDir(taskDir, logsDir))
  }

  const index: HistoryIndex = {
    version: HISTORY_INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    items: sortItems(items),
  }
  writeJsonFileAtomic(indexPath, index)
  return index
}

export function ensureHistoryIndex(logsDir: string = TASKS_DIR, indexPath: string = HISTORY_INDEX_PATH): HistoryIndex {
  return readHistoryIndex(indexPath, logsDir) ?? rebuildHistoryIndex(logsDir, indexPath)
}

export function syncHistoryIndexForTask(logDirName: string, logsDir: string = TASKS_DIR, indexPath: string = HISTORY_INDEX_PATH): HistoryIndex {
  const index = ensureHistoryIndex(logsDir, indexPath)
  const taskDir = resolve(logsDir, logDirName)
  const items = collectHistoryEntriesForTaskDir(taskDir, logsDir)
  const next: HistoryIndex = {
    version: HISTORY_INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    items: sortItems([
      ...index.items.filter(item => item.logDirName !== logDirName),
      ...items,
    ]),
  }
  writeJsonFileAtomic(indexPath, next)
  return next
}

export function findHistoryEntry(
  historyId: string,
  indexPath: string = HISTORY_INDEX_PATH,
  logsDir: string = TASKS_DIR,
): HistoryIndexEntry | null {
  const index = readHistoryIndex(indexPath, logsDir)
  if (!index) return null
  return index.items.find(item => item.historyId === historyId) ?? null
}

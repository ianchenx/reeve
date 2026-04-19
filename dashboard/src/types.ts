// ── Task types (synced with src/kernel/types.ts) ──────────────

export type TaskState = "queued" | "active" | "published" | "done"
export type DoneReason = "merged" | "closed" | "failed"

export interface TaskEntry {
  readonly id: string
  readonly identifier: string
  readonly title: string
  readonly description: string
  readonly labels: string[]
  readonly priority: number | null
  state: TaskState
  doneReason?: DoneReason
  repo: string
  baseBranch: string
  setup?: string
  worktree?: string
  branch?: string
  pid?: number
  agent?: string
  startedAt?: string
  prUrl?: string
  createdAt: string
  updatedAt: string
  usage?: {
    input?: number
    output?: number
    total?: number
    cacheRead?: number
    contextUsed?: number
    contextSize?: number
  }
}

export interface CompletedEntry {
  identifier: string
  title: string
  prUrl?: string
  reason?: string
  doneReason?: DoneReason
  doneAt: string
}

export interface TokenUsage {
  input?: number
  output?: number
  total?: number
  cacheRead?: number
  contextUsed?: number
  contextSize?: number
  costUsd?: number
}

export interface HistoryMeta {
  historyId: string
  issueId: string
  identifier: string
  title: string
  agent: string
  reviewProvider?: string
  attempt: number
  phase: string
  stage?: string
  hookReviewRound?: number
  repo: string
  worktree?: string
  startedAt: string
  endedAt?: string
  exitCode?: number
  outcome?: "completed" | "failed"
  prUrl?: string
  tokensUsed?: TokenUsage | number | null
  stderr?: string
  hasReview?: boolean
  failureReason?: string
  diffStat?: string | null
  changedFiles?: Array<{ status: string; file: string }>
  contextUsed?: number
  contextSize?: number
}

export interface HistoryEntry extends HistoryMeta {
  projectSlug?: string
}

export interface HistoryGroup {
  issueId: string
  identifier: string
  title: string
  latestStartedAt: string
  reviewRounds: number
  attempts: HistoryEntry[]
}

export interface DashboardConfig {
  projects: Array<{ slug: string; repo: string; baseBranch?: string; name?: string }>
  agent: {
    maxRetries: number
    stallTimeoutMs: number
    default: string
  }
  polling: { intervalMs: number }
}

// ── V2 SSE events ────────────────────────────────────────────

export type ReeveSSEEvent =
  | { type: "init"; tasks: TaskEntry[] }
  | { type: "task_added"; task: TaskEntry }
  | { type: "state_change"; task: TaskEntry; data?: { from: string; to: string; reason?: string } }
  | { type: "error"; message: string }

export interface DisplayEvent {
  type: "thinking" | "tool_call" | "tool_result" | "approval" | "approval_request" | "session_ready" | "usage" | "exit" | "result" | "other"
  text: string
  time: string
  status?: string
  tokens?: number
  rawData?: Record<string, unknown>
}

export interface WorktreeStatusResponse {
  branch: string
  changedFiles: Array<{ status: string; file: string }>
  commits: Array<{ hash: string; message: string }>
  diffStat: string | null
}

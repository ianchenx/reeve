// types.ts — state machine types
// 4-state, no-cycle design: queued → active → published → done
// published → active for rework/land (agent re-dispatch)

import type { TokenUsageSnapshot } from '../persistence'

// ── Task states ──────────────────────────────────────────────

export type TaskState = "queued" | "active" | "published" | "done"

export type DoneReason = "merged" | "closed" | "failed"

// ── Transition table ─────────────────────────────────────────

const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  queued:    ["active", "done"],
  active:    ["published", "queued", "done"],
  published: ["active", "done"],
  done:      [],
} as const

export function canTransition(from: TaskState, to: TaskState): boolean {
  return (TRANSITIONS[from] as readonly string[]).includes(to)
}

export function assertTransition(from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`)
  }
}

// ── Source item (what comes from Linear / GitHub Issues / etc.) ──

export interface SourceItem {
  id: string              // External ID (Linear issue ID, GitHub issue number, etc.)
  identifier: string      // Human-readable: "WOR-42", "org/repo#123"
  title: string
  description: string
  labels: string[]
  priority: number | null
  repo: string            // Absolute path to the project repo
  baseBranch: string      // Git branch to base worktree on
}

// ── Dispatch context (kernel-owned budget data passed to agent) ──

export interface DispatchContext {
  attempt: number    // retry count (budget enforcement)
  round: number      // continuation count (round budget)
  trace?: string     // gate failure output from previous run
}

// ── Retry trace (captured before worktree rebuild) ──

export interface TaskTrace {
  gateReason: string                           // Why the gate blocked: "post-agent review failed"
  lastError?: string                           // Last error from session log
  diffStat?: string                            // git diff --stat (≤500 chars)
  detail?: string                              // Failure detail: stderr, post-agent output, etc.
}

// ── Task (the kernel's unit of work) ──

export interface Task {
  id: string              // Same as SourceItem.id
  identifier: string      // Human-readable identifier
  title: string
  description: string
  labels: string[]
  priority: number | null
  state: TaskState
  stage?: "implement" | "post-agent"
  doneReason?: DoneReason

  // Repo context
  repo: string
  baseBranch: string

  // Runtime (set after dispatch)
  taskDir?: string           // Task root: ~/.reeve/tasks/{id}/
  workDir?: string           // Implement agent CWD: {taskDir}/implement/
  worktree?: string          // Git worktree path: {taskDir}/{repo}/ — for git ops, hooks, PR detection
  branch?: string
  pid?: number
  agent?: string
  /** Claude CLI: UUID used for --resume on continuation. */
  sessionId?: string
  /** Codex app-server: thread id used for thread/resume on continuation. */
  threadId?: string
  startedAt?: string
  lastOutputAt?: string      // Last time agent produced output (for stall detection)

  // Publishing
  prUrl?: string

  // Redispatch rounds
  round: number
  maxRounds: number

  // Retry (gate-failure backoff)
  retryCount: number
  retryAfter?: string       // ISO timestamp — dispatch skips until this time
  trace?: TaskTrace          // Structured context from previous failed attempt
  lastExitDisposition?: string  // Disposition after agent's last run ('passive' = moved to In Review)

  // Token usage (updated in real-time from ACPX usage_update events)
  usage?: TokenUsageSnapshot

  // Timestamps
  createdAt: string
  updatedAt: string

}

// ── Agent exit result ──

export interface AgentResult {
  exitCode: number
  stderr: string
}

// ── Session event (JSONL log entry) ──

export interface SessionEvent {
  ts: string              // ISO timestamp
  taskId: string
  identifier: string
  event: string           // e.g. "state_change", "hook_run", "agent_exit"
  from?: TaskState
  to?: TaskState
  data?: Record<string, unknown>
}

// ── Eval record (appended to eval.jsonl on task completion) ──

export interface EvalRecord {
  ts: string
  identifier: string
  taskId: string
  agent?: string
  durationMs?: number
  retryCount: number
  round: number
  success: boolean
  doneReason: DoneReason
  prUrl?: string
  labels: string[]
  repo: string
  /** Peak context window usage (tokens used / window size) */
  contextUsed?: number
  contextSize?: number
}

// ── Config subset kernel needs ──

export interface KernelConfig {
  maxRounds: number
  maxRetries?: number         // Gate-failure retry limit (default 2)
  pollIntervalMs: number
  stallTimeoutMs: number      // Time without output before killing agent (default 5min)
  turnTimeoutMs: number       // Max time for a single turn (default 1 hour)
  agentDefault: string
  dashboardPort: number
  dashboardEnabled: boolean
}

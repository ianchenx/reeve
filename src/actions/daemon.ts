// actions/daemon.ts — Actions that interact with kernel state
// Most read from state file directly (no daemon needed).
// Only health + cancel truly require the running kernel.

import { z } from "zod"
import { existsSync, readFileSync } from "fs"
import { join, resolve } from "path"
import { registerAction } from "./registry"
import type { ActionContext } from "./types"
import { REEVE_DIR, LOGS_DIR } from "../paths"
import { readLiveSessionEvents } from "../kernel/live-session"
import { parseSessionEvents } from "../session-events"
import { StateStore } from "../kernel/state"
import type { Task } from "../kernel/types"

// ── State file reader (uses StateStore for schema validation) ──

function readStateFile(): Task[] {
  const path = resolve(REEVE_DIR, "state.json")
  if (!existsSync(path)) return []
  const store = new StateStore(path)
  store.load()
  return store.all()
}

// ── health (requires daemon — needs tick timing) ──────────────

registerAction({
  name: "health",
  description: "Health check with tick timing and task counts",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: true,
  async handler(ctx: ActionContext) {
    const kernel = ctx.kernel!
    const now = Date.now()
    const lastTickMs = kernel.lastTickAt ? now - kernel.lastTickAt : -1
    const tasks = kernel.tasks
    const counts: Record<string, number> = {}
    for (const t of tasks) counts[t.state] = (counts[t.state] ?? 0) + 1
    const status = lastTickMs >= 0 && lastTickMs < 300_000 ? "ok" : "degraded"
    return { status, lastTickMs, uptime: Math.round(process.uptime()), taskCounts: counts }
  },
})

// ── status (reads state file) ─────────────────────────────────

registerAction({
  name: "status",
  description: "Task state summary counts",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext) {
    const tasks = ctx.kernel?.tasks ?? readStateFile()
    const counts: Record<string, number> = {}
    for (const t of tasks) counts[t.state] = (counts[t.state] ?? 0) + 1
    return { total: tasks.length, ...counts }
  },
})

// ── taskList (reads state file) ───────────────────────────────

registerAction({
  name: "taskList",
  description: "List all current tasks",
  input: z.object({}),
  output: z.array(z.any()),
  requiresDaemon: false,
  async handler(ctx: ActionContext) {
    return ctx.kernel?.tasks ?? readStateFile()
  },
})

// ── taskDetail (reads state file) ─────────────────────────────

registerAction({
  name: "taskDetail",
  description: "Get a single task by ID or identifier",
  input: z.object({ id: z.string() }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: { id: string }) {
    const tasks = ctx.kernel?.tasks ?? readStateFile()
    const task = tasks.find(t => t.id === input.id || t.identifier === input.id)
    if (!task) throw new Error("Task not found")
    return task
  },
})

// ── cancel (requires daemon — needs to kill process) ──────────

registerAction({
  name: "cancel",
  description: "Cancel a running task",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
  requiresDaemon: true,
  async handler(ctx: ActionContext, input: { id: string }) {
    const ok = await ctx.kernel!.cancel(input.id)
    if (!ok) throw new Error("Task not found")
    return { ok }
  },
})

// ── log (reads JSONL file directly) ───────────────────────────

registerAction({
  name: "log",
  description: "Read session log entries (JSONL) with optional task filter",
  input: z.object({
    task: z.string().optional(),
    tail: z.number().default(100),
  }),
  output: z.array(z.any()),
  requiresDaemon: false,
  async handler(_ctx: ActionContext, input: { task?: string; tail: number }) {
    const logPath = join(LOGS_DIR, "session.jsonl")
    if (!existsSync(logPath)) return []

    const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean)
    let events = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

    if (input.task) {
      events = events.filter((e: { taskId?: string; identifier?: string }) =>
        e.taskId === input.task || e.identifier === input.task
      )
    }

    return events.slice(-input.tail)
  },
})

// ── liveSession ───────────────────────────────────────────────

registerAction({
  name: "liveSession",
  description: "Get live session events for an active task",
  input: z.object({ identifier: z.string() }),
  output: z.object({ events: z.array(z.any()) }),
  requiresDaemon: false,
  async handler(_ctx: ActionContext, input: { identifier: string }) {
    return { events: parseSessionEvents(readLiveSessionEvents(input.identifier)) }
  },
})

// ── cleanTask (worktree only, preserves logs) ────────────────

registerAction({
  name: "cleanTask",
  description: "Clean a task's worktree (preserves logs)",
  input: z.object({ identifier: z.string() }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: { identifier: string }) {
    const tasks = readStateFile()
    const task = tasks.find(t =>
      t.identifier.toLowerCase() === input.identifier.toLowerCase()
    )
    if (!task) return { ok: false, error: "Task not found" }
    if (task.state === "active") return { ok: false, error: "Cannot clean active task" }

    const { WorkspaceManager } = await import("../workspace/manager")
    const { RepoStore } = await import("../workspace/repo-store")
    const workspace = new WorkspaceManager()
    const repoStore = new RepoStore(ctx.config.workspace.root)
    try {
      await workspace.cleanWorktreeOnly(task.identifier, repoStore.repoDirOf(task.repo))
      return { ok: true, cleaned: task.identifier }
    } catch {
      return { ok: true, cleaned: task.identifier, note: "Worktree already removed" }
    }
  },
})

// ── cleanAllDone (batch worktree cleanup) ────────────────────

registerAction({
  name: "cleanAllDone",
  description: "Clean all done task worktrees (preserves logs)",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext) {
    const tasks = readStateFile()
    const done = tasks.filter(t => t.state === "done")
    const { WorkspaceManager } = await import("../workspace/manager")
    const { RepoStore } = await import("../workspace/repo-store")
    const workspace = new WorkspaceManager()
    const repoStore = new RepoStore(ctx.config.workspace.root)
    const cleaned: string[] = []

    for (const task of done) {
      try {
        await workspace.cleanWorktreeOnly(task.identifier, repoStore.repoDirOf(task.repo))
        cleaned.push(task.identifier)
      } catch {}
    }
    return { ok: true, cleaned }
  },
})

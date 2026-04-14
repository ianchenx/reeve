// state.ts — Atomic state persistence
// Stores Task[] as JSON, crash-safe via temp-file rename

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { basename, dirname, resolve } from "path"
import { z } from "zod"
import type { TokenUsageSnapshot } from "../persistence"
import type { Task } from "./types"

const STATE_VERSION = 1

// ── Task schema (validates each task on load) ──────────────────

const tokenUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  total: z.number(),
  contextUsed: z.number().optional(),
  contextSize: z.number().optional(),
}) satisfies z.ZodType<TokenUsageSnapshot>

const taskTraceSchema = z.object({
  gateReason: z.string(),
  lastError: z.string().optional(),
  diffStat: z.string().optional(),
  detail: z.string().optional(),
}).strict()

const taskSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  priority: z.number().nullable(),
  state: z.enum(["queued", "active", "published", "done"]),
  stage: z.enum(["implement", "post-agent"]).optional(),
  doneReason: z.enum(["merged", "closed", "failed"]).optional(),
  repo: z.string(),
  baseBranch: z.string(),
  taskDir: z.string().optional(),
  workDir: z.string().optional(),
  worktree: z.string().optional(),
  branch: z.string().optional(),
  pid: z.number().optional(),
  agent: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
  startedAt: z.string().optional(),
  lastOutputAt: z.string().optional(),
  prUrl: z.string().optional(),
  round: z.number(),
  maxRounds: z.number(),
  retryCount: z.number().default(0),
  retryAfter: z.string().optional(),
  trace: taskTraceSchema.optional(),
  lastExitDisposition: z.string().optional(),
  usage: tokenUsageSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict() satisfies z.ZodType<Task>

const stateFileSchema = z.object({
  version: z.literal(STATE_VERSION),
  tasks: z.array(taskSchema),
})

// ── StateStore ─────────────────────────────────────────────────

export class StateStore {
  private tasks = new Map<string, Task>()

  constructor(private readonly path: string) {}

  /** Load tasks from disk. Falls back to .bak if primary is corrupt. Returns count loaded. */
  load(): number {
    for (const candidate of [this.path, this.path + ".bak"]) {
      if (!existsSync(candidate)) continue
      try {
        const raw = JSON.parse(readFileSync(candidate, "utf-8"))
        const parsed = stateFileSchema.safeParse(raw)

        if (!parsed.success) {
          const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
          console.warn(`[state] Schema validation failed for ${candidate}: ${issues}`)
          continue
        }

        this.tasks.clear()
        for (const task of parsed.data.tasks as Task[]) {
          // State migration: redispatch → active
          if ((task.state as string) === "redispatch") {
            console.warn(`[state] Migrating task ${task.identifier} from redispatch → active`)
            task.state = "active"
          }
          this.tasks.set(task.id, task)
        }
        if (candidate !== this.path) {
          console.warn(`[state] Recovered from backup: ${candidate}`)
        }
        return this.tasks.size
      } catch (err) {
        console.warn(`[state] Failed to load ${candidate}:`, err)
      }
    }
    return 0
  }

  /** Persist current tasks to disk atomically. Backs up previous state first. */
  save(): void {
    const dir = dirname(this.path)
    const tmp = resolve(dir, `.${process.pid}.${basename(this.path)}.tmp`)
    mkdirSync(dir, { recursive: true })

    // Backup current state file before overwriting
    if (existsSync(this.path)) {
      try { copyFileSync(this.path, this.path + ".bak") } catch {}
    }

    const state = {
      version: STATE_VERSION,
      tasks: Array.from(this.tasks.values()),
    }

    writeFileSync(tmp, JSON.stringify(state, null, 2))
    try {
      renameSync(tmp, this.path)
    } catch (err) {
      try { unlinkSync(tmp) } catch {}
      throw err
    }
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id)
  }

  getByIdentifier(identifier: string): Task | undefined {
    const upper = identifier.toUpperCase()
    for (const task of this.tasks.values()) {
      if (task.identifier.toUpperCase() === upper) return task
    }
    return undefined
  }

  set(task: Task): void {
    this.tasks.set(task.id, task)
  }

  delete(id: string): boolean {
    return this.tasks.delete(id)
  }

  all(): Task[] {
    return Array.from(this.tasks.values())
  }

  byState(state: Task["state"]): Task[] {
    return this.all().filter(t => t.state === state)
  }

  get size(): number {
    return this.tasks.size
  }
}

// trace.ts — Capture structured context from a failed attempt before worktree rebuild
// Write-side only: extracts signals from worktree artifacts, stores on Task.trace

import type { Task, TaskTrace } from "./types"
import { extractLastError } from "./error-extract"

/**
 * Capture trace data from the current worktree before it gets rebuilt on retry.
 * Pure data extraction — no side effects, no prompt formatting.
 */
export async function captureTrace(task: Task, gateReason: string): Promise<TaskTrace> {
  const trace: TaskTrace = { gateReason }
  if (!task.worktree) return trace

  // 1. Last error from session log
  trace.lastError = extractLastError(task.identifier) ?? undefined

  // 2. git diff --stat — what files were touched
  trace.diffStat = await gitDiffStat(task.worktree, 500)

  return trace
}

async function gitDiffStat(cwd: string, maxChars: number): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(["git", "diff", "--stat", "HEAD~1"], {
      cwd, stdout: "pipe", stderr: "pipe",
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) return undefined

    const output = (await new Response(proc.stdout).text()).trim()
    return output ? output.slice(0, maxChars) : undefined
  } catch {
    return undefined
  }
}

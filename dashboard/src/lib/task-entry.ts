import type { TaskEntry } from "@/types"

export function isActiveTask(entry: TaskEntry): boolean {
  return entry.state === "active"
}

export function isPublishedTask(entry: TaskEntry): boolean {
  return entry.state === "published"
}

export function isQueuedTask(entry: TaskEntry): boolean {
  return entry.state === "queued"
}

export function isDoneTask(entry: TaskEntry): boolean {
  return entry.state === "done"
}

export function getTaskAgent(entry: TaskEntry): string {
  return entry.agent ?? "unknown"
}

export function getTaskWorktree(entry: TaskEntry): string {
  return entry.worktree ?? ""
}

export function getTaskBranch(entry: TaskEntry): string {
  return entry.branch ?? ""
}

export function getTaskStartedAt(entry: TaskEntry): string | null {
  return entry.startedAt ?? null
}

export function formatTaskStateLabel(entry: TaskEntry): string {
  if (entry.state === "done" && entry.doneReason) {
    return entry.doneReason
  }
  return entry.state
}


import type { TaskEntry } from "@/types"

export function getBoardStage(entry: TaskEntry): string {
  return entry.state
}

export function formatBoardStage(stage: string): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1)
}

export function getBoardStartedAt(entry: TaskEntry): string {
  return entry.startedAt ?? "\u2014"
}

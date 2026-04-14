import type { TaskEntry, DisplayEvent, CompletedEntry } from "@/types"

export type BoardLayoutVariant =
  | "linear"
  | "kanban"
  | "bento"
  | "timeline"
  | "stripe"
  | "activity"
  | "feed"
  | "notion"
  | "mission"

export interface BoardLayoutProps {
  groups: Map<string, TaskEntry[]>
  getEvents: (id: string) => DisplayEvent[]
  onNavigate: (page: string) => void
  awaitingReview: TaskEntry[]
  completed: CompletedEntry[]
  queued: TaskEntry[]
}

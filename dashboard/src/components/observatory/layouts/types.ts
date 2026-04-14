import type { TaskEntry, DisplayEvent } from "@/types"

export type LayoutVariant = "command-center" | "terminal"

/** Common props passed to every layout variant */
export interface LayoutProps {
  /** All running tasks */
  processes: TaskEntry[]
  /** Currently selected agent identifier */
  selectedId: string | null
  /** Callback when user selects a different agent */
  onSelect: (id: string) => void
  /** Get event log for a given identifier */
  getEventLog: (id: string) => DisplayEvent[]
}

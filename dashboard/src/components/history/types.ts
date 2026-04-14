import type { DashboardConfig, HistoryGroup } from "@/types"

export type HistoryLayoutVariant = "table" | "timeline" | "grid"

export interface HistoryLayoutProps {
  items: HistoryGroup[]
  loading: boolean
  onSelectTask: (id: string) => void
  config: DashboardConfig | null
}

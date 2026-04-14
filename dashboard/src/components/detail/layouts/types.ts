import type { TaskDetailData } from "@/hooks/useTaskDetail"

export type DetailLayoutVariant = "document" | "split" | "dashboard" | "focused"

export interface DetailLayoutProps {
  data: TaskDetailData
  onBack: () => void
  taskId: string
}

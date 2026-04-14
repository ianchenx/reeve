import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Status = "running" | "completed" | "failed" | "retrying"

const styles: Record<Status, string> = {
  running: "bg-status-info/15 text-status-info",
  completed: "bg-status-success/15 text-status-success",
  failed: "bg-status-error/15 text-status-error",
  retrying: "bg-status-warning/15 text-status-warning",
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className={cn("text-[11px] font-normal border-0 capitalize", styles[status])}>
      {status}
    </Badge>
  )
}

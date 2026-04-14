import type { ConnectionStatus } from "@/hooks/useSSE"
import { cn } from "@/lib/utils"

export function ConnectionDot({ status }: { status: ConnectionStatus }) {
  return (
    <div
      className={cn(
        "h-2 w-2 rounded-full transition-colors",
        status === "connected" && "bg-status-success shadow-[0_0_6px] shadow-status-success/50",
        status === "connecting" && "bg-muted-foreground animate-pulse",
        status === "error" && "bg-status-error animate-pulse",
      )}
      title={status}
    />
  )
}

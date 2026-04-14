import type { TaskEntry, DisplayEvent } from "@/types"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { AgentActivity } from "@/components/shared/AgentActivity"
import { ModelAvatar } from "@/components/shared/ModelAvatar"
import { cn } from "@/lib/utils"
import { getTaskAgent } from "@/lib/task-entry"

interface Props {
  process: TaskEntry
  selected: boolean
  onSelect: () => void
  events: DisplayEvent[]
}

const stateColor: Record<string, string> = {
  active: "text-emerald-400",
}

const dotColorMap: Record<string, string> = {
  active: "bg-emerald-400",
}

/**
 * Compact, borderless agent row for the master list.
 * Uses typography + spacing for hierarchy — no card wrapper.
 * Shows current activity with animated icon.
 */
export function AgentListItem({ process, selected, onSelect, events }: Props) {
  if (process.state !== "active") return null

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 transition-colors group cursor-pointer",
        "hover:bg-muted/50",
        selected && "bg-muted/80 border-l-2 border-primary",
        !selected && "border-l-2 border-transparent"
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Model avatar */}
        <ModelAvatar model={getTaskAgent(process)} size="sm" />

        {/* Status dot */}
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            dotColorMap[process.state] ?? "bg-zinc-600",
            !selected && "animate-pulse"
          )}
        />

        {/* Identifier */}
        <span className="font-mono text-[13px] text-foreground font-medium">
          {process.identifier}
        </span>

        {/* State */}
        <span className={cn("text-[11px]", stateColor[process.state] ?? "text-muted-foreground")}>
          {process.state}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Time */}
        <ElapsedTime
          startedAt={process.startedAt ?? process.updatedAt}
          live
          className="font-mono text-[11px] tabular-nums text-muted-foreground"
        />
      </div>

      {/* Current activity */}
      <div className="mt-1 pl-[18px]">
        <AgentActivity events={events} />
      </div>
    </button>
  )
}

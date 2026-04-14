import type { TaskEntry } from "@/types"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { ModelAvatar, ModelLabel } from "@/components/shared/ModelAvatar"
import { Badge } from "@/components/ui/badge"
import { getTaskAgent } from "@/lib/task-entry"

interface Props {
  process: TaskEntry
}

const stateBadgeClass: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
}

/**
 * Detail header — shows selected agent's full identity and metadata.
 * Used by all three layouts.
 */
export function DetailHeader({ process }: Props) {
  if (process.state !== "active") return null

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <ModelAvatar model={getTaskAgent(process)} size="md" />
        <span className="font-mono text-xl font-semibold text-foreground tracking-tight">
          {process.identifier}
        </span>
        <Badge
          variant="outline"
          className={stateBadgeClass[process.state] ?? ""}
        >
          {process.state}
        </Badge>
        <span className="flex-1" />
        <ElapsedTime
          startedAt={process.startedAt ?? process.updatedAt}
          live
          className="font-mono text-sm tabular-nums text-muted-foreground"
        />
        <ModelLabel model={getTaskAgent(process)} />
      </div>
      <p className="text-sm text-muted-foreground/70 leading-relaxed">
        {process.title}
      </p>
    </div>
  )
}

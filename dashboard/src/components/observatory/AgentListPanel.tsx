import type { TaskEntry } from "@/types"
import { IdentifierBadge } from "@/components/shared/IdentifierBadge"
import { Badge } from "@/components/ui/badge"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { cn } from "@/lib/utils"

interface Props {
  processes: TaskEntry[]
  selectedId: string
  onSelect: (identifier: string) => void
}

export function AgentListPanel({ processes, selectedId, onSelect }: Props) {
  if (processes.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No active agents
      </div>
    )
  }

  return (
    <nav className="flex flex-col gap-0.5 p-1.5">
      {processes.map(proc => {
        if (proc.state !== "active") return null
        const active = proc.identifier === selectedId
        return (
          <button
            key={proc.identifier}
            onClick={() => onSelect(proc.identifier)}
            className={cn(
              "flex flex-col gap-1 px-3 py-2 rounded-lg text-left transition-colors",
              active
                ? "bg-primary/10 text-foreground"
                : "hover:bg-muted/50 text-muted-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <IdentifierBadge identifier={proc.identifier} />
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 text-primary border-primary/20"
              >
                {proc.state}
              </Badge>
            </div>
            <span className="text-[11px] truncate">{proc.title}</span>
            <ElapsedTime startedAt={proc.startedAt ?? proc.updatedAt} live className="text-[10px]" />
          </button>
        )
      })}
    </nav>
  )
}

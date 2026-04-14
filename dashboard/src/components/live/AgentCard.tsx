import { useState } from "react"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { IdentifierBadge } from "@/components/shared/IdentifierBadge"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { AgentEventList } from "./AgentEventList"
import { WorktreeStatus } from "./WorktreeStatus"
import type { TaskEntry, CompletedEntry, DisplayEvent } from "@/types"
import { cn } from "@/lib/utils"
import { SquareIcon } from "lucide-react"
import { getTaskAgent } from "@/lib/task-entry"
import { ContextUsage } from "@/components/shared/ContextUsage"

interface ActiveCardProps {
  entry: TaskEntry
  events: DisplayEvent[]
  onKill: () => void
  onOpen: () => void
}

export function ActiveAgentCard({ entry, events, onKill, onOpen }: ActiveCardProps) {
  const [open, setOpen] = useState(false)

  if (entry.state !== "active") return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn("border rounded-xl overflow-hidden")}>
        {/* Header — manually toggle, no nested buttons */}
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-muted/50 select-none"
          onClick={() => setOpen(v => !v)}
          onDoubleClick={(e) => { e.stopPropagation(); onOpen() }}
        >
          <IdentifierBadge identifier={entry.identifier} />
          <span className="flex-1 text-[13px] truncate">{entry.title}</span>
          <Badge variant="secondary" className="text-[11px] shrink-0">
            {getTaskAgent(entry)}
          </Badge>
          <Badge className="text-[11px] shrink-0 text-primary border-primary/20 bg-primary/5">
            active
          </Badge>
          <ElapsedTime startedAt={entry.startedAt ?? entry.updatedAt} live />
          <ContextUsage used={entry.usage?.contextUsed} size={entry.usage?.contextSize} />
          <StatusBadge status="running" />
          <button
            onClick={(e) => { e.stopPropagation(); onKill() }}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Stop agent"
          >
            <SquareIcon className="h-3 w-3" />
          </button>
        </div>
        <CollapsibleContent>
          <AgentEventList events={events} />
          <WorktreeStatus identifier={entry.identifier} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface PublishedCardProps {
  entry: TaskEntry
}

export function PublishedCard({ entry }: PublishedCardProps) {
  if (entry.state !== "published") return null

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <IdentifierBadge identifier={entry.identifier} />
        <span className="flex-1 text-[13px] truncate">{entry.title}</span>
        <Badge variant="secondary" className="text-[11px] shrink-0">
          {getTaskAgent(entry)}
        </Badge>
        <Badge className="text-[11px] text-status-review bg-status-review/10 shrink-0">
          {"published"}
        </Badge>
        {entry.prUrl && (
          <a href={entry.prUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline shrink-0">
            PR
          </a>
        )}
      </div>
    </div>
  )
}

interface CompletedCardProps {
  entry: CompletedEntry
}

export function CompletedAgentCard({ entry }: CompletedCardProps) {
  const status = entry.reason ? "failed" : "completed"

  return (
    <div className="border rounded-xl overflow-hidden opacity-70">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <IdentifierBadge identifier={entry.identifier} />
        <span className="flex-1 text-[13px] truncate">{entry.title || "(untitled)"}</span>
        {entry.prUrl && (
          <a href={entry.prUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline shrink-0">
            PR
          </a>
        )}
        <StatusBadge status={status} />
      </div>
      {entry.reason && (
        <div className="px-4 py-2 border-t text-[11px] text-destructive font-mono truncate">
          {entry.reason}
        </div>
      )}
    </div>
  )
}

/**
 * Layout 1: Linear
 * Ref: Linear app sidebar, Apple Mail — ultra-minimal flat list
 * Hairline separators, no cards, pure typography hierarchy
 */
import type { BoardLayoutProps } from "./types"
import { ModelAvatar } from "@/components/shared/ModelAvatar"
import { AgentActivity } from "@/components/shared/AgentActivity"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getTaskAgent } from "@/lib/task-entry"
import { formatBoardStage, getBoardStage, getBoardStartedAt } from "./fallbacks"
import { ContextUsage } from "@/components/shared/ContextUsage"

const stageCls: Record<string, string> = {
  implement: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
}

export function LinearBoard({ groups, getEvents, onNavigate }: BoardLayoutProps) {
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="h-full overflow-y-auto">
      {sorted.map(([repo, procs]) => (
        <div key={repo}>
          {/* Group header */}
          <div className="px-5 py-2.5 border-b border-border/30">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
              {repo}
              <span className="ml-2 text-muted-foreground/30">{procs.length}</span>
            </span>
          </div>

          {/* Agent rows */}
          {procs.map(p => {
            const stage = getBoardStage(p)
            const startedAt = getBoardStartedAt(p)
            return (
              <button
                key={p.identifier}
                onClick={() => onNavigate(`live:${p.identifier}`)}
                className="w-full text-left flex items-center gap-3 px-5 py-3.5 border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group"
              >
                <ModelAvatar model={getTaskAgent(p)} size="sm" />
                <span className="font-mono text-[13px] font-medium text-foreground w-[80px] shrink-0">
                  {p.identifier}
                </span>
                <Badge className={cn("text-[10px] shrink-0", stageCls[stage] ?? "")}>
                  {formatBoardStage(stage)}
                </Badge>
                <span className="text-[13px] text-foreground/70 truncate flex-1">{p.title}</span>
                <AgentActivity events={getEvents(p.identifier)} compact />
                <ContextUsage used={(p as unknown as Record<string, Record<string, number>>).usage?.contextUsed} size={(p as unknown as Record<string, Record<string, number>>).usage?.contextSize} />
                {startedAt === "\u2014"
                  ? <span className="text-[11px] tabular-nums text-muted-foreground/50 shrink-0">\u2014</span>
                  : <ElapsedTime startedAt={startedAt} live className="text-[11px] tabular-nums text-muted-foreground/50 shrink-0" />}
                <span className="text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors">→</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

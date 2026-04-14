/**
 * ConcurrencyPill — Dynamic Island-style agent activity indicator.
 *
 * Sits in the Shell header. Hidden when idle, appears with pulsing dots
 * when agents are active. Click opens a popover with individual agent details.
 */
import { Link } from "@tanstack/react-router"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useReeveStore } from "@/hooks/useReeveStore"

import { ElapsedTime } from "@/components/shared/ElapsedTime"

function PulseDots({ count }: { count: number }) {
  const totalDots = Math.min(count, 3)

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: totalDots }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 w-1.5 rounded-full transition-all duration-500 bg-emerald-400 animate-[pulse_2s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  )
}

export function ConcurrencyPill() {
  const store = useReeveStore()

  const active = store.active
  const queued = store.queued
  const running = active.length

  // Idle — invisible
  if (running === 0 && queued.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-border/50 hover:border-border hover:bg-muted/50 transition-all cursor-pointer"
      >
        <PulseDots count={running} />
        <span className="text-xs font-mono tabular-nums font-medium text-emerald-400">
          {running}
        </span>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-72 p-0"
      >
        {/* Active agents */}
        {active.length > 0 && (
          <div className="p-1">
            {active.map(agent => (
              <Link
                key={agent.identifier}
                to="/board/$agentId"
                params={{ agentId: agent.identifier }}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 animate-[pulse_2s_ease-in-out_infinite]" />
                <span className="text-xs font-mono font-medium text-foreground/90 group-hover:text-foreground truncate">
                  {agent.identifier}
                </span>
                <span className="text-[10px] text-muted-foreground/60 truncate">
                  {agent.repo?.split("/").pop()}
                </span>
                <span className="ml-auto shrink-0">
                  {agent.startedAt && (
                    <ElapsedTime
                      startedAt={agent.startedAt}
                      live
                      className="text-[10px] font-mono tabular-nums text-muted-foreground/50"
                    />
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Queued count */}
        {queued.length > 0 && (
          <div className="px-4 py-2 border-t text-[11px] text-muted-foreground/60">
            {queued.length} queued
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t">
          <Link
            to="/board"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View Board →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

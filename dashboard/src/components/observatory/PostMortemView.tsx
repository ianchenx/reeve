/**
 * PostMortemView — In-place post-mortem view after an agent completes.
 *
 * Renders the last terminal output in a dimmed, static state with
 * outcome metadata (PR link, duration, agent). Avoids jarring redirects
 * by morphing the Observatory page in-place.
 */
import { Link } from "@tanstack/react-router"
import { CheckCircle2Icon, XCircleIcon, ExternalLinkIcon, ClockIcon } from "lucide-react"
import { formatDurationMs } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { DisplayEvent, HistoryEntry } from "@/types"

interface PostMortemProps {
  events: DisplayEvent[]
  meta: HistoryEntry | null
  agentId: string
}

export function PostMortemView({ events, meta, agentId }: PostMortemProps) {
  const isSuccess = meta?.outcome === "completed"
  const duration = meta?.startedAt && meta.endedAt
    ? formatDurationMs(new Date(meta.endedAt).getTime() - new Date(meta.startedAt).getTime())
    : null

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-[13px]">
      {/* Outcome banner */}
      <div className={cn(
        "flex items-center gap-3 px-5 py-3 border-b shrink-0 transition-colors",
        isSuccess
          ? "bg-emerald-950/40 border-emerald-900/40"
          : "bg-red-950/30 border-red-900/30"
      )}>
        {isSuccess ? (
          <CheckCircle2Icon className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircleIcon className="h-4 w-4 text-red-400" />
        )}
        <span className={cn(
          "text-sm font-medium",
          isSuccess ? "text-emerald-300" : "text-red-300"
        )}>
          {isSuccess ? "Completed" : "Failed"}
        </span>

        {duration && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ClockIcon className="h-3 w-3" />
            {duration}
          </span>
        )}

        {meta?.agent && (
          <span className="text-xs text-zinc-600">{meta.agent}</span>
        )}

        <div className="flex-1" />

        {meta?.prUrl && (
          <a
            href={meta.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            Pull Request
          </a>
        )}

        {meta?.historyId && (
          <Link
            to="/history/$taskId"
            params={{ taskId: meta.historyId }}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors ml-3"
          >
            View Full History →
          </Link>
        )}
      </div>

      {/* Static terminal output — dimmed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0 opacity-60">
        {events.length > 0 ? (
          events.map((e, i) => (
            <div key={i}>
              {renderStaticEvent(e)}
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600">
            No session events recorded
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-900/50 border-t border-zinc-800 text-[11px] shrink-0">
        <span className={isSuccess ? "text-emerald-400" : "text-red-400"}>
          {agentId}
        </span>
        <span className="text-zinc-600">
          {isSuccess ? "completed" : "failed"}
        </span>
        <span className="flex-1" />
        <span className="text-zinc-600 tabular-nums">{events.length} events</span>
      </div>
    </div>
  )
}

function renderStaticEvent(e: DisplayEvent) {
  switch (e.type) {
    case "thinking":
      return (
        <div className="py-1.5 pl-4 text-zinc-500 italic">
          <span className="text-zinc-600 select-none">{'# '}</span>
          {e.text}
        </div>
      )
    case "tool_call":
    case "tool_result":
      return (
        <div className="py-1.5 flex items-start gap-2">
          <span className={cn("select-none font-bold shrink-0", e.status === "failed" ? "text-red-400/60" : "text-emerald-500/60")}>
            {e.status === "completed" ? '\u2713' : e.status === "failed" ? '\u2717' : '$'}
          </span>
          <span className="text-zinc-400">{e.text}</span>
          <span className="ml-auto text-zinc-700 text-[11px] tabular-nums shrink-0">{e.time}</span>
        </div>
      )
    default:
      return (
        <div className="py-1 pl-4 text-zinc-600 text-[13px]">{e.text}</div>
      )
  }
}

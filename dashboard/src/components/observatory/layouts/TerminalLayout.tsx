import type { LayoutProps } from "./types"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { FileChangesPanel } from "@/components/observatory/FileChangesPanel"
import { cn } from "@/lib/utils"
import { getTaskAgent } from "@/lib/task-entry"

/**
 * Layout D: Terminal
 *
 * Session rendered as a modern terminal (Warp-style).
 * Monospace throughout, blinking cursor, inline diff rendering.
 * Bottom status bar like Vim/tmux.
 */
export function TerminalLayout({ processes, selectedId, onSelect, getEventLog }: LayoutProps) {
  const selectedEntry = processes.find(p => p.identifier === selectedId) ?? null
  const selected = (selectedEntry && selectedEntry.state === "active") ? selectedEntry : null
  const events = selectedId ? getEventLog(selectedId) : []

  const renderEvent = (e: typeof events[number], i: number) => {
    const isLatest = i === events.length - 1
    switch (e.type) {
      case "thinking":
        return (
          <div className={cn("py-1.5 pl-4 text-zinc-500 italic", isLatest && "text-zinc-400")}>
            <span className="text-zinc-600 select-none">{'# '}</span>
            {e.text}
          </div>
        )
      case "tool_call":
      case "tool_result":
        return (
          <div className={cn("py-1.5 flex items-start gap-2", isLatest && "text-emerald-300")}>
            <span className={cn("select-none font-bold shrink-0", e.status === "failed" ? "text-red-400" : "text-emerald-500")}>
              {e.status === "completed" ? '\u2713' : e.status === "failed" ? '\u2717' : '$'}
            </span>
            <span className={cn("font-medium", isLatest ? "text-zinc-100" : "text-zinc-300")}>
              {e.text}
            </span>
            <span className="ml-auto text-zinc-700 text-[11px] tabular-nums shrink-0">{e.time}</span>
          </div>
        )
      default:
        return (
          <div className="py-1 pl-4 text-zinc-500 text-[13px]">{e.text}</div>
        )
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-[13px]">
      {/* Top bar — tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
        {processes.map(p => (
          <button
            key={p.identifier}
            onClick={() => onSelect(p.identifier)}
            className={cn(
              "px-3 py-1 text-[12px] rounded-t transition-colors cursor-pointer",
              p.identifier === selectedId
                ? "bg-zinc-950 text-zinc-200 border border-zinc-800 border-b-zinc-950"
                : "text-zinc-600 hover:text-zinc-400"
            )}
          >
            {p.identifier}
          </button>
        ))}
      </div>

      {selected ? (
        <>
          {/* Terminal body */}
          <div className="flex flex-1 min-h-0">
            {/* Main terminal pane */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0">
                {events.map((e, i) => (
                  <div key={i}>{renderEvent(e, i)}</div>
                ))}
                {/* Blinking cursor */}
                <div className="py-1.5 flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">{'$'}</span>
                  <span className="w-2 h-4 bg-emerald-400 animate-pulse" />
                </div>
              </div>

              {/* Status bar */}
              <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-900/50 border-t border-zinc-800 text-[11px]">
                <span className="text-emerald-400">{selected.identifier}</span>
                <span className="text-zinc-600">{selected.state}</span>
                <span className="text-zinc-600">{getTaskAgent(selected)}</span>
                <span className="flex-1" />
                <ElapsedTime
                  startedAt={selected.startedAt ?? selected.updatedAt}
                  live
                  className="text-zinc-500 text-[11px] tabular-nums font-mono"
                />
                <span className="text-zinc-600 tabular-nums">{events.length} events</span>
              </div>
            </div>

            {/* Side panel — files */}
            <div className="w-[280px] shrink-0 border-l border-zinc-800 flex flex-col">
              <div className="px-3 py-2 border-b border-zinc-800">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">Files</span>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2">
                <FileChangesPanel identifier={selectedId!} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <span className="text-emerald-500 mr-2">{'$'}</span>
          <span>select agent to begin session</span>
          <span className="w-2 h-4 bg-emerald-400/50 animate-pulse ml-1" />
        </div>
      )}
    </div>
  )
}

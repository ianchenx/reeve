import { useState } from "react"
import type { LayoutProps } from "./types"
import { AgentPill } from "./AgentPill"
import { SessionPanel } from "@/components/observatory/SessionPanel"
import { FileChangesPanel } from "@/components/observatory/FileChangesPanel"
import { ElapsedTime } from "@/components/shared/ElapsedTime"
import { AgentActivity } from "@/components/shared/AgentActivity"
import { ModelAvatar, ModelLabel } from "@/components/shared/ModelAvatar"
import { Badge } from "@/components/ui/badge"
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getTaskAgent } from "@/lib/task-entry"

/**
 * Layout C: Command Center
 *
 * Session stream is the hero — fills available width.
 * File changes in a collapsible right panel (280px).
 * Agent selection via top-bar pills.
 *
 * Inspired by Stripe Radar / mission control aesthetic.
 */
export function CommandCenterLayout({ processes, selectedId, onSelect, getEventLog }: LayoutProps) {
  const selectedEntry = processes.find(p => p.identifier === selectedId) ?? null
  const selected = (selectedEntry && selectedEntry.state === "active") ? selectedEntry : null
  const events = selectedId ? getEventLog(selectedId) : []
  const [panelOpen, setPanelOpen] = useState(true)

  const stateBadgeClass: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar: pills + agent info ─── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b shrink-0">
        {processes.map(p => (
          <AgentPill
            key={p.identifier}
            process={p}
            selected={p.identifier === selectedId}
            onSelect={() => onSelect(p.identifier)}
          />
        ))}
        <span className="flex-1" />
        {selected && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ModelAvatar model={getTaskAgent(selected)} size="sm" />
            <span className="font-mono">{selected.identifier}</span>
            <Badge
              variant="outline"
              className={`text-[10px] ${stateBadgeClass[selected.state] ?? ""}`}
            >
              {selected.state}
            </Badge>
            <span className="truncate max-w-[200px]">{selected.title}</span>
          </div>
        )}
      </div>

      {selected ? (
        <div className="flex-1 min-h-0 flex">
          {/* ── Left: Session hero ─── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Session header + metadata */}
            <div className="px-5 pt-3 pb-2 flex items-center gap-3 border-b border-border/50">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Session
              </span>
              <AgentActivity events={events} className="flex-1" />
              <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-muted-foreground/50">
                <ElapsedTime startedAt={selected.startedAt ?? selected.updatedAt} live />
                <span>{events.length} events</span>
                <ModelLabel model={getTaskAgent(selected)} />
              </div>
              {/* Panel toggle */}
              <button
                onClick={() => setPanelOpen(o => !o)}
                className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={panelOpen ? "Hide changes" : "Show changes"}
              >
                {panelOpen ? (
                  <PanelRightCloseIcon className="h-4 w-4" />
                ) : (
                  <PanelRightOpenIcon className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Session stream — the hero */}
            <div className="flex-1 min-h-0">
              <SessionPanel events={events} />
            </div>
          </div>

          {/* ── Right: Collapsible changes panel ─── */}
          <div
            className={cn(
              "border-l flex flex-col transition-all duration-300 ease-out shrink-0",
              panelOpen ? "w-[280px]" : "w-0"
            )}
            style={{ overflow: "hidden" }}
          >
            <div className="px-3 pt-3 pb-1.5 shrink-0 w-[280px]">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Changes
              </span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 w-[280px]">
              <FileChangesPanel identifier={selectedId!} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select an agent to view details
        </div>
      )}
    </div>
  )
}

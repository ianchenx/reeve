/**
 * BoardPage — Live: uses LinearBoard layout.
 *
 * Click → directly navigates to Agent Observatory (no inline preview).
 * Groups agents by repo, Linear/Apple Mail flat-list style.
 */
import { useCallback, useMemo, useState } from "react"
import { useReeveStore } from "@/hooks/useReeveStore"
import { useConfig } from "@/hooks/useConfig"
import { LinearBoard } from "@/components/board/LinearBoard"
import { IdentifierBadge } from "@/components/shared/IdentifierBadge"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { useNavigate } from "@tanstack/react-router"
import { Trash2Icon, ExternalLinkIcon } from "lucide-react"
import { cleanTask, cleanAllDone } from "@/api"
import type { TaskEntry, DisplayEvent } from "@/types"

export function BoardPage() {
  const store = useReeveStore()
  const { config } = useConfig()
  const navigate = useNavigate()

  const handleNavigate = useCallback((page: string) => {
    const agentId = page.startsWith("live:") ? page.slice(5) : page
    navigate({ to: "/board/$agentId", params: { agentId } })
  }, [navigate])

  const active = [...store.active]
  const queued = store.queued
  const done = store.done
  const [cleaningAll, setCleaningAll] = useState(false)

  const handleClean = async (identifier: string) => {
    try { await cleanTask(identifier) } catch { /* ignore */ }
  }

  const handleCleanAll = async () => {
    setCleaningAll(true)
    try { await cleanAllDone() }
    finally { setCleaningAll(false) }
  }

  // ── Build groups by repo (what LinearBoard expects) ──
  const groups = useMemo(() => {
    const map = new Map<string, TaskEntry[]>()
    for (const t of active) {
      const repo = t.repo?.split("/").pop() ?? "unknown"
      const list = map.get(repo) ?? []
      list.push(t)
      map.set(repo, list)
    }
    return map
  }, [active])

  // Stub — LinearBoard needs getEvents but we keep the list clean
  const getEvents = useCallback((_id: string): DisplayEvent[] => {
    return store.getEventLog(_id)
  }, [store])

  const hasActive = active.length > 0
  const hasQueued = queued.length > 0
  const hasDone = done.length > 0

  const projects = config?.projects ?? []
  const pollSeconds = Math.max(1, Math.round((config?.polling.intervalMs ?? 60_000) / 1000))
  const soloProject = projects.length === 1 ? projects[0] : null
  const soloProjectLabel = soloProject
    ? (soloProject.name ?? soloProject.repo.split("/").pop() ?? soloProject.slug)
    : ""

  return (
    <div className="flex flex-col h-full">
      {/* ── Agent list (LinearBoard) ── */}
      <div className="flex-1 overflow-y-auto">
        {!hasActive && !hasQueued && !hasDone && (
          <div className="py-20 text-center max-w-sm mx-auto px-6">
            <p className="text-sm text-muted-foreground/80">
              Reeve polls Linear every {pollSeconds}s for issues in <span className="font-medium">Todo</span>.
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1.5">
              Create one to get started.
            </p>
            {soloProject && (
              <a
                href={`https://linear.app/project/${soloProject.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-5 gap-2"}
              >
                Open {soloProjectLabel} in Linear
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {hasActive && (
          <LinearBoard
            groups={groups}
            getEvents={getEvents}
            onNavigate={handleNavigate}
            awaitingReview={[]}
            completed={[]}
            queued={queued}
          />
        )}

        {/* Queued section (when no active agents, show queue standalone) */}
        {!hasActive && hasQueued && (
          <div>
            <div className="px-5 py-2.5 border-b border-border/30">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
                Queue
                <span className="ml-2 text-muted-foreground/30">{queued.length}</span>
              </span>
            </div>
            {queued.map(entry => (
              <div key={entry.identifier} className="flex items-center gap-3 px-5 py-3 border-b border-border/10 opacity-50">
                <div className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 shrink-0" />
                <IdentifierBadge identifier={entry.identifier} />
                <Badge variant="outline" className="text-[10px] shrink-0">Queued</Badge>
                <span className="text-[13px] text-foreground/50 truncate flex-1">{entry.title}</span>
              </div>
            ))}
          </div>
        )}

        {hasDone && (
          <div>
            <div className="px-5 py-2.5 border-b border-border/30 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
                Done
                <span className="ml-2 text-muted-foreground/30">{done.length}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCleanAll}
                disabled={cleaningAll}
                className="text-[10px] text-muted-foreground h-6 px-2"
              >
                {cleaningAll ? "Cleaning\u2026" : "Clean All Worktrees"}
              </Button>
            </div>
            {done.map(entry => (
              <div key={entry.identifier} className="flex items-center gap-3 px-5 py-3 border-b border-border/10 opacity-60">
                <IdentifierBadge identifier={entry.identifier} />
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {entry.doneReason === "merged" ? "Merged" : "Failed"}
                </Badge>
                <span className="text-[13px] text-foreground/50 truncate flex-1">{entry.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleClean(entry.identifier)}
                  title="Clean worktree"
                  className="text-muted-foreground hover:text-destructive h-6 w-6"
                >
                  <Trash2Icon className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

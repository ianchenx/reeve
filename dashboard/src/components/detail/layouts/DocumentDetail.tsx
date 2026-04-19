/**
 * DocumentDetail — full-width document layout.
 *
 * Ref: GitHub PR detail, Linear issue view, Vercel deployment detail
 *
 * Structure:
 * - Header: badges, title, metrics, attempt pills (full width)
 * - Cards row: Manifest + File Changes (conditional grid)
 * - Content area: Session events (full width)
 */
import type { ReactNode } from "react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { IdentifierBadge } from "@/components/shared/IdentifierBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ModelAvatar, ModelLabel } from "@/components/shared/ModelAvatar"
import { FileChanges } from "@/components/detail/FileChanges"
import { SessionViewer } from "@/components/detail/SessionViewer"
import { PromptViewer, StderrViewer } from "@/components/detail/PromptViewer"
import { formatDuration } from "@/lib/time"
import { formatCompactTokenCount, formatTokenUsage, formatCost, getDisplayTokenBreakdown, getTokenTotal, getCostUsd } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useNavigate } from "@tanstack/react-router"
import { useConfig } from "@/hooks/useConfig"
import { useDebugMode } from "@/hooks/useDebugMode"
import type { DetailLayoutProps } from "./types"
import type { HistoryEntry } from "@/types"
import { ArrowLeftIcon, ClockIcon, GitPullRequestIcon, ActivityIcon, CoinsIcon, FileTextIcon, AlertTriangleIcon } from "lucide-react"

function Metric({ icon: Icon, label, value }: { icon: typeof ClockIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

// Stage config: data-driven, extensible. Add new stages here — no other changes needed.
const STAGE_CONFIG: Record<string, { label: string; color?: string }> = {
  implement: { label: "Executor" },
  review:    { label: "Reviewer", color: "text-stage-review" },
}

const DEFAULT_STAGE = { label: "Agent" }

function stageConfig(entry: HistoryEntry): { label: string; color?: string } {
  const stage = entry.stage || entry.phase || "implement"
  return STAGE_CONFIG[stage] ?? { ...DEFAULT_STAGE, label: stage.charAt(0).toUpperCase() + stage.slice(1) }
}

function OutcomeDot({ outcome }: { outcome?: string }) {
  if (outcome === "completed") return <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
  if (outcome === "failed") return <span className="w-1.5 h-1.5 rounded-full bg-status-error" />
  return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" />
}

function AttemptPill({ entry, isActive, onClick }: { entry: HistoryEntry; isActive: boolean; onClick: () => void }) {
  const config = stageConfig(entry)
  const stage = entry.stage || entry.phase || "implement"
  const round = typeof entry.hookReviewRound === "number" ? entry.hookReviewRound : entry.attempt

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer",
        isActive
          ? "bg-primary/10 text-primary ring-1 ring-primary/30 font-medium"
          : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/30"
      )}
    >
      <OutcomeDot outcome={entry.outcome} />
      <span>{config.label}{stage !== "implement" ? ` #${round}` : entry.attempt > 1 ? ` #${entry.attempt}` : ""}</span>
      <ModelAvatar model={entry.agent} size="sm" />
    </button>
  )
}

export function DocumentDetail({ data, onBack }: DetailLayoutProps) {
  const { meta, sessionEvents, prompt, relatedAttempts } = data
  const navigate = useNavigate()
  const { config } = useConfig()
  // ?debug in URL or localStorage enables developer panels
  const { debug: debugMode } = useDebugMode()
  const [rightPanel, setRightPanel] = useState<"prompt" | "stderr">("prompt")

  if (!meta) return null

  const resolveProjectName = (slug: string | undefined): string | null => {
    if (!slug || !config?.projects) return slug ?? null
    for (const p of config.projects) {
      if (p.slug === slug) {
        if (p.name) return p.name
        return p.repo.split("/").pop()
          ?.replace(/[-_]/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase()) ?? slug
      }
    }
    return slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  }

  const handleSelectAttempt = (historyId: string) => {
    navigate({ to: "/history/$taskId", params: { taskId: historyId } })
  }

  const outcomeStatus = meta.outcome === "completed" ? "completed" : meta.outcome === "failed" ? "failed" : "running"
  const phaseLabel = meta.stage || meta.phase || "implement"

  const sortedAttempts = relatedAttempts.length > 1
    ? [...relatedAttempts].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    : []
  const usageBreakdown = getDisplayTokenBreakdown(meta.tokensUsed)
  const costUsd = getCostUsd(meta.tokensUsed)

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] w-full max-w-full overflow-hidden">
      {/* ── Header ─── */}
      <div className="shrink-0 p-5 pb-4 space-y-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to history
        </button>

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <IdentifierBadge identifier={meta.identifier} />
              <StatusBadge status={outcomeStatus} />
              <Badge className="text-[11px] capitalize">{phaseLabel}</Badge>
              {typeof meta.hookReviewRound === "number" && meta.hookReviewRound > 0 && (
                <Badge className="text-[11px] text-stage-review bg-stage-review/10 capitalize">Round {meta.hookReviewRound}</Badge>
              )}
            </div>
            <h1 className="text-lg font-semibold tracking-tight leading-snug">{meta.title}</h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-1.5 text-xs">
            <ModelAvatar model={meta.agent} size="sm" />
            <ModelLabel model={meta.agent} />
          </div>
          <Metric icon={ClockIcon} label="Duration" value={<span className="font-mono tabular-nums">{formatDuration(meta.startedAt, meta.endedAt)}</span>} />
          {typeof usageBreakdown?.input === "number" && usageBreakdown.input > 0 && (
            <Metric icon={ActivityIcon} label="Input" value={<span className="font-mono tabular-nums">{formatCompactTokenCount(usageBreakdown.input)}</span>} />
          )}
          {typeof usageBreakdown?.output === "number" && usageBreakdown.output > 0 && (
            <Metric icon={ActivityIcon} label="Output" value={<span className="font-mono tabular-nums">{formatCompactTokenCount(usageBreakdown.output)}</span>} />
          )}
          {!usageBreakdown && getTokenTotal(meta.tokensUsed) !== null && (
            <Metric icon={ActivityIcon} label="Tokens" value={<span className="font-mono tabular-nums">{formatTokenUsage(meta.tokensUsed)}</span>} />
          )}
          {typeof costUsd === "number" && (
            <Metric icon={CoinsIcon} label="Cost" value={<span className="font-mono tabular-nums">{formatCost(costUsd)}</span>} />
          )}
          {meta.prUrl && (
            <Metric icon={GitPullRequestIcon} label="PR" value={<a href={meta.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open</a>} />
          )}
          <span className="text-xs text-muted-foreground">Started: {new Date(meta.startedAt).toLocaleString()}</span>
          {meta.endedAt && <span className="text-xs text-muted-foreground">Ended: {new Date(meta.endedAt).toLocaleString()}</span>}
          {meta.projectSlug && <span className="text-xs text-muted-foreground">Project: {resolveProjectName(meta.projectSlug)}</span>}
          <span className="text-xs text-muted-foreground">Attempt: {meta.attempt}</span>
        </div>

        {/* ── Attempt pills ─── */}
        {sortedAttempts.length > 0 && (
          <div className="flex items-center gap-1 pt-1">
            {sortedAttempts.map(entry => (
              <AttemptPill
                key={entry.historyId}
                entry={entry}
                isActive={entry.historyId === meta.historyId}
                onClick={() => handleSelectAttempt(entry.historyId)}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── Cards row: FileChanges only ─── */}
      {(meta.changedFiles?.length || meta.diffStat) && (
        <div className="shrink-0 px-5 py-4">
          <FileChanges changedFiles={meta.changedFiles} diffStat={meta.diffStat} identifier={meta.identifier} />
        </div>
      )}

      {/* ── Content area ─── */}
      <div className="flex-1 min-h-0 flex border-t overflow-hidden">
        {/* Session events */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/5 shrink-0">
            <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-[11px] font-semibold text-muted-foreground/60">Session</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <SessionViewer events={sessionEvents} maxHeight="100%" className="h-full" />
          </div>
        </div>

        {/* Debug panels — only shown with ?debug in URL */}
        {debugMode && (() => {
          const hasStderr = !!meta.stderr
          const panels: { id: typeof rightPanel; label: string; icon: typeof FileTextIcon; show: boolean }[] = [
            { id: "prompt", label: "Prompt", icon: FileTextIcon, show: true },
            { id: "stderr", label: "Stderr", icon: AlertTriangleIcon, show: hasStderr },
          ]
          return (
            <div className="w-[45%] shrink-0 min-w-0 flex flex-col border-l">
              <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/5 shrink-0">
                {panels.filter(p => p.show).map(p => {
                  const Icon = p.icon
                  return (
                    <button
                      key={p.id}
                      onClick={() => setRightPanel(p.id)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 rounded text-[10px] transition-colors cursor-pointer",
                        rightPanel === p.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/30"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {rightPanel === "prompt" && (
                  <PromptViewer content={prompt} title="Prompt" maxHeight="100%" />
                )}
                {rightPanel === "stderr" && hasStderr && (
                  <StderrViewer content={meta.stderr!} maxHeight="100%" />
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

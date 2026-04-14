/**
 * TableHistory — grouped data table: one row per issue, latest attempt.
 *
 * Ref: Stripe Dashboard, Datadog Monitors, Sentry Issues
 * Grouped by issue, showing latest attempt data with attempt count badge.
 * Click row → detail page for full attempt history.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { IdentifierBadge } from "@/components/shared/IdentifierBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ModelAvatar, ModelLabel } from "@/components/shared/ModelAvatar"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatDuration } from "@/lib/time"
import { formatTokenUsage } from "@/lib/format"
import type { HistoryLayoutProps } from "./types"
import { ClockIcon, RotateCcwIcon } from "lucide-react"
import { ContextUsage } from "@/components/shared/ContextUsage"

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 86_400_000) {
    const hrs = Math.floor(diffMs / 3_600_000)
    if (hrs > 0) return `${hrs}h ago`
    const mins = Math.floor(diffMs / 60_000)
    return mins > 0 ? `${mins}m ago` : "just now"
  }
  if (diffMs < 604_800_000) {
    return d.toLocaleDateString("en-US", { weekday: "short" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function outcomeStatus(attempt: { outcome?: string; endedAt?: string }): "completed" | "running" | "failed" {
  if (attempt.outcome === "completed") return "completed"
  if (!attempt.outcome && !attempt.endedAt) return "running"
  return "failed"
}

function projectName(slug: string | undefined, config: HistoryLayoutProps["config"]): string {
  if (!slug) return "—"
  const p = config?.projects.find(pr => pr.slug === slug)
  if (p?.name) return p.name
  if (p?.repo) {
    const dirName = p.repo.split("/").pop() ?? slug
    return dirName.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  }
  return slug.slice(0, 8)
}

export function TableHistory({ items, loading, onSelectTask, config }: HistoryLayoutProps) {
  if (loading) {
    return (
      <div className="p-5 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon className="h-6 w-6 text-muted-foreground" />}
        title="No history entries"
        description="Completed and failed task attempts will appear here."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border mx-5 mt-4">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
            <th className="text-left px-5 py-3 font-medium">Task</th>
            <th className="text-left px-3 py-3 font-medium w-[140px]">Project</th>
            <th className="text-left px-3 py-3 font-medium w-[110px]">Agent</th>
            <th className="text-right px-3 py-3 font-medium w-[80px]">Duration</th>
            <th className="text-right px-3 py-3 font-medium w-[90px]">Tokens</th>
            <th className="text-right px-3 py-3 font-medium w-[80px]">Context</th>
            <th className="text-center px-3 py-3 font-medium w-[60px]">Runs</th>
            <th className="text-right px-3 py-3 font-medium w-[120px]">Time</th>
            <th className="text-right px-5 py-3 font-medium w-[90px]">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {items.map(group => {
            const latest = group.attempts[0]
            if (!latest) return null
            const status = outcomeStatus(latest)
            const attemptCount = group.attempts.length

            return (
              <tr
                key={group.issueId}
                onClick={() => onSelectTask(latest.historyId)}
                className="hover:bg-muted/20 cursor-pointer transition-colors"
              >
                {/* Task: identifier + title */}
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0">
                      <IdentifierBadge identifier={group.identifier} />
                    </div>
                    <span className="truncate text-foreground/80">{group.title}</span>
                  </div>
                </td>

                {/* Project */}
                <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[140px] whitespace-nowrap">
                  {projectName(latest.projectSlug, config)}
                </td>

                {/* Agent */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <ModelAvatar model={latest.agent} size="sm" />
                    <ModelLabel model={latest.agent} className="text-[10px]" />
                  </div>
                </td>

                {/* Duration */}
                <td className="px-3 py-3 text-right text-xs font-mono tabular-nums text-muted-foreground">
                  {formatDuration(latest.startedAt, latest.endedAt)}
                </td>

                {/* Tokens */}
                <td className="px-3 py-3 text-right text-xs font-mono tabular-nums text-muted-foreground">
                  {formatTokenUsage(latest.tokensUsed)}
                </td>

                {/* Context */}
                <td className="px-3 py-3 text-right">
                  <ContextUsage used={latest.contextUsed} size={latest.contextSize} />
                </td>

                {/* Attempt count */}
                <td className="px-3 py-3 text-center">
                  {attemptCount > 1 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <RotateCcwIcon className="h-3 w-3" />
                      {attemptCount}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/30">1</span>
                  )}
                </td>

                {/* Time */}
                <td className="px-3 py-3 text-right text-[11px] text-muted-foreground/50 whitespace-nowrap">
                  {formatDate(group.latestStartedAt)}
                </td>

                {/* Status */}
                <td className="px-5 py-3 text-right">
                  <StatusBadge status={status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

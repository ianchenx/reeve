import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelAvatar, ModelLabel } from "@/components/shared/ModelAvatar"
import { useHistory } from "@/hooks/useHistory"
import { useConfig } from "@/hooks/useConfig"
import type { HistoryGroup } from "@/types"

/* ── Helpers ────────────────────────────────────── */

function formatSlug(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
}

/* ── Compact stacked bar (inline) ────────────────── */

function MiniBar({ passed, failed, className }: { passed: number; failed: number; className?: string }) {
  const total = passed + failed
  if (total === 0) return <div className={`h-1.5 bg-muted/60 rounded-full ${className ?? ""}`} />
  const pct = Math.round((passed / total) * 100)
  return (
    <Tooltip>
      <TooltipTrigger className={className}>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-muted/40">
          {passed > 0 && (
            <div
              className="h-full bg-status-success transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          )}
          {failed > 0 && (
            <div
              className="h-full bg-status-error/70 transition-all duration-500"
              style={{ width: `${100 - pct}%` }}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs font-mono">
        {passed} passed · {failed} failed
      </TooltipContent>
    </Tooltip>
  )
}

/* ── Project breakdown ───────────────────────────── */

function ProjectBreakdown({ items }: { items: HistoryGroup[] }) {
  const { config } = useConfig()

  const byProject = useMemo(() => {
    const map = new Map<string, { total: number; success: number }>()
    for (const group of items) {
      for (const attempt of group.attempts) {
        const slug = attempt.projectSlug
          ?? attempt.repo?.split("/").pop()
          ?? "unknown"
        const entry = map.get(slug) ?? { total: 0, success: 0 }
        entry.total++
        if (attempt.outcome === "completed") entry.success++
        map.set(slug, entry)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
  }, [items])

  const projectName = (slug: string): string => {
    if (!config?.projects) return formatSlug(slug)
    for (const p of config.projects) {
      if (p.slug === slug) {
        if (p.name) return p.name
        const dirName = p.repo.split("/").pop() ?? slug
        return formatSlug(dirName)
      }
    }
    return formatSlug(slug)
  }

  if (byProject.length === 0) return null

  return (
    <div>
      <h3 className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-4">
        Projects
      </h3>
      <div className="divide-y divide-border/30">
        {byProject.map(([slug, stats]) => {
          const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0
          const failed = stats.total - stats.success
          return (
            <div key={slug} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-medium">{projectName(slug)}</span>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-mono tabular-nums text-muted-foreground">
                    {stats.total} runs
                  </span>
                  <span className="text-xs font-mono tabular-nums font-medium">
                    {rate}%
                  </span>
                </div>
              </div>
              <MiniBar passed={stats.success} failed={failed} className="w-full block" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Agent breakdown ─────────────────────────────── */

function AgentBreakdown({ items }: { items: HistoryGroup[] }) {
  const byAgent = useMemo(() => {
    const map = new Map<string, { total: number; success: number }>()
    for (const group of items) {
      for (const attempt of group.attempts) {
        const entry = map.get(attempt.agent) ?? { total: 0, success: 0 }
        entry.total++
        if (attempt.outcome === "completed") entry.success++
        map.set(attempt.agent, entry)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [items])

  if (byAgent.length === 0) return null

  return (
    <div>
      <h3 className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-4">
        Agents
      </h3>
      <div className="divide-y divide-border/30">
        {byAgent.map(([agent, stats]) => {
          const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0
          const failed = stats.total - stats.success
          return (
            <div key={agent} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ModelAvatar model={agent} size="sm" />
                  <ModelLabel model={agent} />
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-mono tabular-nums text-muted-foreground">
                    {stats.total} runs
                  </span>
                  <span className="text-xs font-mono tabular-nums font-medium">
                    {rate}%
                  </span>
                </div>
              </div>
              <MiniBar passed={stats.success} failed={failed} className="w-full block" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Recent activity ─────────────────────────────── */

function RecentActivity({ items }: { items: HistoryGroup[] }) {
  const recent = items.slice(0, 8)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
          Recent Activity
        </h3>
        <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all →
        </Link>
      </div>
      <div className="divide-y divide-border/30">
        {recent.map(group => {
          const latest = group.attempts[0]
          const isSuccess = latest?.outcome === "completed"
          return (
            <div key={group.issueId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isSuccess ? "bg-status-success" : "bg-status-error"}`} />
              <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0 w-[52px]">
                {group.identifier}
              </span>
              <span className="text-sm truncate flex-1 text-foreground/80">
                {group.title}
              </span>
              {latest && <ModelAvatar model={latest.agent} size="sm" />}
              <span className="text-[11px] font-mono tabular-nums text-muted-foreground/40 shrink-0">
                {group.attempts.length > 1
                  ? `${group.attempts.length} attempts`
                  : "1 attempt"
                }
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main page ───────────────────────────────────── */

export function OverviewPage() {
  const { items, loading } = useHistory({ limit: 200 })

  const stats = useMemo(() => {
    let totalAttempts = 0
    let successCount = 0
    let totalDurationMs = 0
    let durationCount = 0

    for (const group of items) {
      for (const attempt of group.attempts) {
        totalAttempts++
        if (attempt.outcome === "completed") successCount++
        if (attempt.startedAt && attempt.endedAt) {
          const dur = new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime()
          if (dur > 0) {
            totalDurationMs += dur
            durationCount++
          }
        }
      }
    }

    const successRate = totalAttempts > 0 ? Math.round((successCount / totalAttempts) * 100) : 0
    const avgDuration = durationCount > 0 ? Math.round(totalDurationMs / durationCount / 60_000) : 0

    return { totalIssues: items.length, totalAttempts, successCount, failedCount: totalAttempts - successCount, successRate, avgDuration }
  }, [items])

  if (loading) {
    return (
      <div className="p-6 space-y-10 max-w-4xl">
        <div className="space-y-3">
          <div className="h-6 w-48 rounded bg-muted/50 animate-pulse" />
          <div className="h-12 w-32 rounded bg-muted/50 animate-pulse" />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="h-40 rounded bg-muted/50 animate-pulse" />
          <div className="h-40 rounded bg-muted/50 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-10 max-w-4xl">

      {/* ── Hero stats — asymmetric, left-aligned, no boxes ── */}
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-8 items-baseline">
        <div>
          <p className="text-5xl font-semibold tabular-nums tracking-tighter font-mono">
            {stats.totalIssues}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            issues · {stats.totalAttempts} attempts
          </p>
        </div>
        <div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight font-mono">
            {stats.successRate}%
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            success rate
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">
            {stats.successCount} passed · {stats.failedCount} failed
          </p>
        </div>
        <div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight font-mono">
            {stats.avgDuration > 0 ? `${stats.avgDuration}m` : "—"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            avg per attempt
          </p>
        </div>
      </div>

      {/* ── Breakdowns — side-by-side, no card wrappers ────── */}
      <div className="grid gap-12 lg:grid-cols-2">
        <ProjectBreakdown items={items} />
        <AgentBreakdown items={items} />
      </div>

      {/* ── Recent activity ────────────────────────────────── */}
      <RecentActivity items={items} />
    </div>
  )
}

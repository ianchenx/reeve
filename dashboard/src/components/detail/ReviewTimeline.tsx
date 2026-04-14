import { Badge } from "@/components/ui/badge"
import { ModelAvatar } from "@/components/shared/ModelAvatar"
import { formatDuration } from "@/lib/time"
import type { HistoryEntry } from "@/types"
import { cn } from "@/lib/utils"

interface Props {
  attempts: HistoryEntry[]
  onSelectAttempt?: (historyId: string) => void
}

type StageType = "implement" | "review" | "fixpass" | "publish"

function inferStage(entry: HistoryEntry): StageType {
  if (entry.stage === "review" || entry.phase === "review") return "review"
  return "implement"
}

const STAGE_CONFIG: Record<StageType, { label: string; color: string; dot: string }> = {
  implement: { label: "Implement", color: "text-stage-implement", dot: "bg-stage-implement" },
  review:    { label: "Review",    color: "text-stage-review",    dot: "bg-stage-review" },
  fixpass:   { label: "Fix Pass",  color: "text-stage-fixpass",   dot: "bg-stage-fixpass" },
  publish:   { label: "Published", color: "text-stage-publish",   dot: "bg-stage-publish" },
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (outcome === "completed") {
    return <Badge className="text-[10px] bg-status-success/10 text-status-success capitalize">Pass</Badge>
  }
  if (outcome === "failed") {
    return <Badge className="text-[10px] bg-status-error/10 text-status-error capitalize">Fail</Badge>
  }
  return null
}

export function ReviewTimeline({ attempts, onSelectAttempt }: Props) {
  if (attempts.length === 0) return null

  const sorted = [...attempts].sort((a, b) =>
    new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  )

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground/60 px-1 mb-2">Attempts</h3>

      <div className="divide-y divide-border/10">
        {sorted.map((entry) => {
          const stage = inferStage(entry)
          const config = STAGE_CONFIG[stage]
          const duration = formatDuration(entry.startedAt, entry.endedAt)
          const round = typeof entry.hookReviewRound === "number" ? entry.hookReviewRound : entry.attempt

          return (
            <button
              key={entry.historyId}
              type="button"
              className={cn(
                "flex items-center gap-3 w-full text-left px-2 py-2.5 rounded-md transition-colors",
                onSelectAttempt && "hover:bg-accent/30 cursor-pointer",
                !onSelectAttempt && "cursor-default",
              )}
              onClick={() => onSelectAttempt?.(entry.historyId)}
            >
              {/* Status dot — 6px */}
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />

              {/* Label */}
              <span className={cn("text-xs font-medium shrink-0", config.color)}>
                {config.label}
                {stage === "review" && ` #${round}`}
                {stage === "implement" && entry.attempt > 1 && ` #${entry.attempt}`}
              </span>

              {/* Agent */}
              <ModelAvatar model={entry.agent} size="sm" />

              {/* Outcome */}
              <OutcomeBadge outcome={entry.outcome} />

              {/* Spacer */}
              <span className="flex-1" />

              {/* Duration + PR */}
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40">{duration}</span>
              {entry.prUrl && (
                <a
                  href={entry.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline"
                  onClick={e => e.stopPropagation()}
                >
                  PR
                </a>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

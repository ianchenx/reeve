/**
 * ContextUsage — Miniature context window consumption indicator.
 *
 * Design inspiration: Cursor's token usage pill, Discord's upload progress.
 * Two variants:
 *   - "pill" (default): compact inline pill for cards/rows (e.g. "14K / 258K")
 *   - "bar": thin progress bar with label for detail views
 *
 * Color encodes pressure:
 *   0-60%  → muted (normal)
 *   60-80% → amber (attention)
 *   80%+   → red (danger)
 */

import { cn } from "@/lib/utils"

interface ContextUsageProps {
  used?: number
  size?: number
  variant?: "pill" | "bar"
  className?: string
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function getPressureClass(ratio: number): string {
  if (ratio >= 0.8) return "text-red-400"
  if (ratio >= 0.6) return "text-amber-400"
  return "text-muted-foreground/60"
}

function getBarColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-red-400/80"
  if (ratio >= 0.6) return "bg-amber-400/70"
  return "bg-primary/40"
}

export function ContextUsage({ used, size, variant = "pill", className }: ContextUsageProps) {
  if (used === undefined || !size) return null

  const ratio = Math.min(used / size, 1)
  const percent = Math.round(ratio * 100)

  if (variant === "bar") {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center justify-between text-[10px]">
          <span className={cn("font-medium tabular-nums", getPressureClass(ratio))}>
            {formatTokenCount(used)} / {formatTokenCount(size)}
          </span>
          <span className={cn("tabular-nums", getPressureClass(ratio))}>
            {percent}%
          </span>
        </div>
        <div className="h-1 rounded-full bg-border/40 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", getBarColor(ratio))}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )
  }

  // Pill variant
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-mono tabular-nums shrink-0",
        getPressureClass(ratio),
        className,
      )}
      title={`Context: ${used.toLocaleString()} / ${size.toLocaleString()} tokens (${percent}%)`}
    >
      {/* Tiny inline bar */}
      <span className="relative w-5 h-1.5 rounded-full bg-border/30 overflow-hidden">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500", getBarColor(ratio))}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span>{formatTokenCount(used)}</span>
    </span>
  )
}

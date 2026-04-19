/**
 * lib/format.ts — shared formatting utilities.
 *
 * Extracted from useTaskDetail.ts to be reusable across components.
 */
import type { HistoryEntry } from "@/types"

export function getTokenTotal(tokensUsed: HistoryEntry["tokensUsed"]): number | null {
  if (typeof tokensUsed === "number") return Number.isFinite(tokensUsed) ? tokensUsed : null
  if (!tokensUsed) return null
  if (typeof tokensUsed.total === "number") return tokensUsed.total
  const input = typeof tokensUsed.input === "number" ? tokensUsed.input : 0
  const output = typeof tokensUsed.output === "number" ? tokensUsed.output : 0
  const total = input + output
  return total > 0 ? total : null
}

export function getCostUsd(tokensUsed: HistoryEntry["tokensUsed"]): number | null {
  if (!tokensUsed || typeof tokensUsed === "number") return null
  return typeof tokensUsed.costUsd === "number" && Number.isFinite(tokensUsed.costUsd)
    ? tokensUsed.costUsd
    : null
}

export function getEffectiveInputTokens(tokensUsed: HistoryEntry["tokensUsed"]): number | null {
  if (!tokensUsed || typeof tokensUsed === "number") return null
  if (typeof tokensUsed.input !== "number") return null
  const cacheRead = typeof tokensUsed.cacheRead === "number" ? tokensUsed.cacheRead : 0
  return Math.max(tokensUsed.input - cacheRead, 0)
}

export function getDisplayTokenBreakdown(tokensUsed: HistoryEntry["tokensUsed"]): {
  input?: number
  output?: number
} | null {
  if (!tokensUsed || typeof tokensUsed === "number") return null

  const input = getEffectiveInputTokens(tokensUsed)
  const output = typeof tokensUsed.output === "number" ? tokensUsed.output : null

  if ((input ?? 0) <= 0 && (output ?? 0) <= 0) return null

  return {
    ...(typeof input === "number" && input > 0 ? { input } : {}),
    ...(typeof output === "number" && output > 0 ? { output } : {}),
  }
}

export function formatCompactTokenCount(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

export function formatTokenUsage(tokensUsed: HistoryEntry["tokensUsed"], fallbackTokens?: number | null): string {
  const total = getTokenTotal(tokensUsed)
  if (total !== null) return total.toLocaleString()
  if (typeof fallbackTokens === "number" && Number.isFinite(fallbackTokens)) return fallbackTokens.toLocaleString()
  return "—"
}

export function formatCost(cost?: number): string {
  if (typeof cost !== "number") return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: cost >= 1 ? 2 : 4,
    maximumFractionDigits: 4,
  }).format(cost)
}

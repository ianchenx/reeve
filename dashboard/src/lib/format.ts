/**
 * lib/format.ts — shared formatting utilities.
 *
 * Extracted from useTaskDetail.ts to be reusable across components.
 */
import type { HistoryEntry } from "@/types"

/** Minimal event shape needed by formatters — compatible with SessionViewer.SessionEvent */
export interface UsageEvent {
  type: string
  tokens?: number
}

export function getTokenTotal(tokensUsed: HistoryEntry["tokensUsed"]): number | null {
  if (typeof tokensUsed === "number") return Number.isFinite(tokensUsed) ? tokensUsed : null
  if (!tokensUsed) return null
  if (typeof tokensUsed.total === "number") return tokensUsed.total
  const input = typeof tokensUsed.input === "number" ? tokensUsed.input : 0
  const output = typeof tokensUsed.output === "number" ? tokensUsed.output : 0
  const total = input + output
  return total > 0 ? total : null
}

export function getLastUsageTokens(events: UsageEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i]
    if (ev.type === "usage" && typeof ev.tokens === "number" && Number.isFinite(ev.tokens)) return ev.tokens
  }
  return null
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

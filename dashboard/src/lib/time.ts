/** Format milliseconds into a human-readable duration (e.g. "5s", "3m12s", "1h30m") */
export function formatDurationMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60}s`
  return `${Math.floor(m / 60)}h${m % 60}m`
}

/** Format duration between two ISO date strings */
export function formatDuration(start: string, end?: string): string {
  if (!end) return "\u2014"
  return formatDurationMs(new Date(end).getTime() - new Date(start).getTime())
}

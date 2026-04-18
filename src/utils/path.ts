// utils/path.ts — Single source of truth for child-process PATH.
// Append fallback tool dirs (without overriding user shims).
// Filters empty segments: POSIX treats them as cwd, which is a security risk.

const TOOL_FALLBACKS = ["/usr/local/bin", "/opt/homebrew/bin"]

export function spawnPath(): string {
  const segments = (process.env.PATH ?? "").split(":").filter(Boolean)
  return [...segments, ...TOOL_FALLBACKS].join(":")
}

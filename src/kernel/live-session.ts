import { existsSync, lstatSync, readdirSync } from "fs"
import { resolve } from "path"

import { TASKS_DIR, isPathWithinRoot, sanitizeTaskIdentifier } from "../paths"
import { readSessionNdjson } from "../session-log"

export function resolveLiveSessionPaths(identifier: string, tasksDir: string = TASKS_DIR): string[] {
  const sanitized = sanitizeTaskIdentifier(identifier)
  if (!sanitized) return []

  const root = resolve(tasksDir, sanitized)
  if (!isPathWithinRoot(tasksDir, root) || !existsSync(root)) return []

  const paths: string[] = []
  try {
    for (const entry of readdirSync(root)) {
      const dir = resolve(root, entry)
      if (!lstatSync(dir).isDirectory()) continue
      const session = resolve(dir, "session.ndjson")
      if (existsSync(session) && isPathWithinRoot(tasksDir, session)) {
        paths.push(session)
      }
    }
  } catch {
    // task dir doesn't exist or can't be read
  }

  return paths
}

export function readLiveSessionEvents(
  identifier: string,
  options?: { tasksDir?: string; maxLines?: number },
): unknown[] {
  const tasksDir = options?.tasksDir ?? TASKS_DIR
  const maxLines = options?.maxLines ?? 2000

  const allEvents: unknown[] = []
  for (const candidate of resolveLiveSessionPaths(identifier, tasksDir)) {
    if (!existsSync(candidate)) continue
    allEvents.push(...readSessionNdjson(candidate, maxLines))
  }
  return allEvents
}

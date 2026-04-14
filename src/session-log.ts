import { existsSync, readFileSync } from "fs"

export function parseSessionNdjson(raw: string, source: string, maxLines = 2000): unknown[] {
  const lines = raw.split("\n")
  if (maxLines <= 0) return []

  let start = lines.length
  let nonEmptySeen = 0
  for (let index = lines.length - 1; index >= 0; index--) {
    if (!lines[index].trim()) continue
    nonEmptySeen += 1
    start = index
    if (nonEmptySeen >= maxLines) break
  }

  const events: unknown[] = []

  for (let index = start; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) continue

    try {
      events.push(JSON.parse(line))
    } catch (err) {
      console.warn(`[session-log] Skipping invalid JSON line ${index + 1} in ${source}:`, err)
    }
  }

  return events
}

export function readSessionNdjson(path: string, maxLines = 2000): unknown[] {
  if (!existsSync(path)) return []
  return parseSessionNdjson(readFileSync(path, "utf-8"), path, maxLines)
}

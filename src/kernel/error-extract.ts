// error-extract.ts — Extract last error from agent session log

import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { taskLogDir } from "../paths"

/**
 * Read session.ndjson for a task and extract the last error message.
 * Returns null if no error found or file missing.
 */
export function extractLastError(identifier: string): string | null {
  const logDir = taskLogDir(identifier)
  const sessionPath = resolve(logDir, "session.ndjson")
  if (!existsSync(sessionPath)) return null

  try {
    const lines = readFileSync(sessionPath, "utf-8").trim().split("\n")

    // Walk backwards to find the last error event
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i])
        if (entry.error) {
          return entry.error.data?.message ?? entry.error.message ?? JSON.stringify(entry.error)
        }
        if (entry.event === "error" && entry.data?.message) {
          return entry.data.message
        }
      } catch {
        // Skip malformed lines
      }
    }
    return null
  } catch {
    return null
  }
}

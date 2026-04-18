import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { basename, dirname, resolve } from "path"

export interface TokenUsageSnapshot {
  input: number
  output: number
  total: number
  cacheRead?: number
  /** Context window tokens currently used (from ACPX usage_update) */
  contextUsed?: number
  /** Context window total size (from ACPX usage_update) */
  contextSize?: number
  /** Total cost in USD. Claude surfaces this via its final `result` event; Codex doesn't expose a cost value. */
  costUsd?: number
}



export function writeJsonFileAtomic(path: string, value: unknown): void {
  const dir = dirname(path)
  const tempPath = resolve(dir, `.${process.pid}.${basename(path)}.tmp`)

  mkdirSync(dir, { recursive: true })
  writeFileSync(tempPath, JSON.stringify(value, null, 2))
  try {
    renameSync(tempPath, path)
  } catch (err) {
    try { unlinkSync(tempPath) } catch {}
    throw err
  }
}

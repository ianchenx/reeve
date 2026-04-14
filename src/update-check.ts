import { existsSync, readFileSync } from "fs"
import { resolve, dirname } from "path"
import { writeJsonFileAtomic } from "./persistence"

/** Resolve cache path at call time (reads REEVE_DIR env dynamically). */
function getUpdateCheckPath(): string {
  const reeveDir = process.env.REEVE_DIR || resolve(process.env.HOME || "/tmp", ".reeve")
  return resolve(reeveDir, "update-check.json")
}

export interface UpdateCache {
  lastCheck: string
  latest: string
  current: string
}

/** Read cached update info. Returns null if file missing/corrupt. */
export function readUpdateCache(): UpdateCache | null {
  try {
    const cachePath = getUpdateCheckPath()
    if (!existsSync(cachePath)) return null
    const raw = readFileSync(cachePath, "utf-8")
    const data = JSON.parse(raw)
    if (!data.lastCheck || !data.latest || !data.current) return null
    return data as UpdateCache
  } catch {
    return null
  }
}

/** Whether update checking is disabled via env var. */
export function isUpdateCheckDisabled(): boolean {
  return process.env.REEVE_NO_UPDATE_CHECK === "1"
}

/** Semver comparison: is `latest` newer than `current`? */
export function hasNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => {
    const [core] = v.split("-")
    const parts = core.split(".").map(Number)
    const pre = v.includes("-") ? v.slice(v.indexOf("-") + 1) : null
    return { parts, pre }
  }
  const c = parse(current)
  const l = parse(latest)
  for (let i = 0; i < 3; i++) {
    const cv = c.parts[i] ?? 0
    const lv = l.parts[i] ?? 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  // Same core version: pre-release < release
  if (c.pre && !l.pre) return true
  return false
}

/** Resolve current package version from package.json. */
export function getCurrentVersion(): string {
  try {
    const pkgPath = resolve(dirname(new URL(import.meta.url).pathname), "../package.json")
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

/** Check npm registry for latest version and write cache. */
export async function checkForUpdate(): Promise<void> {
  if (isUpdateCheckDisabled()) return
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch("https://registry.npmjs.org/reeve/latest", {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return
    const data = await res.json() as { version?: string }
    if (!data.version) return
    const current = getCurrentVersion()
    const cache: UpdateCache = {
      lastCheck: new Date().toISOString(),
      latest: data.version,
      current,
    }
    writeJsonFileAtomic(getUpdateCheckPath(), cache)
  } catch {
    // Silent failure — network errors, timeouts, bad JSON all swallowed
  }
}

/** Whether cached data is stale (>24h or missing). */
export function isCacheStale(): boolean {
  const cache = readUpdateCache()
  if (!cache) return true
  const age = Date.now() - new Date(cache.lastCheck).getTime()
  return age > 24 * 60 * 60 * 1000
}

/** Spawn detached child process to check for updates. Fire-and-forget. */
export function spawnUpdateCheck(): void {
  if (isUpdateCheckDisabled()) return
  try {
    const scriptPath = resolve(dirname(new URL(import.meta.url).pathname), "update-check-run.ts")
    const child = Bun.spawn(["bun", "run", scriptPath], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    })
    child.unref()
  } catch {
    // Silent failure
  }
}

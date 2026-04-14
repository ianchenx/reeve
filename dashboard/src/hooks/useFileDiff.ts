import { useState, useEffect, useMemo } from "react"
import { fetchFileDiff } from "@/api"

type DiffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; diff: string }
  | { status: "error"; error: string }

/**
 * Fetches unified diff for a single file in a worktree.
 * Only fetches when filePath is non-null.
 * Uses a request key to track which fetch corresponds to the current input.
 */
export function useFileDiff(identifier: string, filePath: string | null): DiffState {
  const [results, setResults] = useState<Map<string, DiffState>>(new Map())

  const key = filePath ? `${identifier}:${filePath}` : null

  useEffect(() => {
    if (!key || !filePath) return

    let cancelled = false

    fetchFileDiff(identifier, filePath)
      .then(res => {
        if (!cancelled) {
          setResults(prev => new Map(prev).set(key, { status: "ready", diff: res.diff }))
        }
      })
      .catch(() => {
        if (cancelled) return
        // In dev mode with no daemon, use mock diff
        if (import.meta.env.DEV) {
          const mockDiff = `--- a/${filePath}\n+++ b/${filePath}\n@@ -12,7 +12,15 @@\n   const config = loadConfig()\n-  const result = await run(task)\n+  const result = await runWithRetry(task, {\n+    maxAttempts: 3,\n+    backoff: 'exponential',\n+    onRetry: (attempt, err) => {\n+      log.warn(\`retry \${attempt}: \${err.message}\`)\n+    },\n+  })\n   return result\n }`
          setResults(prev => new Map(prev).set(key, { status: "ready", diff: mockDiff }))
        } else {
          const error = "Failed to fetch diff"
          setResults(prev => new Map(prev).set(key, { status: "error", error }))
        }
      })

    return () => { cancelled = true }
  }, [key, identifier, filePath])

  return useMemo((): DiffState => {
    if (!key) return { status: "idle" }
    return results.get(key) ?? { status: "loading" }
  }, [key, results])
}

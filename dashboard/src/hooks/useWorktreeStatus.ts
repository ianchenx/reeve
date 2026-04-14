import { useState, useEffect, useRef } from "react"
import { fetchWorktreeStatus } from "@/api"
import type { WorktreeStatusResponse } from "@/types"

type WorktreeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: WorktreeStatusResponse }
  | { status: "error"; error: string }

const POLL_INTERVAL_MS = 5_000

const MOCK_WORKTREE: WorktreeStatusResponse = {
  branch: "wor-42-retry-logic",
  changedFiles: [
    { status: "M", file: "src/orchestrator.ts" },
    { status: "M", file: "src/agent/runner.ts" },
    { status: "A", file: "src/utils/retry.ts" },
    { status: "M", file: "tests/orchestrator.test.ts" },
  ],
  commits: [
    { hash: "a1b2c3d", message: "feat: add exponential backoff retry for webhook delivery" },
    { hash: "e4f5678", message: "test: add retry logic unit tests" },
    { hash: "9a0b1c2", message: "refactor: extract retry util from orchestrator" },
  ],
  diffStat: " 3 files changed, 87 insertions(+), 12 deletions(-)",
}

/**
 * Polls `/api/worktree/:identifier` at a fixed interval.
 * Returns discriminated union state — caller handles each case.
 */
export function useWorktreeStatus(identifier: string): WorktreeState {
  const [state, setState] = useState<WorktreeState>({ status: "loading" })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const poll = async (): Promise<void> => {
      try {
        const data = await fetchWorktreeStatus(identifier)
        if (!cancelled) setState({ status: "ready", data })
      } catch (err) {
        if (cancelled) return
        // In dev mode with no daemon, use mock data
        if (import.meta.env.DEV) {
          setState({ status: "ready", data: MOCK_WORKTREE })
        } else {
          setState({ status: "error", error: err instanceof Error ? err.message : "Unknown error" })
        }
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [identifier])

  return state
}

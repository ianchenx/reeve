/**
 * useTaskDetail — extracts all TaskDetailPage data fetching + parsing.
 *
 * Returns: meta, sessionEvents, prompt, relatedAttempts, loading state, and task action handlers.
 * Each history entry (implement, review, etc.) has its own page — no cross-agent tabs needed.
 */
import { useEffect, useState, useCallback } from "react"
import { fetchHistoryDetail, fetchSession, fetchPrompt, fetchIssueAttempts, retryTask, markFailed } from "@/api"
import type { SessionEvent } from "@/components/detail/SessionViewer"
import type { HistoryEntry } from "@/types"

export interface TaskDetailData {
  meta: HistoryEntry | null
  sessionEvents: SessionEvent[]
  prompt: string
  relatedAttempts: HistoryEntry[]
  loading: boolean
  retrying: boolean
  markingFailed: boolean
  handleRetry: () => void
  handleMarkFailed: () => void
}

export function useTaskDetail(taskId: string): TaskDetailData {
  const [meta, setMeta] = useState<HistoryEntry | null>(null)
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([])
  const [prompt, setPrompt] = useState<string>("")
  const [relatedAttempts, setRelatedAttempts] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [markingFailed, setMarkingFailed] = useState(false)

  useEffect(() => {
    setLoading(true)

    Promise.all([
      fetchHistoryDetail(taskId).then(m => {
        setMeta(m)
        if (m.identifier) {
          fetchIssueAttempts(m.identifier).then(res => {
            const allAttempts = res.items.flatMap(g => g.attempts)
            setRelatedAttempts(allAttempts)
          }).catch(() => {})
        }
      }),
      fetchSession(taskId).then(res => setSessionEvents(res.events as SessionEvent[])),
      fetchPrompt(taskId).then(res => setPrompt(res.prompt)),
    ]).catch((err) => {
      console.error("[useTaskDetail] fetch failed:", err)
    }).finally(() => setLoading(false))
  }, [taskId])

  const handleRetry = useCallback(async () => {
    if (!meta) return
    setRetrying(true)
    try { await retryTask(meta.identifier) }
    finally { setRetrying(false) }
  }, [meta])

  const handleMarkFailed = useCallback(async () => {
    if (!meta) return
    setMarkingFailed(true)
    try { await markFailed(meta.identifier) }
    finally { setMarkingFailed(false) }
  }, [meta])

  return {
    meta,
    sessionEvents,
    prompt,
    relatedAttempts,
    loading,
    retrying,
    markingFailed,
    handleRetry,
    handleMarkFailed,
  }
}

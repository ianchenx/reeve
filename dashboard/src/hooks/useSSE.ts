import { useEffect, useRef, useState } from "react"
import type { ReeveSSEEvent } from "@/types"
import { getStoredKey } from "@/api"

export type ConnectionStatus = "connecting" | "connected" | "error"

export function useSSE(onEvent: (event: ReeveSSEEvent) => void) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent })

  useEffect(() => {
    let es: EventSource | null = null
    let retryDelay = 1000
    let mounted = true

    function connect() {
      if (!mounted) return
      setStatus("connecting")
      const key = getStoredKey()
      const url = key ? `/api/events?key=${encodeURIComponent(key)}` : "/api/events"
      es = new EventSource(url)

      es.onopen = () => {
        setStatus("connected")
        retryDelay = 1000
      }

      es.onerror = () => {
        setStatus("error")
        es?.close()
        if (mounted) {
          setTimeout(connect, retryDelay)
          retryDelay = Math.min(retryDelay * 2, 30000)
        }
      }

      es.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data) as ReeveSSEEvent
          onEventRef.current(event)
        } catch { /* malformed SSE data */ }
      }
    }

    connect()

    return () => {
      mounted = false
      es?.close()
    }
  }, [])

  return status
}

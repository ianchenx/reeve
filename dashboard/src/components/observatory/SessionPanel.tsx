import { useEffect, useRef } from "react"
import type { DisplayEvent } from "@/types"
import { SessionViewer } from "@/components/detail/SessionViewer"

interface Props {
  events: DisplayEvent[]
}

export function SessionPanel({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new events arrive, but only if user is near bottom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [events.length])

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      {events.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Waiting for agent output…
        </div>
      ) : (
        <>
          <SessionViewer events={events} />
          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}

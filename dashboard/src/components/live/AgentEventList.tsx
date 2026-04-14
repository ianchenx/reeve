import type { DisplayEvent } from "@/types"
import { SessionViewer, type SessionEvent } from "@/components/detail/SessionViewer"

function toSessionEvents(events: DisplayEvent[]): SessionEvent[] {
  return events.map(ev => ({
    type: ev.type as SessionEvent["type"],
    text: ev.text,
    status: ev.status as SessionEvent["status"],
    time: ev.time,
    tokens: ev.tokens,
    rawData: ev.rawData,
  }))
}

export function AgentEventList({ events }: { events: DisplayEvent[] }) {
  if (events.length === 0) return null

  const sessionEvents = toSessionEvents(events)

  return (
    <div className="border-t">
      <SessionViewer events={sessionEvents} live maxHeight="224px" />
    </div>
  )
}

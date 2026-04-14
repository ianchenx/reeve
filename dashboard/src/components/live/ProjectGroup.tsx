import type { TaskEntry, DisplayEvent } from "@/types"
import { ActiveAgentCard } from "./AgentCard"

interface Props {
  slug: string
  tasks: TaskEntry[]
  getEventLog: (identifier: string) => DisplayEvent[]
  onKill: (identifier: string) => void
  onNavigate: (page: string) => void
}

export function ProjectGroup({ slug, tasks, getEventLog, onKill, onNavigate }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {slug === "_unassigned" ? "Unassigned" : slug}
        <span className="ml-2 text-primary">{tasks.length}</span>
      </h2>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
        {tasks.map(task => (
          <ActiveAgentCard
            key={task.identifier}
            entry={task}
            events={getEventLog(task.identifier)}
            onKill={() => onKill(task.identifier)}
            onOpen={() => onNavigate(`live:${task.identifier}`)}
          />
        ))}
      </div>
    </div>
  )
}

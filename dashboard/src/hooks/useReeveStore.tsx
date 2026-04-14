import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { TaskEntry, CompletedEntry, DisplayEvent, ReeveSSEEvent, DashboardConfig } from "@/types"
import { useSSE } from "./useSSE"

const MAX_COMPLETED = 20

function trimCompleted(completed: Map<string, CompletedEntry>): void {
  if (completed.size <= MAX_COMPLETED) return
  const oldest = [...completed.keys()][0]
  if (oldest) completed.delete(oldest)
}

function upsertTask(tasks: Map<string, TaskEntry>, completed: Map<string, CompletedEntry>, entry: TaskEntry): void {
  tasks.set(entry.identifier, entry)
  completed.delete(entry.identifier)
}

function finishTask(
  tasks: Map<string, TaskEntry>,
  completed: Map<string, CompletedEntry>,
  task: TaskEntry,
): void {
  tasks.delete(task.identifier)
  completed.set(task.identifier, {
    identifier: task.identifier,
    title: task.title,
    prUrl: task.prUrl,
    reason: task.doneReason === "failed" ? "failed" : undefined,
    doneReason: task.doneReason,
    doneAt: new Date().toISOString(),
  })
  trimCompleted(completed)
}

export interface ReeveStore {
  version: number
  connectionStatus: "connecting" | "connected" | "error"
  readonly tasks: TaskEntry[]
  readonly active: TaskEntry[]
  readonly published: TaskEntry[]
  readonly queued: TaskEntry[]
  readonly done: TaskEntry[]
  readonly completed: CompletedEntry[]
  getEventLog(identifier: string): DisplayEvent[]
  groupByProject(projects: DashboardConfig["projects"]): Map<string, TaskEntry[]>
}

const ReeveStoreContext = createContext<ReeveStore | null>(null)

export function ReeveStoreProvider({ children }: { children: ReactNode }) {
  const store = useReeveStoreInternal()
  return <ReeveStoreContext value={store}>{children}</ReeveStoreContext>
}

export function useReeveStore(): ReeveStore {
  const ctx = useContext(ReeveStoreContext)
  if (!ctx) throw new Error("useReeveStore must be used within ReeveStoreProvider")
  return ctx
}

function useReeveStoreInternal(): ReeveStore {
  const tasksRef = useRef(new Map<string, TaskEntry>())
  const completedRef = useRef(new Map<string, CompletedEntry>())
  const eventLogsRef = useRef(new Map<string, DisplayEvent[]>())
  const [version, setVersion] = useState(0)

  const bump = useCallback(() => setVersion(v => v + 1), [])

  const dispatch = useCallback((event: ReeveSSEEvent) => {
    switch (event.type) {
      case "init":
        tasksRef.current.clear()
        completedRef.current.clear()
        for (const task of event.tasks) {
          if (task.state === "done") {
            completedRef.current.set(task.identifier, {
              identifier: task.identifier,
              title: task.title,
              prUrl: task.prUrl,
              reason: task.doneReason === "failed" ? "failed" : undefined,
              doneReason: task.doneReason,
              doneAt: task.updatedAt,
            })
          } else {
            tasksRef.current.set(task.identifier, task)
          }
        }
        bump()
        break

      case "task_added":
        upsertTask(tasksRef.current, completedRef.current, event.task)
        bump()
        break

      case "state_change": {
        const task = event.task
        if (task.state === "done") {
          finishTask(tasksRef.current, completedRef.current, task)
        } else {
          upsertTask(tasksRef.current, completedRef.current, task)
        }
        bump()
        break
      }

      case "error":
        break
    }
  }, [bump])

  const connectionStatus = useSSE(dispatch)

  return {
    version,
    connectionStatus,
    get tasks() {
      return [...tasksRef.current.values()]
    },
    get active() {
      return [...tasksRef.current.values()].filter(t => t.state === "active")
    },
    get published() {
      return [...tasksRef.current.values()].filter(t => t.state === "published")
    },
    get queued() {
      return [...tasksRef.current.values()].filter(t => t.state === "queued")
    },
    get done() {
      return [...tasksRef.current.values()].filter(t => t.state === "done")
    },
    get completed() {
      return [...completedRef.current.values()]
        .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime())
    },
    getEventLog(identifier: string): DisplayEvent[] {
      return eventLogsRef.current.get(identifier) || []
    },
    groupByProject(projects: DashboardConfig["projects"]) {
      const groups = new Map<string, TaskEntry[]>()
      groups.set("_unassigned", [])
      for (const project of projects) {
        groups.set(project.slug, [])
      }

      for (const task of tasksRef.current.values()) {
        if (task.state === "done") continue
        const project = projects.find(p => p.repo === task.repo)
        const key = project?.slug || "_unassigned"
        const entries = groups.get(key) ?? []
        entries.push(task)
        groups.set(key, entries)
      }

      for (const [key, value] of groups) {
        if (value.length === 0) groups.delete(key)
      }

      return groups
    },
  }
}

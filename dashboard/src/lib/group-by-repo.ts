import type { TaskEntry } from "@/types"

/** Group task entries by repo name */
export function groupByRepo(processes: TaskEntry[]): Map<string, TaskEntry[]> {
  const map = new Map<string, TaskEntry[]>()
  for (const p of processes) {
    const group = map.get(p.repo) ?? []
    group.push(p)
    map.set(p.repo, group)
  }
  return map
}

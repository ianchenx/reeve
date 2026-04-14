// log.ts — JSONL session logger for
// One JSONL file per session, supports jq filtering by taskId

import { appendFileSync, mkdirSync } from "fs"
import { dirname } from "path"
import type { SessionEvent, TaskState } from "./types"

export class SessionLogger {
  constructor(private readonly path: string) {
    mkdirSync(dirname(this.path), { recursive: true })
  }

  /** Append a structured event to the JSONL log. */
  write(event: SessionEvent): void {
    appendFileSync(this.path, JSON.stringify(event) + "\n")
  }

  /** Log a state transition. */
  transition(taskId: string, identifier: string, from: TaskState, to: TaskState, data?: Record<string, unknown>): void {
    this.write({
      ts: new Date().toISOString(),
      taskId,
      identifier,
      event: "state_change",
      from,
      to,
      data,
    })
  }

  /** Log an arbitrary event. */
  event(taskId: string, identifier: string, event: string, data?: Record<string, unknown>): void {
    this.write({
      ts: new Date().toISOString(),
      taskId,
      identifier,
      event,
      data,
    })
  }
}

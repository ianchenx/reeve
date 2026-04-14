import { describe, expect, mock, test } from "bun:test"

import type { ReeveDaemonConfig } from "../config"
import { executeAction } from "./registry"

import "./daemon"

const CONFIG: ReeveDaemonConfig = {
  source: "linear",
  linear: {
    apiKey: "lin_api_test",
    projectSlug: "test-project",
    teamKey: "TEST",
    activeStates: ["Todo", "In Progress"],
    dispatchableStateTypes: ["unstarted", "started"],
    terminalStates: ["Done", "Cancelled"],
    stateNames: {
      todo: "Todo",
      inProgress: "In Progress",
      inReview: "In Review",
      done: "Done",
      backlog: "Backlog",
    },
  },
  workspace: { root: "/tmp/workspaces" },
  agent: {
    maxRounds: 2,
    stallTimeoutMs: 300000,
    turnTimeoutMs: 3600000,
    maxRetries: 2,
    default: "codex",
  },
  polling: { intervalMs: 60000 },
  dashboard: { port: 14500, enabled: false },
  events: { dir: "./events" },
  projects: [],
}

describe("daemon retry action", () => {
  test("requires a running kernel", async () => {
    const result = await executeAction(
      { config: CONFIG, projects: [] },
      "retry",
      { identifier: "TES-1", clean: false },
    )

    expect(result).toEqual({
      ok: false,
      error: "Daemon is not running",
      code: "DAEMON_NOT_RUNNING",
    })
  })

  test("delegates retry to kernel.retryTask", async () => {
    const retryTask = mock(async () => ({
      mode: "continue",
      identifier: "TES-2",
      message: "Task revived — will re-dispatch on next tick",
    }))

    const result = await executeAction(
      {
        kernel: {
          retryTask,
        } as any,
        config: CONFIG,
        projects: [],
      },
      "retry",
      { identifier: "TES-2", clean: true },
    )

    expect(retryTask).toHaveBeenCalledWith("TES-2", true)
    expect(result).toEqual({
      ok: true,
      data: {
        mode: "continue",
        identifier: "TES-2",
        message: "Task revived — will re-dispatch on next tick",
      },
    })
  })
})

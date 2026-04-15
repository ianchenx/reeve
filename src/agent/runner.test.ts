import { afterEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync } from "fs"
import { join, resolve } from "path"

import type { ReeveDaemonConfig } from "../config"
import { cleanupTestTmp, testTmpDir } from "../test-helpers"
import type { AgentTask, SpawnResult } from "./types"

function createConfig(apiKey = "lin_api_test"): ReeveDaemonConfig {
  return {
    source: "linear",
    linear: {
      apiKey,
      projectSlug: "",
      teamKey: "",
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
      maxRounds: 1,
      stallTimeoutMs: 1,
      turnTimeoutMs: 1,
      maxRetries: 1,
      default: "codex",
    },
    polling: { intervalMs: 1 },
    dashboard: { port: 14500, enabled: true },
    events: { dir: "./events" },
    projects: [],
  }
}

function createTask(): AgentTask {
  return {
    id: "issue-1",
    identifier: "TES-1",
    title: "Sandbox runner wiring",
    description: "",
    labels: [],
    priority: null,
    state: "Todo",
    repo: "acme/reeve",
  }
}

afterEach(() => {
  mock.restore()
  cleanupTestTmp()
})

describe("spawnAgent sandbox wiring", () => {
  test("calls prepareSandbox and passes the result into backend.spawn", async () => {
    const homeDir = testTmpDir("runner-home-")
    process.env.HOME = homeDir
    mkdirSync(resolve(homeDir, ".reeve"), { recursive: true })

    const prepareSandbox = mock(async () => ({ extraArgs: ["-c", 'mcp_servers.test.command="echo"'] }))
    const spawn = mock(async (_task, _workDir, _prompt, _config, _onEvent, options): Promise<SpawnResult> => ({
      pid: 123,
      agent: "codex",
      threadId: "thread-1",
      done: Promise.resolve(0),
      stderrBuffer: { text: "" },
      ...("sandbox" in options ? {} : {}),
    }))

    let seenSandbox: unknown
    mock.module("./codex-backend", () => ({
      codexBackend: {
        name: "codex",
        prepareSandbox,
        spawn: mock(async (_task, _workDir, _prompt, _config, _onEvent, options): Promise<SpawnResult> => {
          seenSandbox = options.sandbox
          return {
            pid: 123,
            agent: "codex",
            threadId: "thread-1",
            done: Promise.resolve(0),
            stderrBuffer: { text: "" },
          }
        }),
      },
    }))
    mock.module("./claude-backend", () => ({
      claudeBackend: {
        name: "claude",
        spawn,
      },
    }))

    const { spawnAgent } = await import(`./runner?test=${Date.now()}`)

    const result = await spawnAgent(
      createTask(),
      join(homeDir, "worktree"),
      "prompt",
      createConfig(),
      () => {},
      1,
      "codex",
    )

    expect(result.threadId).toBe("thread-1")
    expect(prepareSandbox).toHaveBeenCalledTimes(1)
    expect(seenSandbox).toEqual({ extraArgs: ["-c", 'mcp_servers.test.command="echo"'] })
  })

  test("does not overwrite richer meta.json data after enrichMeta already finished", async () => {
    const homeDir = testTmpDir("runner-meta-")
    process.env.HOME = homeDir
    mkdirSync(resolve(homeDir, ".reeve"), { recursive: true })

    let resolveDone: ((exitCode: number) => void) | undefined
    const done = new Promise<number>((resolve) => {
      resolveDone = resolve
    })

    mock.module("./codex-backend", () => ({
      codexBackend: {
        name: "codex",
        spawn: mock(async (): Promise<SpawnResult> => ({
          pid: 321,
          agent: "codex",
          threadId: "thread-2",
          done,
          stderrBuffer: { text: "" },
        })),
      },
    }))
    mock.module("./claude-backend", () => ({
      claudeBackend: {
        name: "claude",
        spawn: mock(async (): Promise<SpawnResult> => ({
          pid: 999,
          agent: "claude",
          done: Promise.resolve(0),
          stderrBuffer: { text: "" },
        })),
      },
    }))

    const { spawnAgent } = await import(`./runner?meta=${Date.now()}`)
    const workDir = join(homeDir, "worktree")
    const metaPath = join(workDir, "meta.json")

    const result = await spawnAgent(
      createTask(),
      workDir,
      "prompt",
      createConfig(),
      () => {},
      1,
      "codex",
    )

    Bun.write(metaPath, JSON.stringify({
      issueId: "issue-1",
      identifier: "TES-1",
      title: "Sandbox runner wiring",
      agent: "codex",
      attempt: 1,
      repo: "acme/reeve",
      worktree: workDir,
      startedAt: "2026-04-14T00:00:00.000Z",
      endedAt: "2026-04-14T00:01:00.000Z",
      exitCode: 0,
      outcome: "completed",
      failureReason: "preserve me",
      integrity: "complete",
    }, null, 2))

    resolveDone?.(1)
    await result.done
    await Bun.sleep(0)

    const meta = JSON.parse(readFileSync(metaPath, "utf-8"))
    expect(meta.exitCode).toBe(0)
    expect(meta.outcome).toBe("completed")
    expect(meta.failureReason).toBe("preserve me")
    expect(meta.endedAt).toBe("2026-04-14T00:01:00.000Z")
  })
})

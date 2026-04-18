import { afterEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync } from "fs"
import { join, resolve } from "path"

import type { ReeveDaemonConfig } from "../config"
import { cleanupTestTmp, testTmpDir } from "../test-helpers"

function createConfig(): ReeveDaemonConfig {
  return {
    source: "linear",
    linear: {
      apiKey: "lin_api_test",
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
    projects: [],
  }
}

afterEach(() => {
  mock.restore()
  cleanupTestTmp()
})

describe("spawnForPostAgent", () => {
  test("persists review token usage into meta.json", async () => {
    const homeDir = testTmpDir("kernel-post-agent-")
    process.env.HOME = homeDir
    mkdirSync(resolve(homeDir, ".reeve"), { recursive: true })

    mock.module("../agent/runner", () => ({
      spawnAgent: mock(async (_task, workDir, _prompt, _config, onEvent) => {
        mkdirSync(workDir, { recursive: true })
        await Bun.write(
          join(workDir, "meta.json"),
          JSON.stringify(
            {
              issueId: "issue-1",
              identifier: "TES-1",
              title: "Review TES-1",
              agent: "codex",
              attempt: 1,
              repo: "acme/reeve",
              worktree: workDir,
              startedAt: "2026-04-19T00:00:00.000Z",
              integrity: "complete",
            },
            null,
            2,
          ),
        )

        onEvent({
          type: "usage",
          tokensUsed: 815955,
          usage: {
            input: 805775,
            output: 10180,
            total: 815955,
            cacheRead: 777472,
            contextUsed: 76152,
            contextSize: 258400,
          },
        })

        return {
          pid: 123,
          agent: "codex",
          done: Promise.resolve(0),
          stderrBuffer: { text: "" },
        }
      }),
      killAgent: mock(() => true),
      isAgentAlive: mock(() => true),
    }))

    const { spawnForPostAgent } = await import(`./agent?post=${Date.now()}`)
    const workDir = join(homeDir, "review")

    await spawnForPostAgent(
      {
        id: "issue-1",
        identifier: "TES-1",
        title: "Review TES-1",
        description: "",
        labels: [],
        priority: null,
        state: "published",
        repo: "acme/reeve",
      } as never,
      workDir,
      "prompt",
      createConfig(),
      "codex",
    )

    const meta = JSON.parse(readFileSync(join(workDir, "meta.json"), "utf-8"))
    expect(meta.tokensUsed).toEqual({
      input: 805775,
      output: 10180,
      total: 815955,
      cacheRead: 777472,
    })
    expect(meta.contextUsed).toBe(76152)
    expect(meta.contextSize).toBe(258400)
  })
})

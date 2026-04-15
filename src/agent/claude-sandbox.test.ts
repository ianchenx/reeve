import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

import type { ReeveDaemonConfig } from "../config"
import { cleanupTestTmp, testTmpDir } from "../test-helpers"
import { prepareClaudeSandbox } from "./claude-sandbox"

function createConfig(apiKey?: string): ReeveDaemonConfig {
  return {
    source: "linear",
    linear: {
      apiKey: apiKey ?? "",
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
      default: "claude",
    },
    polling: { intervalMs: 1 },
    dashboard: { port: 14500, enabled: true },
    projects: [],
  }
}

afterAll(() => {
  cleanupTestTmp()
})

describe("prepareClaudeSandbox", () => {
  test("returns empty handle when Linear API key is absent", async () => {
    const workDir = testTmpDir("claude-sandbox-empty-")

    const sandbox = await prepareClaudeSandbox(workDir, createConfig())

    expect(sandbox).toEqual({})
    expect(existsSync(resolve(workDir, ".mcp.json"))).toBe(false)
  })

  test("writes .mcp.json to agent CWD", async () => {
    const workDir = testTmpDir("claude-sandbox-write-")

    const sandbox = await prepareClaudeSandbox(workDir, createConfig("lin_api_test"))

    expect(sandbox).toEqual({})

    const content = JSON.parse(readFileSync(resolve(workDir, ".mcp.json"), "utf-8")) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>
    }

    expect(content).toEqual({
      mcpServers: {
        "reeve-linear": {
          command: "npx",
          args: ["-y", "mcp-graphql"],
          env: {
            ENDPOINT: "https://api.linear.app/graphql",
            ALLOW_MUTATIONS: "true",
            HEADERS: '{"Authorization":"lin_api_test"}',
          },
        },
      },
    })
  })

  test("is idempotent on a reused agent directory", async () => {
    const workDir = testTmpDir("claude-sandbox-idempotent-")

    await prepareClaudeSandbox(workDir, createConfig("lin_api_test"))
    const first = readFileSync(resolve(workDir, ".mcp.json"), "utf-8")

    await prepareClaudeSandbox(workDir, createConfig("lin_api_test"))
    const second = readFileSync(resolve(workDir, ".mcp.json"), "utf-8")

    expect(second).toBe(first)
  })
})

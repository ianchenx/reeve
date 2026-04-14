import { describe, expect, test } from "bun:test"

import type { ReeveDaemonConfig } from "../config"
import { prepareCodexSandbox } from "./codex-sandbox"

function createConfig(apiKey?: string): ReeveDaemonConfig {
  return {
    source: "linear",
    linear: {
      apiKey: apiKey ?? "",
      projectSlug: "",
      teamKey: "",
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

describe("prepareCodexSandbox", () => {
  test("returns empty handle when Linear API key is absent", async () => {
    const sandbox = await prepareCodexSandbox("/tmp/worktree", createConfig())
    expect(sandbox).toEqual({})
  })

  test("returns `-c` flags for reeve-linear when Linear API key is present", async () => {
    const sandbox = await prepareCodexSandbox("/tmp/worktree", createConfig("lin_api_test"))

    expect(sandbox).toEqual({
      extraArgs: [
        "-c",
        'mcp_servers.reeve-linear.command="npx"',
        "-c",
        'mcp_servers.reeve-linear.args=["-y","mcp-graphql"]',
        "-c",
        'mcp_servers.reeve-linear.env.ENDPOINT="https://api.linear.app/graphql"',
        "-c",
        'mcp_servers.reeve-linear.env.ALLOW_MUTATIONS="true"',
        "-c",
        'mcp_servers.reeve-linear.env.HEADERS="{\\"Authorization\\":\\"lin_api_test\\"}"',
      ],
    })
  })

  test("double-escapes HEADERS for TOML parsing", async () => {
    const sandbox = await prepareCodexSandbox("/tmp/worktree", createConfig('lin_api_"quoted"'))
    const headersArg = sandbox.extraArgs?.[9]

    expect(headersArg).toBe(
      'mcp_servers.reeve-linear.env.HEADERS="{\\"Authorization\\":\\"lin_api_\\\\\\"quoted\\\\\\"\\"}"',
    )
  })
})

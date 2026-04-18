import { afterEach, describe, expect, it, mock } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  buildRunNotReadyMessage,
  buildDaemonStartedBanner,
  buildAlreadyRunningMessage,
  bootstrapDaemonRuntime,
} from "./lifecycle"

describe("buildRunNotReadyMessage", () => {
  it("lists all preflight issues and suggests fixes", () => {
    const msg = buildRunNotReadyMessage([
      "No Linear API key configured",
      "No projects configured",
    ])
    expect(msg).toContain("✗")
    expect(msg).toContain("No Linear API key configured")
    expect(msg).toContain("No projects configured")
    expect(msg).toContain("reeve init")
    expect(msg).toContain("reeve start")
  })

  it("handles single issue without a bulleted list fallback", () => {
    const msg = buildRunNotReadyMessage(["Codex CLI not installed"])
    expect(msg).toContain("Codex CLI not installed")
    expect(msg).toContain("reeve init")
  })
})

describe("buildDaemonStartedBanner", () => {
  it("shows 3 actionable lines in start-friendly format", () => {
    const out = buildDaemonStartedBanner({ pid: 1234, port: 14500, logPath: "/tmp/reeve.log" })
    const lines = out.split("\n").filter(l => l.trim().length > 0)
    expect(lines.length).toBe(3)
    expect(lines[0]).toContain("http://localhost:14500")
    expect(out).toContain("/tmp/reeve.log")
    expect(out).toContain("reeve stop")
  })
})

describe("buildAlreadyRunningMessage", () => {
  it("names the existing pid and suggests stop", () => {
    const msg = buildAlreadyRunningMessage(9999)
    expect(msg).toContain("9999")
    expect(msg).toContain("reeve stop")
  })
})

afterEach(() => {
  mock.restore()
})

async function loadStartCli(opts: { ready: boolean }) {
  const reeveDir = mkdtempSync(join(tmpdir(), "reeve-start-test-"))
  const encoder = new TextEncoder()
  const writePid = mock(() => {})

  mock.module("../../config", () => ({
    loadConfig: () => ({
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
      workspace: { root: "/tmp/reeve-workspaces" },
      agent: {
        maxRounds: 1,
        stallTimeoutMs: 300_000,
        turnTimeoutMs: 3_600_000,
        maxRetries: 3,
        default: "codex",
      },
      polling: { intervalMs: 30_000 },
      dashboard: { port: 14500, enabled: true },
      projects: [],
    }),
    loadSettings: () => ({}),
    getSettingsPath: () => join(reeveDir, "settings.json"),
  }))

  mock.module("../../runtime-health", () => ({
    getRuntimeHealth: () => ({
      runtimeReady: opts.ready,
      issues: opts.ready ? [] : ["No projects configured"],
    }),
  }))

  mock.module("../../daemon-pid", () => ({
    readPid: () => null,
    writePid,
    removePid: mock(() => {}),
  }))

  const spawn = mock((_args: string[], _options: Record<string, unknown>) => ({
    pid: process.pid,
    unref() {},
  }))

  const originalSpawn = Bun.spawn
  const originalSpawnSync = Bun.spawnSync
  const originalSleep = Bun.sleep
  const originalExit = process.exit
  const originalLog = console.log

  Bun.spawn = spawn as unknown as typeof Bun.spawn
  Bun.spawnSync = ((args: string[]) => {
    if (args[0] === "tail") {
      return {
        stdout: encoder.encode("daemon failed\n"),
        stderr: encoder.encode(""),
        exitCode: 0,
        pid: 1,
        signal: null,
      } as unknown as ReturnType<typeof Bun.spawnSync>
    }

    return {
      stdout: encoder.encode("/usr/bin:/bin\n"),
      stderr: encoder.encode(""),
      exitCode: 0,
      pid: 1,
      signal: null,
    } as unknown as ReturnType<typeof Bun.spawnSync>
  }) as typeof Bun.spawnSync
  Bun.sleep = (async () => {}) as typeof Bun.sleep
  process.exit = ((code?: number): never => {
    throw new Error(`process.exit:${code ?? 0}`)
  }) as typeof process.exit
  console.log = (() => {}) as typeof console.log

  try {
    const { cac } = await import("cac")
    const { registerLifecycleCommands } = await import(`./lifecycle?start-test=${Date.now()}-${Math.random()}`)
    const cli = cac("reeve")
    registerLifecycleCommands(cli)
    return {
      cli,
      spawn,
      writePid,
      restore() {
        Bun.spawn = originalSpawn
        Bun.spawnSync = originalSpawnSync
        Bun.sleep = originalSleep
        process.exit = originalExit
        console.log = originalLog
      },
    }
  } catch (err) {
    Bun.spawn = originalSpawn
    Bun.spawnSync = originalSpawnSync
    Bun.sleep = originalSleep
    process.exit = originalExit
    console.log = originalLog
    throw err
  }
}

describe("bootstrapDaemonRuntime", () => {
  it("defers kernel creation until setup is ready", async () => {
    const createRuntime = mock(async () => ({ ok: true }))

    const runtime = await bootstrapDaemonRuntime(false, createRuntime)

    expect(runtime).toBeNull()
    expect(createRuntime).not.toHaveBeenCalled()
  })

  it("rethrows kernel bootstrap failures when setup is otherwise ready", async () => {
    const createRuntime = mock(async () => {
      throw new Error("boom")
    })

    await expect(bootstrapDaemonRuntime(true, createRuntime)).rejects.toThrow("boom")
    expect(createRuntime).toHaveBeenCalledTimes(1)
  })
})

describe("cmdStart", () => {
  it("starts daemon even when setup is incomplete", async () => {
    const { cli, spawn, writePid, restore } = await loadStartCli({
      ready: false,
    })

    try {
      await cli.parse(["bun", "/usr/local/bin/reeve", "start"])

      const spawnArgs = spawn.mock.calls[0]?.[0] as string[] | undefined
      expect(spawnArgs).toBeDefined()
      expect(spawnArgs?.at(-1)).toBe("daemon")
      expect(writePid).toHaveBeenCalledWith(process.pid)
    } finally {
      restore()
    }
  })
})

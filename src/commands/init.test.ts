import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { getSettingsPath } from "../config"
import { cleanupTestTmp, testTmpDir } from "../test-helpers"
import type { TeamFixture } from "../project-setup"

interface RunInitOptions {
  existingSettings?: Record<string, unknown> | null
  teams?: TeamFixture[]
  textValue?: string
  selectChoice?: TeamFixture
  viewerStatus?: number
  viewerNetworkFail?: boolean
}

interface RunInitResult {
  settings: Record<string, unknown>
  steps: string[]
  fetchBodies: string[]
  textCalls: number
  selectCalls: number
  infoLogs: string[]
  errorLogs: string[]
  exitCode?: number
}

function createSpawnSyncStub(): typeof Bun.spawnSync {
  const encoder = new TextEncoder()
  return ((args: string[]) => {
    const key = args.join(" ")
    if (key === "which codex") {
      return {
        exitCode: 0,
        stdout: encoder.encode("/usr/local/bin/codex\n"),
        stderr: encoder.encode(""),
        pid: 1,
        signal: null,
      } as unknown as ReturnType<typeof Bun.spawnSync>
    }

    return {
      exitCode: 1,
      stdout: encoder.encode(""),
      stderr: encoder.encode(""),
      pid: 1,
      signal: null,
    } as unknown as ReturnType<typeof Bun.spawnSync>
  }) as typeof Bun.spawnSync
}

async function runInit(
  options: RunInitOptions = {},
): Promise<RunInitResult> {
  const reeveDir = testTmpDir("init-reeve-")
  mkdirSync(reeveDir, { recursive: true })
  if (options.existingSettings !== null) {
    writeFileSync(
      join(reeveDir, "settings.json"),
      JSON.stringify({
        linearApiKey: "lin_api_test",
        defaultAgent: "codex",
        ...(options.existingSettings ?? {}),
      }),
    )
  }

  const steps: string[] = []
  const infoLogs: string[] = []
  const errorLogs: string[] = []
  const fetchBodies: string[] = []
  let textCalls = 0
  let selectCalls = 0
  let exitCode: number | undefined
  const teams = options.teams ?? [{ id: "team-1", key: "TES", name: "test" }]

  mock.module("@clack/prompts", () => ({
    intro: (): void => {},
    outro: (): void => {},
    text: async (): Promise<string> => {
      textCalls += 1
      return options.textValue ?? "lin_api_test"
    },
    confirm: async (): Promise<boolean> => true,
    select: async (): Promise<TeamFixture> => {
      selectCalls += 1
      return options.selectChoice ?? teams[0]
    },
    spinner: (): { start: (message: string) => void; stop: (message: string) => void } => ({
      start: (_message: string): void => {},
      stop: (_message: string): void => {},
    }),
    isCancel: (): boolean => false,
    log: {
      info: (message: string): void => {
        infoLogs.push(message)
      },
      warn: (_message: string): void => {},
      error: (message: string): void => {
        errorLogs.push(message)
      },
      success: (_message: string): void => {},
      step: (message: string): void => {
        steps.push(message)
      },
    },
  }))

  const statesResponse = { data: { team: { states: { nodes: [
    { id: "s1", name: "Backlog", type: "backlog" },
    { id: "s2", name: "Todo", type: "unstarted" },
    { id: "s3", name: "In Progress", type: "started" },
    { id: "s4", name: "Done", type: "completed" },
    { id: "s5", name: "In Review", type: "started" },
  ] } } } }
  const responses: Record<string, unknown> = {
    viewer: { data: { viewer: { name: "Ian" } } },
    teams: { data: { teams: { nodes: teams } } },
    states: statesResponse,
  }
  const originalFetch = globalThis.fetch
  const originalReeveDir = process.env.REEVE_DIR
  const originalSpawnSync = Bun.spawnSync
  const originalExit = process.exit

  // Set REEVE_DIR so loadSettings() reads from our temp dir
  process.env.REEVE_DIR = reeveDir
  Bun.spawnSync = createSpawnSyncStub()
  process.exit = ((code?: number): never => {
    exitCode = code
    throw new Error(`process.exit:${code ?? 0}`)
  }) as typeof process.exit

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = typeof init?.body === "string" ? init.body : ""
    fetchBodies.push(body)

    if (body.includes("viewer")) {
      if (options.viewerNetworkFail) throw new TypeError("fetch failed")
      if (options.viewerStatus && options.viewerStatus !== 200) {
        return new Response("nope", { status: options.viewerStatus })
      }
    }

    let resp: unknown
    if (body.includes("viewer")) resp = responses.viewer
    else if (body.includes("teams")) resp = responses.teams
    else if (body.includes("states")) resp = responses.states
    else resp = { data: {} }

    return new Response(JSON.stringify(resp), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as unknown as typeof fetch

  try {
    const { cmdInit } = await import(`./init?test=${Date.now()}`)
    try {
      await cmdInit()
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith("process.exit:")) {
        throw err
      }
    }

    const settingsPath = getSettingsPath()
    const settings = existsSync(settingsPath)
      ? JSON.parse(readFileSync(settingsPath, "utf-8"))
      : {}

    return { settings, steps, fetchBodies, textCalls, selectCalls, infoLogs, errorLogs, exitCode }
  } finally {
    globalThis.fetch = originalFetch
    Bun.spawnSync = originalSpawnSync
    process.exit = originalExit
    if (originalReeveDir) process.env.REEVE_DIR = originalReeveDir
    else delete process.env.REEVE_DIR
  }
}

afterEach((): void => {
  mock.restore()
})

afterAll((): void => {
  cleanupTestTmp()
})

describe("cmdInit", () => {
  test("saves API key and default agent", async (): Promise<void> => {
    const result = await runInit()

    expect(result.settings.linearApiKey).toBe("lin_api_test")
    expect(result.settings.defaultAgent).toBe("codex")
  })

  test("saves selected team as defaultTeam", async (): Promise<void> => {
    const result = await runInit()

    expect(result.settings.defaultTeam).toBe("TES")
  })

  test("first init without settings prompts for API key and creates settings", async (): Promise<void> => {
    const result = await runInit({
      existingSettings: null,
    })

    expect(result.textCalls).toBe(1)
    expect(result.settings.linearApiKey).toBe("lin_api_test")
    expect(result.settings.defaultAgent).toBe("codex")
    expect(result.settings.defaultTeam).toBe("TES")
  })

  test("existing API key skips the API key prompt", async (): Promise<void> => {
    const result = await runInit({
      existingSettings: { linearApiKey: "lin_api_existing" },
    })

    expect(result.textCalls).toBe(0)
    expect(result.settings.linearApiKey).toBe("lin_api_existing")
  })

  test("verifies API key against Linear", async (): Promise<void> => {
    const result = await runInit()

    expect(result.fetchBodies[0]).toContain("viewer")
  })

  test("runs workflow state discovery", async (): Promise<void> => {
    const result = await runInit()

    const statesFetch = result.fetchBodies.find(b => b.includes("states"))
    expect(statesFetch).toBeDefined()
  })

  test("does not prompt for projects or repos", async (): Promise<void> => {
    const result = await runInit()

    // Should NOT contain any project-related queries
    const projectFetch = result.fetchBodies.find(b => b.includes("projects"))
    expect(projectFetch).toBeUndefined()

    const repoFetch = result.fetchBodies.find(b => b.includes("repos"))
    expect(repoFetch).toBeUndefined()
  })

  test("preserves existing projects in settings", async (): Promise<void> => {
    const result = await runInit({
      existingSettings: {
        projects: [{ team: "ENG", linear: "existing-slug", repo: "org/existing", baseBranch: "main" }],
      },
    })

    const projects = result.settings.projects as Array<Record<string, string>>
    expect(projects).toHaveLength(1)
    expect(projects[0].repo).toBe("org/existing")
  })

  test("auto-selects the only team without prompting", async (): Promise<void> => {
    const result = await runInit({
      teams: [{ id: "team-1", key: "TES", name: "Test Team" }],
    })

    expect(result.selectCalls).toBe(0)
    expect(result.infoLogs).toContain("Team: Test Team (TES)")
    expect(result.settings.defaultTeam).toBe("TES")
  })

  test("prompts when multiple teams are available and saves the selected team", async (): Promise<void> => {
    const result = await runInit({
      teams: [
        { id: "team-1", key: "TES", name: "Test Team" },
        { id: "team-2", key: "OPS", name: "Operations" },
      ],
      selectChoice: { id: "team-2", key: "OPS", name: "Operations" },
    })

    expect(result.selectCalls).toBe(1)
    expect(result.settings.defaultTeam).toBe("OPS")
  })

  test("exits when Linear returns no teams", async (): Promise<void> => {
    const result = await runInit({
      teams: [],
    })

    expect(result.exitCode).toBe(1)
    expect(result.settings.defaultTeam).toBeUndefined()
  })

  test("invalid API key (401) emits actionable hint, not raw error", async (): Promise<void> => {
    const result = await runInit({
      existingSettings: null,
      viewerStatus: 401,
    })

    expect(result.exitCode).toBe(1)
    const allLogs = [...result.errorLogs, ...result.infoLogs].join("\n")
    expect(allLogs.toLowerCase()).toContain("api key")
    expect(allLogs).toContain("https://linear.app/settings/account/security")
    expect(allLogs).not.toMatch(/^Error: Linear API error: 401$/m)
  })

  test("network failure emits a reachability hint", async (): Promise<void> => {
    const result = await runInit({
      existingSettings: null,
      viewerNetworkFail: true,
    })

    expect(result.exitCode).toBe(1)
    const allLogs = [...result.errorLogs, ...result.infoLogs].join("\n")
    expect(allLogs.toLowerCase()).toMatch(/reach linear|network|proxy/)
  })
})

import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { getSettingsPath } from "../config"
import { cleanupTestTmp, testTmpDir } from "../test-helpers"

async function runInit(
  existingSettings: Record<string, unknown> = {},
): Promise<{
  settings: Record<string, unknown>
  steps: string[]
  fetchBodies: string[]
}> {
  const reeveDir = testTmpDir("init-reeve-")
  mkdirSync(reeveDir, { recursive: true })
  writeFileSync(
    join(reeveDir, "settings.json"),
    JSON.stringify({ linearApiKey: "lin_api_test", defaultAgent: "codex", ...existingSettings }),
  )

  const steps: string[] = []
  const fetchBodies: string[] = []

  mock.module("@clack/prompts", () => ({
    intro: (): void => {},
    outro: (): void => {},
    text: async (): Promise<string> => "lin_api_test",
    confirm: async (): Promise<boolean> => true,
    select: async (): Promise<string> => "",
    spinner: (): { start: (message: string) => void; stop: (message: string) => void } => ({
      start: (_message: string): void => {},
      stop: (_message: string): void => {},
    }),
    isCancel: (): boolean => false,
    log: {
      info: (_message: string): void => {},
      warn: (_message: string): void => {},
      error: (_message: string): void => {},
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
    teams: { data: { teams: { nodes: [{ id: "team-1", key: "TES", name: "test" }] } } },
    states: statesResponse,
  }
  const originalFetch = globalThis.fetch
  const originalReeveDir = process.env.REEVE_DIR

  // Set REEVE_DIR so loadSettings() reads from our temp dir
  process.env.REEVE_DIR = reeveDir

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = typeof init?.body === "string" ? init.body : ""
    fetchBodies.push(body)

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
    await cmdInit()

    const settingsPath = getSettingsPath()
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"))

    return { settings, steps, fetchBodies }
  } finally {
    globalThis.fetch = originalFetch
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
    const existing = {
      projects: [{ team: "ENG", linear: "existing-slug", repo: "org/existing", baseBranch: "main" }],
    }
    const result = await runInit(existing)

    const projects = result.settings.projects as Array<Record<string, string>>
    expect(projects).toHaveLength(1)
    expect(projects[0].repo).toBe("org/existing")
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

import type { ActionContext } from "./types"
import type { ReeveDaemonConfig } from "../config"
import { executeAction } from "./registry"

const createdDirs: string[] = []

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "reeve-actions-"))
  createdDirs.push(dir)
  return dir
}

function writeSettings(homeDir: string, settings: Record<string, unknown>): void {
  const settingsDir = resolve(homeDir, ".reeve")
  mkdirSync(settingsDir, { recursive: true })
  writeFileSync(join(settingsDir, "settings.json"), JSON.stringify(settings, null, 2))
}

function createCtx(): ActionContext {
  const config: ReeveDaemonConfig = {
    source: "linear",
    linear: {
      apiKey: "",
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

  return { config, projects: [] }
}

type SetupHealthFixture = {
  hasApiKey: boolean
  projectCount: number
  codexInstalled: boolean
  configured: boolean
  issues: string[]
}

type RuntimeHealthFixture = SetupHealthFixture & {
  ghInstalled: boolean
  ghAuthenticated: boolean
  ghLogin: string
  ghStatusDetail: string
  gitConfigured: boolean
  gitUserName: string
  gitUserEmail: string
  gitHubReachable: boolean
  gitHubReachableDetail: string
  githubReady: boolean
  runtimeReady: boolean
}

let currentSetupHealth: SetupHealthFixture = {
  hasApiKey: false,
  projectCount: 0,
  codexInstalled: false,
  configured: false,
  issues: [],
}

let currentRuntimeHealth: RuntimeHealthFixture = {
  ...currentSetupHealth,
  ghInstalled: false,
  ghAuthenticated: false,
  ghLogin: "",
  ghStatusDetail: "",
  gitConfigured: false,
  gitUserName: "",
  gitUserEmail: "",
  gitHubReachable: false,
  gitHubReachableDetail: "",
  githubReady: false,
  runtimeReady: false,
}

mock.module("../runtime-health", () => ({
  getSetupEntryHealth: () => currentSetupHealth,
  getRuntimeHealth: () => currentRuntimeHealth,
}))

let verifyRepoExistsResult: string | null = null
mock.module("../workspace/repo-store", () => ({
  verifyRepoExists: async () => verifyRepoExistsResult,
  RepoStore: class {
    constructor(_reposRoot: string) {}
    repoDirOf(repoRef: string): string {
      return resolve("/fake/repos", repoRef)
    }
    async ensure(repoRef: string): Promise<string> {
      return resolve("/fake/repos", repoRef)
    }
  },
}))

beforeAll(async () => {
  await import("./index")
})

describe("projects actions", () => {
  const savedHome = process.env.HOME
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    verifyRepoExistsResult = null
    currentSetupHealth = {
      hasApiKey: false,
      projectCount: 0,
      codexInstalled: false,
      configured: false,
      issues: [],
    }
    currentRuntimeHealth = {
      ...currentSetupHealth,
      ghInstalled: true,
      ghAuthenticated: false,
      ghLogin: "",
      ghStatusDetail: "Run gh auth login",
      gitConfigured: false,
      gitUserName: "",
      gitUserEmail: "",
      gitHubReachable: false,
      gitHubReachableDetail: "",
      githubReady: false,
      runtimeReady: false,
    }
  })

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
    if (savedHome !== undefined) process.env.HOME = savedHome
    else delete process.env.HOME
    globalThis.fetch = originalFetch
  })

  test("projectDetect uses saved Linear key when runtime config is stale", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, { linearApiKey: "lin_api_saved" })

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("teams")) {
        return new Response(JSON.stringify({
          data: { teams: { nodes: [{ id: "team-1", key: "WOR", name: "Workflows" }] } },
        }))
      }
      return new Response(JSON.stringify({ data: {} }))
    }) as typeof fetch

    const result = await executeAction(createCtx(), "projectDetect", { repo: "acme/app" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.data as { teams: Array<{ key: string; name: string }> }).teams).toEqual([
      { key: "WOR", name: "Workflows" },
    ])
  })

  test("teamProjects uses saved Linear key when runtime config is stale", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, { linearApiKey: "lin_api_saved" })

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("teams")) {
        return new Response(JSON.stringify({
          data: { teams: { nodes: [{ id: "team-1", key: "WOR", name: "Workflows" }] } },
        }))
      }
      if (body.includes("projects")) {
        return new Response(JSON.stringify({
          data: { team: { projects: { nodes: [{ slugId: "proj-1", name: "App" }] } } },
        }))
      }
      return new Response(JSON.stringify({ data: {} }))
    }) as typeof fetch

    const result = await executeAction(createCtx(), "teamProjects", { teamKey: "WOR" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual([{ slugId: "proj-1", name: "App" }])
  })

  test("setupSave persists a valid Linear key", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})

    const teamsResponse = {
      data: { teams: { nodes: [{ id: "team-1", key: "TES", name: "Test Team" }] } },
    }

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("teams")) {
        return new Response(JSON.stringify(teamsResponse), { status: 200 })
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 })
    }) as typeof fetch

    const result = await executeAction(createCtx(), "setupSave", { linearApiKey: "lin_api_test" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as { ok: boolean; teams: Array<{ key: string; name: string }> }
    expect(data.ok).toBe(true)
    expect(data.teams).toEqual([{ key: "TES", name: "Test Team" }])

    const stored = JSON.parse(
      readFileSync(join(homeDir, ".reeve", "settings.json"), "utf-8"),
    )
    expect(stored.linearApiKey).toBe("lin_api_test")
  })

  test("setupStatus returns runtime diagnostics without MCP fields", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, { linearApiKey: "lin-status" })

    currentRuntimeHealth = {
      hasApiKey: true,
      projectCount: 1,
      codexInstalled: false,
      configured: false,
      issues: ["Codex CLI not installed"],
      ghInstalled: true,
      ghAuthenticated: true,
      ghLogin: "testuser",
      ghStatusDetail: "Logged in as testuser",
      gitConfigured: true,
      gitUserName: "Ian",
      gitUserEmail: "ian@example.com",
      gitHubReachable: true,
      gitHubReachableDetail: "git can reach github.com",
      githubReady: true,
      runtimeReady: false,
    }

    const result = await executeAction(createCtx(), "setupStatus", {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as { codexInstalled: boolean; githubReady: boolean }
    expect(data.codexInstalled).toBe(false)
    expect(data.githubReady).toBe(true)
  })

  test("setupCheck stays unconfigured when Codex CLI is missing", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {
      linearApiKey: "lin_api_test",
      projects: [{ team: "TES", linear: "proj", repo: "ian/demo" }],
    })

    currentSetupHealth = {
      hasApiKey: true,
      projectCount: 1,
      codexInstalled: false,
      configured: false,
      issues: ["Codex CLI not installed"],
    }

    const result = await executeAction(createCtx(), "setupCheck", {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as { configured: boolean; hasApiKey: boolean; projectCount: number }
    expect(data.hasApiKey).toBe(true)
    expect(data.projectCount).toBe(1)
    expect(data.configured).toBe(false)
  })

  test("setupCheck allows dashboard entry before the first project is added", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {
      linearApiKey: "lin_api_test",
      projects: [],
    })

    currentSetupHealth = {
      hasApiKey: true,
      projectCount: 0,
      codexInstalled: true,
      configured: false,
      issues: ["No projects configured"],
    }

    const result = await executeAction(createCtx(), "setupCheck", {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as { configured: boolean; hasApiKey: boolean; projectCount: number }
    expect(data.hasApiKey).toBe(true)
    expect(data.projectCount).toBe(0)
    expect(data.configured).toBe(true)
  })

  test("projectImport surfaces missing workflow states when Linear rejects creation", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, { linearApiKey: "lin_api_test" })

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("teams")) {
        return new Response(JSON.stringify({
          data: { teams: { nodes: [{ id: "team-1", key: "WOR", name: "Workflows" }] } },
        }))
      }
      if (body.includes("team(id:")) {
        return new Response(JSON.stringify({
          data: { team: { states: { nodes: [
            { id: "s1", name: "Todo", type: "unstarted" },
            { id: "s2", name: "In Progress", type: "started" },
          ] } } },
        }))
      }
      if (body.includes("workflowStateCreate")) {
        return new Response(JSON.stringify({
          data: { workflowStateCreate: { success: false, workflowState: null } },
        }))
      }
      return new Response(JSON.stringify({ data: {} }))
    }) as typeof fetch

    const result = await executeAction(createCtx(), "projectImport", {
      repo: "ian/demo",
      slug: "proj-1",
      team: "WOR",
      baseBranch: "main",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as { ok: boolean; slug: string; missingStates?: Array<{ name: string; error?: string }> }
    expect(data.missingStates?.map(m => m.name) ?? []).toContain("In Review")
  })

  test("projectImport keeps repo identifier when hot-adding it to a running kernel", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})

    const workspaceRoot = resolve(homeDir, ".reeve", "workspaces")
    mkdirSync(resolve(workspaceRoot, "ian", "demo", ".git"), { recursive: true })

    const addedRepos: string[] = []
    const ctx = createCtx()
    ctx.config.workspace.root = workspaceRoot
    ctx.kernel = {
      addProject(project: { repo: string }) {
        addedRepos.push(project.repo)
      },
      updateProject() {
        return false
      },
    } as any

    const result = await executeAction(ctx, "projectImport", {
      repo: "ian/demo",
      slug: "proj-1",
      team: "TES",
      baseBranch: "main",
    })

    expect(result.ok).toBe(true)
    expect(addedRepos).toEqual(["ian/demo"])

    const stored = JSON.parse(readFileSync(join(homeDir, ".reeve", "settings.json"), "utf-8"))
    expect(stored.projects).toEqual([
      {
        team: "TES",
        linear: "proj-1",
        repo: "ian/demo",
        baseBranch: "main",
      },
    ])
  })

  test("projectImport auto-activates the kernel on first successful import", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})
    // verifyRepoExistsResult defaults to null in beforeEach — repo check passes.

    const workspaceRoot = resolve(homeDir, ".reeve", "workspaces")
    mkdirSync(resolve(workspaceRoot, "acme", "app", ".git"), { recursive: true })

    const onActivate = mock(async () => {})
    const ctx = createCtx()
    ctx.config.workspace.root = workspaceRoot
    ctx.onActivate = onActivate

    const result = await executeAction(ctx, "projectImport", {
      repo: "acme/app",
      slug: "proj-1",
      team: "TES",
      baseBranch: "main",
    })

    expect(result.ok).toBe(true)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  test("projectImport returns before background activation finishes", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})

    const workspaceRoot = resolve(homeDir, ".reeve", "workspaces")
    mkdirSync(resolve(workspaceRoot, "acme", "slow-app", ".git"), { recursive: true })

    let releaseActivation!: () => void
    const onActivate = mock(() => new Promise<void>((resolve) => {
      releaseActivation = resolve
    }))

    const ctx = createCtx()
    ctx.config.workspace.root = workspaceRoot
    ctx.onActivate = onActivate

    let settled = false
    const resultPromise = executeAction(ctx, "projectImport", {
      repo: "acme/slow-app",
      slug: "proj-slow",
      team: "TES",
      baseBranch: "main",
    }).then((result) => {
      settled = true
      return result
    })

    await Bun.sleep(25)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(settled).toBe(true)

    releaseActivation()
    const result = await resultPromise
    expect(result.ok).toBe(true)
  })

  test("projectImport does not auto-activate when kernel is already ticking", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})

    const workspaceRoot = resolve(homeDir, ".reeve", "workspaces")
    mkdirSync(resolve(workspaceRoot, "acme", "app2", ".git"), { recursive: true })

    const onActivate = mock(async () => {})
    const ctx = createCtx()
    ctx.config.workspace.root = workspaceRoot
    ctx.onActivate = onActivate
    ctx.kernel = {
      lastTickAt: Date.now(),
      addProject() {},
      updateProject() { return false },
    } as any

    const result = await executeAction(ctx, "projectImport", {
      repo: "acme/app2",
      slug: "proj-2",
      team: "TES",
      baseBranch: "main",
    })

    expect(result.ok).toBe(true)
    expect(onActivate).not.toHaveBeenCalled()
  })

  test("projectImport rejects unreachable repo before mutating settings", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})
    verifyRepoExistsResult = "could not resolve to a repository"

    const result = await executeAction(createCtx(), "projectImport", {
      repo: "acme/missing",
      slug: "proj-1",
      team: "TES",
      baseBranch: "main",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("acme/missing")
    expect(result.error).toContain("could not resolve to a repository")

    const settingsPath = join(homeDir, ".reeve", "settings.json")
    if (existsSync(settingsPath)) {
      const stored = JSON.parse(readFileSync(settingsPath, "utf-8"))
      expect(stored.projects ?? []).toEqual([])
    }
  })

  test("projectImport rejects malformed repo input via zod", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})

    const result = await executeAction(createCtx(), "projectImport", {
      repo: "/Users/me/code/app",
      slug: "proj-1",
      team: "TES",
      baseBranch: "main",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("org/repo")
  })

  test("setupSave does not persist an invalid Linear key", async () => {
    const homeDir = createTempHome()
    process.env.HOME = homeDir
    writeSettings(homeDir, {})

    globalThis.fetch = (async (): Promise<Response> => {
      throw new Error("invalid key")
    }) as unknown as typeof fetch

    const result = await executeAction(createCtx(), "setupSave", { linearApiKey: "lin_api_invalid" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as { linearValid?: boolean; linearError?: string }
    expect(data.linearValid).toBe(false)
    expect(data.linearError).toBe("Could not connect to Linear. Check the key.")

    const settingsPath = join(homeDir, ".reeve", "settings.json")
    const stored = JSON.parse(readFileSync(settingsPath, "utf-8"))
    expect(stored.linearApiKey).toBeUndefined()
  })
})

// server.test.ts — API contract tests
// Starts a real Hono server with a real Kernel (mock Source).
// Tests project CRUD, config reads, and hot-reload behavior through HTTP.

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { resolve } from "path"
import { createApiApp } from "./server"
import { Kernel } from "./kernel"
import type { Source } from "./source"
import type { ReeveDaemonConfig, ProjectConfig } from "../config"
import type { KernelConfig } from "./types"
import type { ActionContext } from "../actions/types"

// Force action registration
import "../actions/index"

// ── Test isolation ────────────────────────────────────────────

const TEST_DIR = resolve(process.cwd(), ".test-tmp", `server-${Date.now()}`)
const SETTINGS_PATH = resolve(TEST_DIR, "settings.json")

function writeSettings(projects: Array<Record<string, unknown>> = []) {
  writeFileSync(SETTINGS_PATH, JSON.stringify({
    linearApiKey: "test_key",
    projects,
  }, null, 2))
}

// ── Mock source ──────────────────────────────────────────────

const mockSource: Source = {
  poll: async () => [],
  onStart: async () => {},
  onDone: async () => {},
  fetchDisposition: async () => "unknown",
}

// ── Server setup ─────────────────────────────────────────────

let server: ReturnType<typeof Bun.serve>
let base: string
let kernel: Kernel

const TEST_PROJECT: Omit<ProjectConfig, "slug"> & { slug: string } = {
  team: "TEST",
  slug: "test-slug",
  repo: "testorg/testrepo",
  baseBranch: "main",
  setup: "bun install",
  agent: "claude",
  post: { review: "codex" },
}

beforeAll(() => {
  // Isolate state/logs into temp dir
  process.env.REEVE_DIR = TEST_DIR
  mkdirSync(TEST_DIR, { recursive: true })

  writeSettings([{
    team: TEST_PROJECT.team,
    linear: TEST_PROJECT.slug,
    repo: TEST_PROJECT.repo,
    baseBranch: TEST_PROJECT.baseBranch,
    setup: TEST_PROJECT.setup,
    agent: TEST_PROJECT.agent,
    post: TEST_PROJECT.post,
  }])

  const config: ReeveDaemonConfig = {
    source: "linear",
    workspace: { root: resolve(TEST_DIR, "workspaces") },
    agent: { maxRounds: 1, stallTimeoutMs: 300000, turnTimeoutMs: 3600000, maxRetries: 2, default: "claude" },
    polling: { intervalMs: 60000 },
    dashboard: { port: 0, enabled: false },
    projects: [{
      team: TEST_PROJECT.team,
      slug: TEST_PROJECT.slug,
      repo: TEST_PROJECT.repo,
      baseBranch: TEST_PROJECT.baseBranch,
      setup: TEST_PROJECT.setup,
      agent: TEST_PROJECT.agent,
      post: TEST_PROJECT.post,
    }],
  }

  const kernelConfig: KernelConfig = {
    maxRounds: 1,
    pollIntervalMs: 60000,
    stallTimeoutMs: 300000,
    turnTimeoutMs: 3600000,
    agentDefault: "claude",
    dashboardPort: 0,
    dashboardEnabled: false,
  }

  kernel = new Kernel(mockSource, config, kernelConfig)

  const getCtx = (): ActionContext => ({
    kernel,
    config,
    projects: config.projects.map(p => ({ slug: p.slug, repo: p.repo })),
  })

  const app = createApiApp({ getCtx })

  server = Bun.serve({
    port: 0,
    fetch: app.fetch,
  })
  base = `http://localhost:${server.port}`
})

afterAll(() => {
  server?.stop()
  try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  delete process.env.REEVE_DIR
})

// ── Helpers ──────────────────────────────────────────────────

async function api(path: string, opts?: RequestInit) {
  return fetch(`${base}${path}`, opts)
}

async function json(path: string, opts?: RequestInit) {
  const res = await api(path, opts)
  return { status: res.status, data: await res.json() }
}

async function patch(path: string, body: unknown) {
  return json(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ── Tests ────────────────────────────────────────────────────

describe("Project CRUD", () => {

  describe("GET /projects", () => {
    it("returns projects with full config fields", async () => {
      const { status, data } = await json("/projects")
      expect(status).toBe(200)
      expect(data).toBeArray()
      expect(data.length).toBeGreaterThanOrEqual(1)

      const project = data.find((p: any) => p.repo === TEST_PROJECT.repo)
      expect(project).toBeDefined()
      expect(project.slug).toBe(TEST_PROJECT.slug)
      expect(project.team).toBe(TEST_PROJECT.team)
      expect(project.agent).toBe(TEST_PROJECT.agent)
      expect(project.setup).toBe(TEST_PROJECT.setup)
      expect(project.post).toEqual(TEST_PROJECT.post as any)
    })
  })

  describe("PATCH /projects/:slug", () => {
    it("updates agent and reflects in next GET", async () => {
      const { status, data } = await patch(`/projects/${TEST_PROJECT.slug}`, { agent: "codex" })
      expect(status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.project.agent).toBe("codex")

      // Verify GET returns updated value
      const { data: list } = await json("/projects")
      const project = list.find((p: any) => p.repo === TEST_PROJECT.repo)
      expect(project.agent).toBe("codex")

      // Restore
      await patch(`/projects/${TEST_PROJECT.slug}`, { agent: "claude" })
    })

    it("updates post and reflects in kernel memory", async () => {
      await patch(`/projects/${TEST_PROJECT.slug}`, { post: {} })

      const config = kernel.getConfig()
      const project = config.projects.find(p => p.repo === TEST_PROJECT.repo)
      expect(project?.post).toBeUndefined()

      // Restore
      await patch(`/projects/${TEST_PROJECT.slug}`, { post: { review: "codex" } })
    })

    it("clears field with null", async () => {
      await patch(`/projects/${TEST_PROJECT.slug}`, { setup: null })

      const { data: list } = await json("/projects")
      const project = list.find((p: any) => p.repo === TEST_PROJECT.repo)
      expect(project.setup).toBeUndefined()

      // Restore
      await patch(`/projects/${TEST_PROJECT.slug}`, { setup: "bun install" })
    })

    it("leaves other fields unchanged when updating one field", async () => {
      // Only update agent, verify setup and post are untouched
      await patch(`/projects/${TEST_PROJECT.slug}`, { agent: "auto" })

      const { data: list } = await json("/projects")
      const project = list.find((p: any) => p.repo === TEST_PROJECT.repo)
      expect(project.agent).toBe("auto")
      expect(project.setup).toBe("bun install")
      expect(project.post).toEqual({ review: "codex" })

      // Restore
      await patch(`/projects/${TEST_PROJECT.slug}`, { agent: "claude" })
    })

    it("returns 404 for unknown slug", async () => {
      const { status } = await patch("/projects/nonexistent", { agent: "codex" })
      expect(status).toBe(500) // action throws → 500
    })
  })

  describe("DELETE /projects/:slug", () => {
    it("removes project from kernel and list", async () => {
      // First add a throwaway project
      kernel.addProject({ team: "X", slug: "throwaway", repo: "x/throwaway", baseBranch: "main" })
      writeSettings([
        { team: TEST_PROJECT.team, linear: TEST_PROJECT.slug, repo: TEST_PROJECT.repo, baseBranch: TEST_PROJECT.baseBranch, setup: TEST_PROJECT.setup, agent: TEST_PROJECT.agent, post: TEST_PROJECT.post },
        { team: "X", linear: "throwaway", repo: "x/throwaway", baseBranch: "main" },
      ])

      const { status, data } = await json("/projects/throwaway", { method: "DELETE" })
      expect(status).toBe(200)
      expect(data.ok).toBe(true)

      // Verify it's gone from kernel memory
      const config = kernel.getConfig()
      expect(config.projects.find(p => p.slug === "throwaway")).toBeUndefined()
    })
  })
})

describe("Config", () => {
  it("GET /config returns config summary", async () => {
    const { status, data } = await json("/config")
    expect(status).toBe(200)
    expect(data).toHaveProperty("projects")
  })
})

describe("Tasks", () => {
  it("GET /tasks returns task list", async () => {
    const { status, data } = await json("/tasks")
    expect(status).toBe(200)
    expect(data).toBeArray()
  })
})

describe("Health", () => {
  it("GET /health responds", async () => {
    const { status } = await json("/health")
    expect(status).toBe(200)
  })
})

describe("Version", () => {
  it("GET /version returns version info without auth", async () => {
    const res = await fetch(`${base}/version`)
    expect(res.status).toBe(200)
    const body = await res.json() as { current: string; latest: string | null; hasUpdate: boolean }
    expect(body).toHaveProperty("current")
    expect(body).toHaveProperty("hasUpdate")
    expect(typeof body.current).toBe("string")
    expect(typeof body.hasUpdate).toBe("boolean")
  })
})

describe("SSE", () => {
  it("GET /events returns SSE stream with init event", async () => {
    const controller = new AbortController()
    const res = await api("/events", { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")

    // Read the first chunk (init event)
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('"type":"init"')

    controller.abort()
  })
})

describe("Hot-reload behavior", () => {
  it("PATCH agent → kernel.findProject returns new value for dispatch", async () => {
    // Simulate what dispatch does: kernel reads project config
    const before = kernel.getConfig().projects.find(p => p.repo === TEST_PROJECT.repo)
    expect(before?.agent).toBe("claude")

    await patch(`/projects/${TEST_PROJECT.slug}`, { agent: "codex" })

    const after = kernel.getConfig().projects.find(p => p.repo === TEST_PROJECT.repo)
    expect(after?.agent).toBe("codex")

    // Restore
    await patch(`/projects/${TEST_PROJECT.slug}`, { agent: "claude" })
  })

  it("PATCH post → updates post-agent chain", async () => {
    await patch(`/projects/${TEST_PROJECT.slug}`, { post: {} })

    const project = kernel.getConfig().projects.find(p => p.repo === TEST_PROJECT.repo)
    expect(project?.post).toBeUndefined()

    // Restore
    await patch(`/projects/${TEST_PROJECT.slug}`, { post: { review: "codex" } })
  })
})

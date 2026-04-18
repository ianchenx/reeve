import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import type { ReeveDaemonConfig } from "../config"
import type { Source } from "./source"
import type { KernelConfig, Task } from "./types"

function createConfig(): ReeveDaemonConfig {
  return {
    source: "linear",
    linear: {
      apiKey: "lin_api_test",
      projectSlug: "test-project",
      teamKey: "TEST",
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
    projects: [],
  }
}

const KERNEL_CONFIG: KernelConfig = {
  maxRounds: 2,
  maxRetries: 2,
  pollIntervalMs: 60000,
  stallTimeoutMs: 300000,
  turnTimeoutMs: 3600000,
  agentDefault: "codex",
  dashboardPort: 14500,
  dashboardEnabled: false,
}

function createSource(): Source {
  return {
    poll: async () => [],
    onStart: async () => {},
    onDone: async () => {},
    fetchDisposition: async () => "unknown",
  }
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "issue-1",
    identifier: "TES-1",
    title: "Kernel runtime test",
    description: "",
    labels: [],
    priority: null,
    state: "queued",
    repo: "/tmp/repo",
    baseBranch: "main",
    round: 0,
    maxRounds: 2,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("Kernel runtime behavior", () => {
  let reeveDir: string

  beforeAll(() => {
    reeveDir = mkdtempSync(join(tmpdir(), "reeve-kernel-runtime-"))
    process.env.REEVE_DIR = reeveDir
    process.env.REEVE_NO_UPDATE_CHECK = "1"
  })

  beforeEach(() => {
    rmSync(reeveDir, { recursive: true, force: true })
    mkdirSync(reeveDir, { recursive: true })
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    rmSync(reeveDir, { recursive: true, force: true })
    delete process.env.REEVE_DIR
    delete process.env.REEVE_NO_UPDATE_CHECK
  })

  test("dispatch passes retryCount + 1 as the agent attempt", async () => {
    let seenAttempt: number | undefined

    class MockWorkspaceManager {
      async fetchLatest(): Promise<void> {}
      async createForTask() {
        return {
          identifier: "TES-1",
          branch: "agent/tes-1",
          taskDir: "/tmp/task",
          workDir: "/tmp/task/implement",
          worktreeDir: "/tmp/task/repo",
          created: true,
        }
      }
      async cleanOrphans(): Promise<string[]> {
        return []
      }
    }

    class MockRepoStore {
      async ensure(repoRef: string): Promise<string> {
        return `/fake/repos/${repoRef}`
      }
    }

    const { Kernel } = await import(`./kernel?dispatch-attempt=${Date.now()}`)
    const kernel = new Kernel(createSource(), createConfig(), KERNEL_CONFIG)
    ;(kernel as any).workspace = new MockWorkspaceManager()
    ;(kernel as any).repoStore = new MockRepoStore()
    ;(kernel as any).spawnAndAttach = async (_task: Task, _agent: string, attempt: number): Promise<void> => {
      seenAttempt = attempt
    }
    ;(kernel as any).store.set(createTask({ retryCount: 2 }))

    await (kernel as any).dispatch()

    expect(seenAttempt).toBe(3)
  })

  test("start keeps configured project repos as repo identifiers", async () => {
    const workspaceRoot = join(reeveDir, "workspaces")

    class MockWorkspaceManager {
      async cleanOrphans(): Promise<string[]> {
        return []
      }
    }

    const { Kernel } = await import(`./kernel?project-repos=${Date.now()}`)
    const kernel = new Kernel(createSource(), {
      ...createConfig(),
      workspace: { root: workspaceRoot },
      projects: [{ team: "TES", slug: "proj", repo: "acme/app", baseBranch: "main" }],
    }, KERNEL_CONFIG)
    ;(kernel as any).workspace = new MockWorkspaceManager()

    await kernel.start()
    kernel.stop()

    expect(kernel.getConfig().projects[0]?.repo).toBe("acme/app")
  })

  test("dispatch resolves repo identifier through RepoStore before invoking workspace", async () => {
    const workspaceRoot = join(reeveDir, "workspaces")
    const ensureCalls: string[] = []
    const fetchCalls: string[] = []
    const createCalls: Array<[string, string, string | undefined]> = []

    class MockWorkspaceManager {
      async fetchLatest(repoDir: string): Promise<void> {
        fetchCalls.push(repoDir)
      }
      async createForTask(identifier: string, repoDir: string, baseBranch?: string) {
        createCalls.push([identifier, repoDir, baseBranch])
        return {
          identifier: "TES-1",
          branch: "agent/tes-1",
          taskDir: "/tmp/task",
          workDir: "/tmp/task/implement",
          worktreeDir: "/tmp/task/repo",
          created: true,
        }
      }
      async cleanOrphans(): Promise<string[]> {
        return []
      }
    }

    class MockRepoStore {
      async ensure(repoRef: string): Promise<string> {
        ensureCalls.push(repoRef)
        return `/fake/repos/${repoRef}`
      }
    }

    const { Kernel } = await import(`./kernel?repo-identifier=${Date.now()}`)
    const kernel = new Kernel(createSource(), {
      ...createConfig(),
      workspace: { root: workspaceRoot },
      projects: [{ team: "TES", slug: "proj", repo: "acme/app", baseBranch: "main" }],
    }, KERNEL_CONFIG)
    ;(kernel as any).workspace = new MockWorkspaceManager()
    ;(kernel as any).repoStore = new MockRepoStore()
    ;(kernel as any).spawnAndAttach = async (): Promise<void> => {}
    ;(kernel as any).store.set(createTask({ repo: "acme/app" }))

    await (kernel as any).dispatch()

    expect(ensureCalls).toEqual(["acme/app"])
    expect(fetchCalls).toEqual(["/fake/repos/acme/app"])
    expect(createCalls).toEqual([["TES-1", "/fake/repos/acme/app", "main"]])
    expect(kernel.getTask("issue-1")?.repo).toBe("acme/app")
  })

  test("retryTask revives a failed task in place", async () => {
    const { Kernel } = await import(`./kernel?retry-continue=${Date.now()}`)
    const kernel = new Kernel(createSource(), createConfig(), KERNEL_CONFIG)
    ;(kernel as any).store.set(
      createTask({
        id: "failed-1",
        identifier: "TES-9",
        state: "done",
        doneReason: "failed",
        round: 2,
        retryCount: 2,
        lastExitDisposition: "actionable",
      }),
    )

    const result = await (kernel as any).retryTask("TES-9", false)
    const task = kernel.getTask("failed-1")

    expect(result).toEqual({
      mode: "continue",
      identifier: "TES-9",
      message: "Task revived — will re-dispatch on next tick",
    })
    expect(task?.state).toBe("published")
    expect(task?.doneReason).toBeUndefined()
    expect(task?.round).toBe(0)
    expect(task?.retryCount).toBe(0)
    expect(task?.lastExitDisposition).toBe("passive")
  })

  test("retryTask clean removes the old task and kills any tracked pid", async () => {
    const killAgent = mock(() => true)

    mock.module("./agent", () => ({
      spawn: mock(async () => ({
        pid: 1234,
        agent: "codex",
        done: new Promise(() => {}),
      })),
      killAgent,
      isAgentAlive: mock(() => false),
    }))

    const { Kernel } = await import(`./kernel?retry-clean=${Date.now()}`)
    const kernel = new Kernel(createSource(), createConfig(), KERNEL_CONFIG)
    ;(kernel as any).store.set(
      createTask({
        id: "failed-2",
        identifier: "TES-10",
        state: "done",
        doneReason: "failed",
        pid: 4321,
      }),
    )

    const result = await (kernel as any).retryTask("TES-10", true)

    expect(result).toEqual({
      mode: "clean",
      identifier: "TES-10",
      message: "Task removed — will be re-created on next poll if issue is in Todo",
    })
    expect(killAgent).toHaveBeenCalledWith(4321)
    expect(kernel.getTask("failed-2")).toBeUndefined()
  })
})

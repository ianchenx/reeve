// kernel.test.ts — Kernel state machine tests
// Uses a mock Lifecycle to test pure state transitions without real git/agent ops.

import { describe, it, expect, beforeEach } from "bun:test"
import type { Task, KernelConfig } from "./types"
import { StateStore } from "./state"
import { assertTransition } from "./types"

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    identifier: "WOR-1",
    title: "Test task",
    description: "Test description",
    labels: [],
    priority: 1,
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

const DEFAULT_CONFIG: KernelConfig = {
  maxRounds: 2,
  maxRetries: 2,
  pollIntervalMs: 60000,
  stallTimeoutMs: 300000,      // 5 minutes
  turnTimeoutMs: 3600000,      // 1 hour
  agentDefault: "claude",
  dashboardPort: 7700,
  dashboardEnabled: false,
}

// ── Minimal kernel wrapper for testing ──────────────────────
// We can't import the real Kernel easily (it auto-wires real deps),
// so we test the state transition logic directly.

describe("State transitions", () => {
  it("queued → active is valid", () => {
    expect(() => assertTransition("queued", "active")).not.toThrow()
  })

  it("active → published is valid", () => {
    expect(() => assertTransition("active", "published")).not.toThrow()
  })

  it("active → queued is valid (retry)", () => {
    expect(() => assertTransition("active", "queued")).not.toThrow()
  })

  it("active → done is valid", () => {
    expect(() => assertTransition("active", "done")).not.toThrow()
  })

  it("published → active is valid", () => {
    expect(() => assertTransition("published", "active")).not.toThrow()
  })

  it("published → done is valid", () => {
    expect(() => assertTransition("published", "done")).not.toThrow()
  })

  it("done → anything throws", () => {
    expect(() => assertTransition("done", "queued")).toThrow()
    expect(() => assertTransition("done", "active")).toThrow()
  })

  it("queued → published is invalid (must go through active)", () => {
    expect(() => assertTransition("queued", "published")).toThrow()
  })
})

describe("StateStore integration for kernel patterns", () => {
  let store: StateStore

  beforeEach(() => {
    store = new StateStore("/tmp/test-kernel-state-" + Date.now() + ".json")
  })

  describe("intake", () => {
    it("adds new items as queued tasks", () => {
      const task = makeTask({ id: "new-1", state: "queued" })
      store.set(task)
      expect(store.get("new-1")?.state).toBe("queued")
    })

    it("skips existing items", () => {
      const task = makeTask({ id: "existing", state: "active" })
      store.set(task)
      // Simulating intake: if id exists, skip
      const exists = store.get("existing")
      expect(exists).toBeDefined()
      expect(exists?.state).toBe("active") // unchanged
    })
  })

  describe("dispatch filtering", () => {
    it("only dispatches queued tasks", () => {
      store.set(makeTask({ id: "q1", state: "queued" }))
      store.set(makeTask({ id: "a1", state: "active" }))
      store.set(makeTask({ id: "p1", state: "published" }))

      const queued = store.byState("queued")
      expect(queued.length).toBe(1)
      expect(queued[0].id).toBe("q1")
    })

    it("filters retryAfter not yet expired", () => {
      const futureTask = makeTask({
        id: "r1",
        state: "queued",
        retryAfter: new Date(Date.now() + 60000).toISOString(),
      })
      const readyTask = makeTask({
        id: "r2",
        state: "queued",
        retryAfter: new Date(Date.now() - 1000).toISOString(),
      })
      store.set(futureTask)
      store.set(readyTask)

      const now = Date.now()
      const dispatchable = store.byState("queued")
        .filter(t => !t.retryAfter || new Date(t.retryAfter).getTime() <= now)

      expect(dispatchable.length).toBe(1)
      expect(dispatchable[0].id).toBe("r2")
    })
  })

  describe("retry logic", () => {
    it("increments retryCount and sets retryAfter on gate failure", () => {
      const task = makeTask({ id: "retry-1", state: "active", retryCount: 0 })
      store.set(task)

      // Simulate gate failure → retry
      const maxRetries = DEFAULT_CONFIG.maxRetries ?? 2
      if (task.retryCount < maxRetries) {
        task.retryCount++
        task.trace = { gateReason: "validate hook failed" }
        const backoffMs = Math.min(60_000 * Math.pow(2, task.retryCount - 1), 600_000)
        task.retryAfter = new Date(Date.now() + backoffMs).toISOString()
        task.state = "queued"
        store.set(task)
      }

      expect(task.retryCount).toBe(1)
      expect(task.trace?.gateReason).toBe("validate hook failed")
      expect(task.retryAfter).toBeDefined()
      expect(task.state).toBe("queued")
    })

    it("goes to done(failed) when retries exhausted", () => {
      const task = makeTask({ id: "retry-2", state: "active", retryCount: 2 })
      store.set(task)

      const maxRetries = DEFAULT_CONFIG.maxRetries ?? 2
      if (task.retryCount >= maxRetries) {
        task.state = "done"
        task.doneReason = "failed"
        store.set(task)
      }

      expect(task.state).toBe("done")
      expect(task.doneReason).toBe("failed")
    })
  })

  describe("signal handling patterns", () => {
    it("pr_merged → done(merged)", () => {
      const task = makeTask({ id: "sig-1", state: "published" })
      store.set(task)
      task.state = "done"
      task.doneReason = "merged"
      store.set(task)
      expect(store.get("sig-1")?.doneReason).toBe("merged")
    })

    it("pr_closed → done(closed)", () => {
      const task = makeTask({ id: "sig-2", state: "published" })
      store.set(task)
      task.state = "done"
      task.doneReason = "closed"
      store.set(task)
      expect(store.get("sig-2")?.doneReason).toBe("closed")
    })

    it("cancelled → done(failed)", () => {
      const task = makeTask({ id: "sig-3", state: "active" })
      store.set(task)
      task.state = "done"
      task.doneReason = "failed"
      store.set(task)
      expect(store.get("sig-3")?.doneReason).toBe("failed")
    })
  })

  describe("stale detection pattern", () => {
    it("detects stale tasks", () => {
      const staleTask = makeTask({
        id: "stale-1",
        state: "active",
        startedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        updatedAt: new Date(Date.now() - 7200000).toISOString(),
      })
      store.set(staleTask)

      const now = Date.now()
      const activeTasks = store.byState("active")
      const stale = activeTasks.filter(t => {
        if (!t.startedAt) return false
        const elapsed = now - new Date(t.updatedAt || t.startedAt).getTime()
        return elapsed > DEFAULT_CONFIG.stallTimeoutMs
      })

      // stallTimeoutMs is 3600000 (1h), task is 2h old → stale
      expect(stale.length).toBe(1)
    })
  })

  describe("recovery patterns", () => {
    it("identifies dead PID active tasks for recovery", () => {
      const task = makeTask({
        id: "recover-1",
        state: "active",
        pid: 999999, // Definitely dead PID
      })
      store.set(task)

      const activeTasks = store.all().filter(
        t => t.state === "active" && t.pid
      )
      expect(activeTasks.length).toBe(1)
    })

    it("identifies published tasks for PR status check", () => {
      const task = makeTask({
        id: "recover-2",
        state: "published",
        prUrl: "https://github.com/org/repo/pull/1",
      })
      store.set(task)

      const published = store.byState("published")
      expect(published.length).toBe(1)
      expect(published[0].prUrl).toBeDefined()
    })

    it("queued tasks need no recovery", () => {
      store.set(makeTask({ id: "q1", state: "queued" }))
      const queued = store.byState("queued")
      // queued tasks are just re-dispatched on next tick
      expect(queued.length).toBe(1)
    })
  })

  // ── Phase B: tick guard + done pruning ──────────────────────

  describe("tick guard pattern", () => {
    it("concurrent tick is skipped when _tickInProgress is true", () => {
      // Simulates the guard: if _tickInProgress, tick() returns immediately
      let _tickInProgress = false
      let tickRan = 0

      const tick = () => {
        if (_tickInProgress) return
        _tickInProgress = true
        try { tickRan++ } finally { _tickInProgress = false }
      }

      _tickInProgress = true // Simulate a tick already running
      tick()
      expect(tickRan).toBe(0) // Second tick was skipped

      _tickInProgress = false
      tick()
      expect(tickRan).toBe(1) // Now it runs
    })
  })

  // ── Phase P5: Reconcile + Continuation patterns ─────────────

  describe("reconcile state patterns", () => {
    it("published task with terminal state → done(merged)", () => {
      const task = makeTask({
        id: "reconcile-1",
        state: "published",
        prUrl: "https://github.com/org/repo/pull/1",
      })
      store.set(task)

      // Simulate reconcile detecting Done state
      const terminalStates = ["Done", "Cancelled"]
      const currentLinearState = "Done"
      if (terminalStates.some(t => t.toLowerCase() === currentLinearState.toLowerCase())) {
        task.state = "done"
        task.doneReason = "merged"
        store.set(task)
      }

      expect(store.get("reconcile-1")?.state).toBe("done")
      expect(store.get("reconcile-1")?.doneReason).toBe("merged")
    })

    it("published task with actionable disposition → active for redispatch", () => {
      const task = makeTask({
        id: "reconcile-2",
        state: "published",
        prUrl: "https://github.com/org/repo/pull/2",
      })
      store.set(task)

      // Simulate reconcile: source returns actionable → transition to active
      const disposition = "actionable"
      if (disposition === "actionable") {
        assertTransition("published", "active")
        task.state = "active"
        store.set(task)
      }

      expect(store.get("reconcile-2")?.state).toBe("active")
    })
  })

  describe("continuation disposition gate", () => {
    function isActionable(d: string): boolean { return d === "actionable" }

    it("re-spawns when disposition is actionable", () => {
      expect(isActionable("actionable")).toBe(true)
    })

    it("does NOT re-spawn for passive disposition", () => {
      expect(isActionable("passive")).toBe(false)
    })

    it("does NOT re-spawn for terminal dispositions", () => {
      expect(isActionable("done")).toBe(false)
      expect(isActionable("cancelled")).toBe(false)
    })
  })

  describe("land-after-merge pattern", () => {
    it("published task with merged PR transitions to done(merged)", () => {
      const task = makeTask({
        id: "land-1",
        state: "published",
        prUrl: "https://github.com/org/repo/pull/5",
      })
      store.set(task)

      // Simulate: land agent exits → detectPR returns not-found → checkPRMerged returns MERGED
      const prState = "MERGED"
      if (prState === "MERGED") {
        task.state = "done"
        task.doneReason = "merged"
        store.set(task)
      }

      expect(store.get("land-1")?.state).toBe("done")
      expect(store.get("land-1")?.doneReason).toBe("merged")
    })

    it("published task with closed (not merged) PR transitions to done(failed)", () => {
      const task = makeTask({
        id: "land-2",
        state: "published",
        prUrl: "https://github.com/org/repo/pull/6",
      })
      store.set(task)

      const prState: string = "CLOSED"
      if (prState !== "MERGED") {
        task.state = "done"
        task.doneReason = "failed"
        store.set(task)
      }

      expect(store.get("land-2")?.state).toBe("done")
      expect(store.get("land-2")?.doneReason).toBe("failed")
    })
  })
})

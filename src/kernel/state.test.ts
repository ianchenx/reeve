// state.test.ts — StateStore save/load roundtrip tests
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { StateStore } from "./state"
import type { Task } from "./types"

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test-id-1",
    identifier: "WOR-1",
    title: "Test task",
    description: "A test task",
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

describe("StateStore", () => {
  let dir: string
  let store: StateStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "state-test-"))
    store = new StateStore(join(dir, "state.json"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns 0 for empty/missing file", () => {
    expect(store.load()).toBe(0)
    expect(store.size).toBe(0)
  })

  it("save + load roundtrip", () => {
    const t1 = makeTask({ id: "a", identifier: "WOR-1" })
    const t2 = makeTask({ id: "b", identifier: "WOR-2", state: "active" })
    store.set(t1)
    store.set(t2)
    store.save()

    const store2 = new StateStore(join(dir, "state.json"))
    expect(store2.load()).toBe(2)
    expect(store2.get("a")?.identifier).toBe("WOR-1")
    expect(store2.get("b")?.state).toBe("active")
  })

  it("get / getByIdentifier", () => {
    const t = makeTask({ id: "x", identifier: "WOR-99" })
    store.set(t)
    expect(store.get("x")?.identifier).toBe("WOR-99")
    expect(store.getByIdentifier("WOR-99")?.id).toBe("x")
    expect(store.getByIdentifier("NOPE")).toBeUndefined()
  })

  it("delete", () => {
    const t = makeTask({ id: "del" })
    store.set(t)
    expect(store.size).toBe(1)
    store.delete("del")
    expect(store.size).toBe(0)
    expect(store.get("del")).toBeUndefined()
  })

  it("byState filters correctly", () => {
    store.set(makeTask({ id: "a", state: "queued" }))
    store.set(makeTask({ id: "b", state: "active" }))
    store.set(makeTask({ id: "c", state: "queued" }))
    store.set(makeTask({ id: "d", state: "done" }))

    expect(store.byState("queued").length).toBe(2)
    expect(store.byState("active").length).toBe(1)
    expect(store.byState("done").length).toBe(1)
    expect(store.byState("published").length).toBe(0)
  })

  it("all returns all tasks", () => {
    store.set(makeTask({ id: "a" }))
    store.set(makeTask({ id: "b" }))
    expect(store.all().length).toBe(2)
  })

  it("survives corrupt file gracefully", () => {
    const path = join(dir, "bad.json")
    Bun.write(path, "NOT JSON {{{")
    const badStore = new StateStore(path)
    expect(badStore.load()).toBe(0)
  })

  // ── Phase A: backup, case-insensitive ──────────

  it("recovers from .bak when primary is corrupt", () => {
    const t = makeTask({ id: "bak-1", identifier: "WOR-10" })
    store.set(t)
    store.save() // creates state.json + state.json.bak on next save

    // Save again so .bak has valid data
    store.set(makeTask({ id: "bak-2", identifier: "WOR-11" }))
    store.save() // .bak now has bak-1, primary has bak-1 + bak-2

    // Corrupt primary
    const path = join(dir, "state.json")
    Bun.write(path, "CORRUPT{{{")

    const recovered = new StateStore(path)
    const count = recovered.load()
    // Should recover from .bak (which has the previous save's data)
    expect(count).toBeGreaterThan(0)
    expect(recovered.get("bak-1")).toBeDefined()
  })

  it("getByIdentifier is case-insensitive", () => {
    const t = makeTask({ id: "case-1", identifier: "WOR-42" })
    store.set(t)
    expect(store.getByIdentifier("wor-42")?.id).toBe("case-1")
    expect(store.getByIdentifier("WOR-42")?.id).toBe("case-1")
    expect(store.getByIdentifier("Wor-42")?.id).toBe("case-1")
  })

  it("loads declared runtime-only task fields from disk", () => {
    Bun.write(join(dir, "state.json"), JSON.stringify({
      version: 1,
      tasks: [
        {
          ...makeTask({ id: "rich-1", identifier: "WOR-50" }),
          taskDir: "/tmp/tasks/wor-50",
          stage: "implement",
          usage: {
            input: 1,
            output: 2,
            total: 3,
            cacheRead: 6,
            contextUsed: 4,
            contextSize: 5,
          },
        },
      ],
    }))

    expect(store.load()).toBe(1)
    expect(store.get("rich-1")?.taskDir).toBe("/tmp/tasks/wor-50")
    expect(store.get("rich-1")?.stage).toBe("implement")
    expect(store.get("rich-1")?.usage).toEqual({
      input: 1,
      output: 2,
      total: 3,
      cacheRead: 6,
      contextUsed: 4,
      contextSize: 5,
    })
  })

  it("rejects undeclared task fields from disk", () => {
    Bun.write(join(dir, "state.json"), JSON.stringify({
      version: 1,
      tasks: [
        {
          ...makeTask({ id: "strict-1", identifier: "WOR-51" }),
          unexpectedField: true,
        },
      ],
    }))

    expect(store.load()).toBe(0)
    expect(store.size).toBe(0)
  })
})

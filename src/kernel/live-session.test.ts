import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"

import { cleanupTestTmp, testTmpDir } from "../test-helpers"
import { readLiveSessionEvents, resolveLiveSessionPaths } from "./live-session"

afterEach((): void => {
  cleanupTestTmp()
})

describe("dashboard live session helpers", () => {
  test("returns only session paths that exist on disk", () => {
    const tasksDir = testTmpDir("live-session-paths-")

    // No files created — task dir doesn't exist, so result is empty
    expect(resolveLiveSessionPaths("WOR-83", tasksDir)).toEqual([])

    // Create one agent session; only that path should be returned
    const sessionPath = join(tasksDir, "wor-83", "implement", "session.ndjson")
    mkdirSync(dirname(sessionPath), { recursive: true })
    writeFileSync(sessionPath, "")
    expect(resolveLiveSessionPaths("WOR-83", tasksDir)).toEqual([sessionPath])
  })

  test("reads the implement session log for an identifier", () => {
    const tasksDir = testTmpDir("live-session-read-implement-")
    const sessionPath = join(tasksDir, "wor-83", "implement", "session.ndjson")
    mkdirSync(dirname(sessionPath), { recursive: true })
    writeFileSync(sessionPath, '{"method":"session/update"}\n{"_type":"exit","code":0}\n')

    expect(readLiveSessionEvents("WOR-83", { tasksDir })).toEqual([
      { method: "session/update" },
      { _type: "exit", code: 0 },
    ])
  })

  test("returns events from all agent session files merged", () => {
    const tasksDir = testTmpDir("live-session-read-all-")
    const implPath = join(tasksDir, "wor-83", "implement", "session.ndjson")
    const reviewPath = join(tasksDir, "wor-83", "review", "session.ndjson")
    mkdirSync(dirname(implPath), { recursive: true })
    mkdirSync(dirname(reviewPath), { recursive: true })
    writeFileSync(implPath, '{"method":"session/update"}\n')
    writeFileSync(reviewPath, '{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call"}}}\n')

    const events = readLiveSessionEvents("WOR-83", { tasksDir })
    expect(events).toHaveLength(2)
    expect(events).toContainEqual({ method: "session/update" })
    expect(events).toContainEqual({ method: "session/update", params: { update: { sessionUpdate: "tool_call" } } })
  })

  test("returns an empty list when the identifier sanitizes to nothing", () => {
    const tasksDir = testTmpDir("live-session-invalid-")
    expect(readLiveSessionEvents("!!!", { tasksDir })).toEqual([])
  })
})

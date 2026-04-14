import { describe, expect, test } from "bun:test"

import { isPathWithinRoot, sanitizeTaskIdentifier, TASKS_DIR, taskDir, taskLogDir } from "./paths"
import { resolve } from "path"

describe("paths safety helpers", () => {
  test("sanitizes task identifiers before building task directories", () => {
    expect(sanitizeTaskIdentifier("WOR-25")).toBe("wor-25")
    expect(sanitizeTaskIdentifier("../../Danger Zone")).toBe("danger-zone")
    expect(sanitizeTaskIdentifier("___")).toBe("")
  })

  test("taskDir resolves under tasks/", () => {
    const dir = taskDir("WOR-25")
    expect(dir).toBe(resolve(TASKS_DIR, "wor-25"))
  })

  test("keeps task log paths inside tasks/{id}/{agentName}", () => {
    const logDir = taskLogDir("../../etc/passwd")
    expect(logDir).toBe(resolve(TASKS_DIR, "etc-passwd", "implement"))
  })

  test("detects when a candidate path escapes the root", () => {
    expect(isPathWithinRoot("/tmp/root", "/tmp/root/task")).toBe(true)
    expect(isPathWithinRoot("/tmp/root", "/tmp/root/nested/task")).toBe(true)
    expect(isPathWithinRoot("/tmp/root", "/tmp/other/task")).toBe(false)
    expect(isPathWithinRoot("/tmp/root", "/tmp/root/../other/task")).toBe(false)
  })
})

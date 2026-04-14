import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { testTmpDir, cleanupTestTmp } from "./test-helpers"
import { writeJsonFileAtomic } from "./persistence"

afterEach((): void => {
  cleanupTestTmp()
})

describe("persistence", () => {
  test("writeJsonFileAtomic creates file with JSON content", (): void => {
    const dir = testTmpDir("reeve-persistence-")
    const path = join(dir, "test.json")

    writeJsonFileAtomic(path, { foo: "bar", num: 42 })

    expect(existsSync(path)).toBe(true)
    const raw = JSON.parse(readFileSync(path, "utf-8"))
    expect(raw).toEqual({ foo: "bar", num: 42 })
  })

  test("writeJsonFileAtomic creates parent directories", (): void => {
    const dir = testTmpDir("reeve-persistence-")
    const path = join(dir, "nested", "deep", "test.json")

    writeJsonFileAtomic(path, { ok: true })

    expect(existsSync(path)).toBe(true)
  })
})

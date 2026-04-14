import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { resolve } from "path"
import { readUpdateCache, isUpdateCheckDisabled, hasNewerVersion, getCurrentVersion, isCacheStale } from "./update-check"

const TEST_DIR = resolve(process.cwd(), ".test-tmp", `update-check-${Date.now()}`)
const ORIGINAL_REEVE_DIR = process.env.REEVE_DIR

beforeEach(() => {
  process.env.REEVE_DIR = TEST_DIR
  mkdirSync(TEST_DIR, { recursive: true })
  delete process.env.REEVE_NO_UPDATE_CHECK
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  if (ORIGINAL_REEVE_DIR !== undefined) {
    process.env.REEVE_DIR = ORIGINAL_REEVE_DIR
  } else {
    delete process.env.REEVE_DIR
  }
  delete process.env.REEVE_NO_UPDATE_CHECK
})

describe("readUpdateCache", () => {
  it("returns null when file does not exist", () => {
    expect(readUpdateCache()).toBeNull()
  })

  it("returns null when file contains invalid JSON", () => {
    const cachePath = resolve(TEST_DIR, "update-check.json")
    writeFileSync(cachePath, "not json")
    expect(readUpdateCache()).toBeNull()
  })

  it("reads valid cache", () => {
    const cachePath = resolve(TEST_DIR, "update-check.json")
    const cache = {
      lastCheck: "2026-04-13T00:00:00Z",
      latest: "0.2.0",
      current: "0.1.0",
    }
    writeFileSync(cachePath, JSON.stringify(cache))
    const result = readUpdateCache()
    expect(result).toEqual(cache)
  })
})

describe("isUpdateCheckDisabled", () => {
  it("returns false by default", () => {
    expect(isUpdateCheckDisabled()).toBe(false)
  })

  it("returns true when REEVE_NO_UPDATE_CHECK is set", () => {
    process.env.REEVE_NO_UPDATE_CHECK = "1"
    expect(isUpdateCheckDisabled()).toBe(true)
  })
})

describe("hasNewerVersion", () => {
  it("detects newer major", () => {
    expect(hasNewerVersion("0.1.0", "1.0.0")).toBe(true)
  })

  it("detects newer minor", () => {
    expect(hasNewerVersion("0.1.0", "0.2.0")).toBe(true)
  })

  it("detects newer patch", () => {
    expect(hasNewerVersion("0.1.0", "0.1.1")).toBe(true)
  })

  it("returns false when same", () => {
    expect(hasNewerVersion("0.1.0", "0.1.0")).toBe(false)
  })

  it("returns false when older", () => {
    expect(hasNewerVersion("0.2.0", "0.1.0")).toBe(false)
  })

  it("handles pre-release tags", () => {
    expect(hasNewerVersion("0.1.0-beta.1", "0.1.0")).toBe(true)
  })
})

describe("getCurrentVersion", () => {
  it("returns a semver string from package.json", () => {
    const v = getCurrentVersion()
    expect(v).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe("isCacheStale", () => {
  it("returns true when cache does not exist", () => {
    expect(isCacheStale()).toBe(true)
  })

  it("returns false when cache is fresh", () => {
    const cachePath = resolve(TEST_DIR, "update-check.json")
    writeFileSync(cachePath, JSON.stringify({
      lastCheck: new Date().toISOString(),
      latest: "0.2.0",
      current: "0.1.0",
    }))
    expect(isCacheStale()).toBe(false)
  })

  it("returns true when cache is older than 24h", () => {
    const cachePath = resolve(TEST_DIR, "update-check.json")
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    writeFileSync(cachePath, JSON.stringify({
      lastCheck: old,
      latest: "0.2.0",
      current: "0.1.0",
    }))
    expect(isCacheStale()).toBe(true)
  })
})

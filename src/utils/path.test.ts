import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { spawnPath } from "./path"

describe("spawnPath", () => {
  let originalPath: string | undefined

  beforeEach(() => {
    originalPath = process.env.PATH
  })

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
  })

  test("appends fallback dirs to existing PATH", () => {
    process.env.PATH = "/foo:/bar"
    expect(spawnPath()).toBe("/foo:/bar:/usr/local/bin:/opt/homebrew/bin")
  })

  test("returns just fallback dirs when PATH is undefined", () => {
    delete process.env.PATH
    expect(spawnPath()).toBe("/usr/local/bin:/opt/homebrew/bin")
  })

  test("returns just fallback dirs when PATH is empty string", () => {
    process.env.PATH = ""
    expect(spawnPath()).toBe("/usr/local/bin:/opt/homebrew/bin")
  })

  test("strips empty segments to avoid POSIX cwd interpretation", () => {
    process.env.PATH = "/foo::/bar:"
    expect(spawnPath()).toBe("/foo:/bar:/usr/local/bin:/opt/homebrew/bin")
  })

  test("strips leading colon (would otherwise mean cwd)", () => {
    process.env.PATH = ":/foo"
    expect(spawnPath()).toBe("/foo:/usr/local/bin:/opt/homebrew/bin")
  })
})

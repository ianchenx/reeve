import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { readVerdict } from "./review"

// ── Verdict reader tests ──────────────────────────────────────

describe("readVerdict", () => {
  test("reads pass verdict from file", () => {
    const dir = mkdtempSync(join(tmpdir(), "reeve-verdict-"))
    try {
      mkdirSync(join(dir, ".reeve"), { recursive: true })
      writeFileSync(join(dir, ".reeve", "review-verdict.json"), '{"verdict":"pass"}')

      expect(readVerdict(dir, 0)).toBe("pass")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("reads fail verdict from file", () => {
    const dir = mkdtempSync(join(tmpdir(), "reeve-verdict-"))
    try {
      mkdirSync(join(dir, ".reeve"), { recursive: true })
      writeFileSync(join(dir, ".reeve", "review-verdict.json"), '{"verdict":"fail"}')

      expect(readVerdict(dir, 0)).toBe("fail")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("returns error for malformed verdict file", () => {
    const dir = mkdtempSync(join(tmpdir(), "reeve-verdict-"))
    try {
      mkdirSync(join(dir, ".reeve"), { recursive: true })
      writeFileSync(join(dir, ".reeve", "review-verdict.json"), "not json")

      expect(readVerdict(dir, 0)).toBe("error")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("assumes pass when no verdict file and exit code 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "reeve-verdict-"))
    try {
      expect(readVerdict(dir, 0)).toBe("pass")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("returns error when no verdict file and non-zero exit", () => {
    const dir = mkdtempSync(join(tmpdir(), "reeve-verdict-"))
    try {
      expect(readVerdict(dir, 1)).toBe("error")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

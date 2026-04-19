import { describe, expect, test } from "bun:test"

import { trySpawnSync } from "./spawn"

function makeErrnoException(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException
  err.code = code
  return err
}

describe("trySpawnSync", () => {
  test("returns ok with exitCode 0 for a successful command", () => {
    const result = trySpawnSync(["echo", "hello"], { stdout: "pipe", stderr: "pipe" })
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.exitCode).toBe(0)
      expect(result.stdout?.toString()).toContain("hello")
    }
  })

  test("returns ok with non-zero exitCode when the command exits non-zero", () => {
    const result = trySpawnSync(["sh", "-c", "exit 3"], { stdout: "pipe", stderr: "pipe" })
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.exitCode).toBe(3)
    }
  })

  test("returns not-installed when Bun.spawnSync throws ENOENT", () => {
    const spawn = (() => {
      throw makeErrnoException("ENOENT", "posix_spawn 'no-such-bin'")
    }) as typeof Bun.spawnSync

    const result = trySpawnSync(["no-such-bin", "--flag"], undefined, spawn)

    expect(result.kind).toBe("not-installed")
    if (result.kind === "not-installed") {
      expect(result.cmd).toBe("no-such-bin")
    }
  })

  test("returns an error kind for non-ENOENT spawn failures", () => {
    const underlying = makeErrnoException("EACCES", "permission denied")
    const spawn = (() => {
      throw underlying
    }) as typeof Bun.spawnSync

    const result = trySpawnSync(["some-cmd"], undefined, spawn)

    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.cmd).toBe("some-cmd")
      expect(result.error).toBe(underlying)
    }
  })
})

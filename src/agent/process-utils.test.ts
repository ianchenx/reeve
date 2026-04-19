import { describe, expect, test } from "bun:test"

import { findChildPids } from "./process-utils"

function makeSpawnStub(
  entry: { exitCode: number; stdout?: string; stderr?: string },
): typeof Bun.spawnSync {
  return (() => ({
    exitCode: entry.exitCode,
    stdout: Buffer.from(entry.stdout ?? ""),
    stderr: Buffer.from(entry.stderr ?? ""),
    pid: 1,
    signal: null,
    success: entry.exitCode === 0,
  } as unknown as ReturnType<typeof Bun.spawnSync>)) as typeof Bun.spawnSync
}

describe("findChildPids", () => {
  test("parses pgrep output into numeric child pids", () => {
    const execSync = makeSpawnStub({ exitCode: 0, stdout: "123\n456\n789\n" })
    expect(findChildPids(1, execSync)).toEqual([123, 456, 789])
  })

  test("returns empty array when pgrep finds no children (exit 1)", () => {
    const execSync = makeSpawnStub({ exitCode: 1, stdout: "" })
    expect(findChildPids(1, execSync)).toEqual([])
  })

  test("returns empty array when pgrep is not installed (ENOENT)", () => {
    const execSync = (() => {
      const err = new Error("posix_spawn 'pgrep'") as NodeJS.ErrnoException
      err.code = "ENOENT"
      throw err
    }) as typeof Bun.spawnSync

    expect(findChildPids(1, execSync)).toEqual([])
  })

  test("filters zeros produced by blank lines", () => {
    const execSync = makeSpawnStub({ exitCode: 0, stdout: "100\n\n200\n" })
    expect(findChildPids(1, execSync)).toEqual([100, 200])
  })
})

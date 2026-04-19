import { describe, it, expect, test } from "bun:test"
import { cac } from "cac"
import { detectDefaultBranch, registerProjectCommands } from "./projects"

describe("registerProjectCommands", () => {
  it("registers exactly the expected project subcommands", () => {
    const cli = cac("reeve")
    registerProjectCommands(cli)

    // c.name strips angle/square args; c.rawName preserves the full signature (e.g. "project add <repo>")
    const rawNames = cli.commands.map((c) => c.rawName).sort()
    expect(rawNames).toContain("project add <repo>")
    expect(rawNames).toContain("project edit <slug>")
    expect(rawNames).toContain("project remove <slug>")
  })

  it("does not register legacy top-level project aliases", () => {
    const cli = cac("reeve")
    registerProjectCommands(cli)

    const rawNames = cli.commands.map((c) => c.rawName)
    expect(rawNames).not.toContain("import <repo>")
    expect(rawNames).not.toContain("remove <slug>")
    expect(rawNames).not.toContain("edit <slug>")
    expect(rawNames).not.toContain("repos")
  })
})

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

describe("detectDefaultBranch", () => {
  test("returns the branch when gh api succeeds", () => {
    const result = detectDefaultBranch("owner/repo", makeSpawnStub({ exitCode: 0, stdout: "main\n" }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.branch).toBe("main")
  })

  test("returns not-installed when gh is missing (ENOENT)", () => {
    const execSync = (() => {
      const err = new Error("posix_spawn 'gh'") as NodeJS.ErrnoException
      err.code = "ENOENT"
      throw err
    }) as typeof Bun.spawnSync

    const result = detectDefaultBranch("owner/repo", execSync)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("not-installed")
  })

  test("returns auth failure when gh exits non-zero", () => {
    const result = detectDefaultBranch(
      "owner/repo",
      makeSpawnStub({ exitCode: 4, stderr: "HTTP 401" }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("auth")
      expect(result.detail).toContain("HTTP 401")
    }
  })

  test("returns auth failure when gh exits zero with empty stdout", () => {
    const result = detectDefaultBranch("owner/repo", makeSpawnStub({ exitCode: 0, stdout: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("auth")
  })
})

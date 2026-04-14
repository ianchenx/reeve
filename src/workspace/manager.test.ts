import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "fs"
import { basename, join, resolve } from "path"

import { WorkspaceManager } from "./manager"
import { cleanupTestTmp, testTmpDir } from "../test-helpers"

const decoder = new TextDecoder()

/** Isolated tasks dir — lives under .test-tmp, cleaned automatically */
const TEST_TASKS_DIR = testTmpDir("reeve-tasks-")

function runGit(cwd: string, args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const stdout = decoder.decode(proc.stdout).trim()
  const stderr = decoder.decode(proc.stderr).trim()

  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${proc.exitCode}): ${stderr || stdout}`)
  }

  return stdout
}

function createRepo(prefix: string): string {
  const repoDir = testTmpDir(prefix)
  runGit(repoDir, ["init", "-b", "main"])
  runGit(repoDir, ["config", "user.name", "Reeve Test"])
  runGit(repoDir, ["config", "user.email", "reeve@example.com"])
  writeFileSync(join(repoDir, "README.md"), "seed\n")
  runGit(repoDir, ["add", "README.md"])
  runGit(repoDir, ["commit", "-m", "chore: initial"])
  return repoDir
}

afterAll((): void => {
  cleanupTestTmp()
})

function createRepoWithOrigin(prefix: string): string {
  const bareDir = testTmpDir(`${prefix}bare-`)
  runGit(bareDir, ["init", "--bare", "-b", "main"])

  const workingDir = testTmpDir(`${prefix}working-`)
  Bun.spawnSync(["git", "clone", bareDir, workingDir], { stdout: "pipe", stderr: "pipe" })
  runGit(workingDir, ["config", "user.name", "Reeve Test"])
  runGit(workingDir, ["config", "user.email", "reeve@example.com"])
  writeFileSync(join(workingDir, "README.md"), "seed\n")
  runGit(workingDir, ["add", "README.md"])
  runGit(workingDir, ["commit", "-m", "chore: initial"])
  runGit(workingDir, ["push", "origin", "main"])

  return workingDir
}

function createManager(): WorkspaceManager {
  return new WorkspaceManager(TEST_TASKS_DIR)
}

describe("WorkspaceManager git failure handling", () => {
  test("fetchLatest: throws on git fetch failure", async (): Promise<void> => {
    const repoDir = createRepo("reeve-workspace-fetch-")
    const manager = createManager()

    await expect(manager.fetchLatest(repoDir)).rejects.toThrow("git fetch origin")
  })

  test("createForTask: throws on worktree add failure", async (): Promise<void> => {
    const repoDir = createRepo("reeve-workspace-create-")
    const manager = createManager()

    // No origin/main, so worktree add origin/main will fail
    await expect(manager.createForTask("WOR-101", repoDir)).rejects.toThrow("git worktree add")
  })

  test("removeForTask: throws on worktree remove failure", async (): Promise<void> => {
    const repoDir = createRepo("reeve-workspace-remove-")
    const manager = createManager()
    const repoName = basename(repoDir)

    // Create a fake worktree dir under tasksDir so removeForTask tries git worktree remove
    const fakeTaskRoot = resolve(TEST_TASKS_DIR, "wor-102")
    const fakeCodeDir = resolve(fakeTaskRoot, repoName)
    mkdirSync(fakeCodeDir, { recursive: true })
    expect(existsSync(fakeCodeDir)).toBe(true)

    // Not a git worktree path, so git worktree remove will fail; should throw, not swallow
    await expect(manager.removeForTask("WOR-102", repoDir)).rejects.toThrow("git worktree remove --force")
  })
})

describe("WorkspaceManager per-task layout", () => {
  test("createForTask: creates task dir with implement agent dir and repo-named worktree", async (): Promise<void> => {
    const repoDir = createRepoWithOrigin("reeve-task-create-")
    const manager = createManager()
    const repoName = basename(repoDir)

    const info = await manager.createForTask("WOR-201", repoDir, "main")

    // Structural checks
    expect(info.created).toBe(true)
    expect(info.taskDir).toContain("wor-201")
    expect(info.workDir).toBe(resolve(info.taskDir, "implement"))
    expect(info.worktreeDir).toBe(resolve(info.taskDir, repoName))

    // Implement dir has CLAUDE.md
    expect(existsSync(resolve(info.workDir, "CLAUDE.md"))).toBe(true)
    expect(existsSync(resolve(info.workDir, "AGENTS.md"))).toBe(true)

    // Implement dir has skills
    expect(existsSync(resolve(info.workDir, ".claude", "skills"))).toBe(true)

    // Implement dir has symlink to repo
    const repoLink = resolve(info.workDir, repoName)
    expect(existsSync(repoLink)).toBe(true)
    expect(lstatSync(repoLink).isSymbolicLink()).toBe(true)

    // Git worktree is at {taskDir}/{repo}/
    expect(existsSync(resolve(info.worktreeDir, ".git"))).toBe(true)
    expect(existsSync(resolve(info.worktreeDir, "README.md"))).toBe(true)
  })

  test("createForTask reuse=true: returns created=false and refreshes context", async (): Promise<void> => {
    const repoDir = createRepoWithOrigin("reeve-task-reuse-")
    const manager = createManager()

    const first = await manager.createForTask("WOR-202", repoDir, "main")
    expect(first.created).toBe(true)

    const second = await manager.createForTask("WOR-202", repoDir, "main", true)
    expect(second.created).toBe(false)
    expect(second.workDir).toBe(first.workDir)
    expect(second.taskDir).toBe(first.taskDir)

    // CLAUDE.md still present after reuse
    expect(existsSync(resolve(second.workDir, "CLAUDE.md"))).toBe(true)

    // Symlink still present after reuse
    const repoName = basename(repoDir)
    const repoLink = resolve(second.workDir, repoName)
    expect(existsSync(repoLink)).toBe(true)
    expect(lstatSync(repoLink).isSymbolicLink()).toBe(true)
  })

  test("cleanWorktreeOnly: removes worktree but preserves agent dirs", async (): Promise<void> => {
    const repoDir = createRepoWithOrigin("reeve-clean-wt-")
    const manager = createManager()
    const repoName = basename(repoDir)

    const info = await manager.createForTask("WOR-301", repoDir, "main")

    // Verify worktree exists
    expect(existsSync(info.worktreeDir)).toBe(true)
    expect(existsSync(resolve(info.workDir, "CLAUDE.md"))).toBe(true)

    await manager.cleanWorktreeOnly("WOR-301", repoDir)

    // Worktree gone
    expect(existsSync(info.worktreeDir)).toBe(false)

    // Agent dir (implement/) still exists with context files
    expect(existsSync(info.workDir)).toBe(true)
    expect(existsSync(resolve(info.workDir, "CLAUDE.md"))).toBe(true)

    // Dangling symlink removed
    expect(existsSync(resolve(info.workDir, repoName))).toBe(false)

    // Branch gone
    const branchList = runGit(repoDir, ["branch", "--list", "agent/wor-301"])
    expect(branchList.trim()).toBe("")
  })

  test("removeForTask: removes entire task directory and branch", async (): Promise<void> => {
    const repoDir = createRepoWithOrigin("reeve-task-remove-")
    const manager = createManager()

    const info = await manager.createForTask("WOR-203", repoDir, "main")
    expect(existsSync(info.taskDir)).toBe(true)
    expect(existsSync(info.workDir)).toBe(true)

    await manager.removeForTask("WOR-203", repoDir)

    // Task dir gone
    expect(existsSync(info.taskDir)).toBe(false)

    // Branch gone
    const branchList = runGit(repoDir, ["branch", "--list", "agent/wor-203"])
    expect(branchList.trim()).toBe("")
  })
})

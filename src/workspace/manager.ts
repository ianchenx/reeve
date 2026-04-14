// workspace/manager.ts — Git worktree lifecycle management
// Multi-repo: accepts repoDir per operation instead of binding to a single project.
//
// Per-task directory layout:
//   ~/.reeve/tasks/{id}/              ← task dir (task.taskDir)
//   ~/.reeve/tasks/{id}/{repo}/       ← git worktree (shared)
//   ~/.reeve/tasks/{id}/implement/    ← implement agent CWD (task.workDir)
//     CLAUDE.md, .claude/skills/
//     {repo} → ../{repo}             ← symlink to shared worktree

import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync } from "fs"
import { basename, resolve, sep } from "path"
import { sanitizeTaskIdentifier, TASKS_DIR } from "../paths"
import { setupAgentContext, buildAgentRules } from "./context-injector"


export interface WorkspaceInfo {
  identifier: string         // e.g., "PRJ-42"
  branch: string
  taskDir: string            // ~/.reeve/tasks/{id}/
  workDir: string            // implement agent CWD: {taskDir}/implement/
  worktreeDir: string        // git worktree: {taskDir}/{repo}/
  created: boolean
}

export interface ManagedWorktreeInfo {
  identifier: string
  branch: string
  repoDir: string
  worktreeDir: string
}

interface GitCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export class WorkspaceManager {
  private tasksDir: string

  constructor(tasksDir = TASKS_DIR) {
    this.tasksDir = tasksDir
    mkdirSync(this.tasksDir, { recursive: true })
  }

  private resolveTaskDir(identifier: string): string {
    return resolve(this.tasksDir, sanitizeTaskIdentifier(identifier))
  }

  /**
   * Fetch latest from origin for a specific repo.
   */
  async fetchLatest(repoDir: string): Promise<void> {
    ;(console.info as (...args: unknown[]) => void)({ repoDir }, "Fetching latest from origin")
    await this.execInOrThrow(repoDir, ["git", "fetch", "origin"])
  }

  /**
   * Fetch latest from origin for multiple repos in parallel.
   */
  async fetchLatestAll(repoDirs: string[]): Promise<void> {
    const unique = [...new Set(repoDirs)]
    await Promise.all(unique.map(dir => this.fetchLatest(dir)))
  }

  /**
   * Create an isolated worktree for a task inside a wrapper directory.
   *
   * Layout:
   *   {root}/{sanitized}/           ← wrapper dir (agent CWD)
   *   {root}/{sanitized}/CLAUDE.md  ← Reeve identity (persistent context)
   *   {root}/{sanitized}/.claude/   ← skills (symlinked from bundled)
   *   {root}/{sanitized}/{repo}/    ← git worktree (user code)
   *
   * If reuse=true and the code dir already exists as a valid worktree,
   * return it as-is (preserves partial work from prior dispatch).
   * Otherwise, always creates fresh — removes stale worktree/branch if they exist.
   */
  async createForTask(identifier: string, repoDir: string, baseBranch = "main", reuse = false): Promise<WorkspaceInfo> {
    const sanitized = sanitizeTaskIdentifier(identifier)
    const branch = `agent/${sanitized}`
    const repoName = basename(repoDir)
    const taskRoot = this.resolveTaskDir(identifier)       // ~/.reeve/tasks/{id}/
    const worktreeDir = resolve(taskRoot, repoName)       // {taskRoot}/{repo}/
    const implementDir = resolve(taskRoot, "implement")   // {taskRoot}/implement/

    // Reuse existing worktree if requested (retry/continuation path)
    if (reuse && existsSync(worktreeDir)) {
      ;(console.info as (...args: unknown[]) => void)({ taskRoot, worktreeDir }, "Reusing existing worktree")
      // Clean slate for retry/continuation
      await this.execInOrThrow(worktreeDir, ["git", "reset", "--hard"])
      await this.execInOrThrow(worktreeDir, ["git", "clean", "-fd"])
      setupAgentContext(implementDir, repoName, buildAgentRules(repoName))
      const repoLink = resolve(implementDir, repoName)
      try { lstatSync(repoLink) } catch { symlinkSync(worktreeDir, repoLink) }
      return {
        identifier,
        branch,
        taskDir: taskRoot,
        workDir: implementDir,
        worktreeDir,
        created: false,
      }
    }

    // Remove stale worktree if exists
    if (existsSync(worktreeDir)) {
      ;(console.info as (...args: unknown[]) => void)({ worktreeDir }, "Removing stale worktree")
      await this.execInOrThrow(repoDir, ["git", "worktree", "remove", "--force", worktreeDir])
    }

    // Create task root
    mkdirSync(taskRoot, { recursive: true })

    // Remove stale branch if exists
    const branchResult = await this.execInOrThrow(repoDir, ["git", "branch", "--list", branch])
    if (branchResult.stdout.trim()) {
      await this.execInOrThrow(repoDir, ["git", "branch", "-D", branch])
    }

    // Create fresh worktree at {taskRoot}/{repo}/
    await this.execInOrThrow(
      repoDir,
      ["git", "worktree", "add", worktreeDir, "-b", branch, `origin/${baseBranch}`],
      { inherit: true }
    )

    // Write .git/info/exclude to keep agent artifacts out of git status.
    // Worktrees have a .git file pointing to the real gitdir — write exclude there.
    // Ref: Multica edge case #5 — prevent agent brain from leaking into user PRs.
    this.writeWorktreeExclude(worktreeDir)

    // Create implement agent dir with context + symlink
    setupAgentContext(implementDir, repoName, buildAgentRules(repoName))
    const repoLink = resolve(implementDir, repoName)
    try { lstatSync(repoLink) } catch { symlinkSync(worktreeDir, repoLink) }

    ;(console.info as (...args: unknown[]) => void)({ taskRoot, implementDir, worktreeDir }, "Created task with implement agent dir")

    return {
      identifier,
      branch,
      taskDir: taskRoot,
      workDir: implementDir,
      worktreeDir,
      created: true,
    }
  }

  /**
   * Remove a worktree (wrapper dir + git worktree) and its branch.
   */
  async removeForTask(identifier: string, repoDir: string): Promise<void> {
    const sanitized = sanitizeTaskIdentifier(identifier)
    const branch = `agent/${sanitized}`
    const repoName = basename(repoDir)
    const taskRoot = this.resolveTaskDir(identifier)
    const worktreeDir = resolve(taskRoot, repoName)

    // Remove git worktree first
    if (existsSync(worktreeDir)) {
      await this.execInOrThrow(repoDir, ["git", "worktree", "remove", "--force", worktreeDir])
      ;(console.info as (...args: unknown[]) => void)({ worktreeDir }, "Removed worktree")
    } else {
      await this.execInOrThrow(repoDir, ["git", "worktree", "prune"])
    }

    // Remove the entire task directory
    if (existsSync(taskRoot)) {
      rmSync(taskRoot, { recursive: true, force: true })
    }

    // Clean up branch
    const branchResult = await this.execInOrThrow(repoDir, ["git", "branch", "--list", branch])
    if (branchResult.stdout.trim()) {
      await this.execInOrThrow(repoDir, ["git", "branch", "-D", branch])
    }
  }

  /**
   * Remove only the git worktree for a task, preserving agent dirs (logs).
   * Used by `reeve clean` — frees disk without losing observability.
   */
  async cleanWorktreeOnly(identifier: string, repoDir: string): Promise<void> {
    const sanitized = sanitizeTaskIdentifier(identifier)
    const branch = `agent/${sanitized}`
    const repoName = basename(repoDir)
    const taskRoot = this.resolveTaskDir(identifier)
    const worktreeDir = resolve(taskRoot, repoName)

    if (existsSync(worktreeDir)) {
      await this.execInOrThrow(repoDir, ["git", "worktree", "remove", "--force", worktreeDir])
      ;(console.info as (...args: unknown[]) => void)({ worktreeDir }, "Cleaned worktree (logs preserved)")
    } else {
      await this.execInOrThrow(repoDir, ["git", "worktree", "prune"])
    }

    // Clean up branch
    const branchResult = await this.execInOrThrow(repoDir, ["git", "branch", "--list", branch])
    if (branchResult.stdout.trim()) {
      await this.execInOrThrow(repoDir, ["git", "branch", "-D", branch])
    }

    // Remove repo symlinks from agent dirs (now dangling)
    for (const entry of readdirSync(taskRoot).filter(e => e !== repoName)) {
      const link = resolve(taskRoot, entry, repoName)
      try { lstatSync(link); unlinkSync(link) } catch {}
    }
  }

  /**
   * List all active worktrees for a repo
   */
  async listWorktrees(repoDir: string): Promise<string[]> {
    const result = await this.execIn(repoDir, ["git", "worktree", "list", "--porcelain"])
    if (result.exitCode !== 0) return []

    const worktrees: string[] = []
    for (const line of result.stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        worktrees.push(line.replace("worktree ", ""))
      }
    }
    return worktrees
  }

  listManagedWorktrees(): ManagedWorktreeInfo[] {
    return this.listManagedWorktreesIn(this.tasksDir)
  }

  private listManagedWorktreesIn(root: string): ManagedWorktreeInfo[] {
    if (!existsSync(root)) return []

    const decoder = new TextDecoder()

    return readdirSync(root)
      .filter(name => {
        try {
          return statSync(resolve(root, name)).isDirectory()
        } catch (err) {
          ;(console.warn as (...args: unknown[]) => void)({ err, path: resolve(root, name) }, "Cannot stat path")
          return false
        }
      })
      .flatMap(name => {
        const taskRoot = resolve(root, name)
        const worktreeDir = this.findWorktreeSubdir(taskRoot)
        if (!worktreeDir) return []
        const dotGit = resolve(worktreeDir, ".git")
        try {
          if (!existsSync(dotGit) || !statSync(dotGit).isFile()) return []
        } catch (err) {
          ;(console.warn as (...args: unknown[]) => void)({ err, worktreeDir }, "Cannot stat .git in worktree")
          return []
        }

        let raw: string
        try {
          raw = readFileSync(dotGit, "utf-8").trim()
        } catch (err) {
          ;(console.warn as (...args: unknown[]) => void)({ err, worktreeDir }, "Cannot read .git file in worktree")
          return []
        }

        const match = raw.match(/^gitdir:\s*(.+)$/)
        if (!match) return []

        const gitDir = resolve(worktreeDir, match[1].trim())
        const normalized = gitDir.split(sep).join("/")
        if (!normalized.includes("/.git/worktrees/")) return []

        const repoGitDir = resolve(gitDir, "..", "..")
        const repoDir = resolve(repoGitDir, "..")
        const branchProc = Bun.spawnSync(
          ["git", "-C", worktreeDir, "branch", "--show-current"],
          { stdout: "pipe", stderr: "pipe" },
        )
        const branch = decoder.decode(branchProc.stdout).trim()

        return [{
          identifier: name,
          branch,
          repoDir,
          worktreeDir,
        }]
      })
  }

  /**
   * Remove orphan worktree directories that don't belong to any active task.
   * Scans both the new TASKS_DIR and the old workspace root for migration.
   * Returns the list of removed identifier names.
   */
  async cleanOrphans(activeIdentifiers: Set<string>): Promise<string[]> {
    const managed = this.listManagedWorktrees()
    const removed: string[] = []

    for (const entry of managed) {
      if (!activeIdentifiers.has(entry.identifier)) {
        try {
          await this.removeForTask(entry.identifier, entry.repoDir)
          removed.push(entry.identifier)
          console.log(`[workspace] Removed orphan worktree: ${entry.identifier}`)
        } catch (err) {
          console.warn(`[workspace] Failed to remove orphan ${entry.identifier}:`, err)
        }
      }
    }

    return removed
  }



  /**
   * Find the worktree subdirectory inside a wrapper dir.
   * Scans for the first child directory containing a .git file (worktree indicator).
   */
  private findWorktreeSubdir(workDir: string): string | null {
    try {
      for (const entry of readdirSync(workDir)) {
        if (entry.startsWith(".")) continue
        const candidate = resolve(workDir, entry)
        const dotGit = resolve(candidate, ".git")
        try {
          if (statSync(candidate).isDirectory() && existsSync(dotGit) && statSync(dotGit).isFile()) {
            return candidate
          }
        } catch { continue }
      }
    } catch { /* wrapper dir doesn't exist or can't be read */ }
    return null
  }

  /**
   * Write .git/info/exclude for a worktree to hide agent-injected artifacts.
   *
   * Uses the worktree's gitdir (not the main repo's) so exclusions are
   * scoped to this worktree only. Prevents CLAUDE.md, .claude/, .mcp.json
   * etc. from appearing in `git status` even if an agent creates them
   * inside the repo directory.
   */
  private writeWorktreeExclude(worktreeDir: string): void {
    const EXCLUDE_PATTERNS = [
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/",
      ".codex/",
      ".agents/",
      ".mcp.json",
    ]

    try {
      const dotGitPath = resolve(worktreeDir, ".git")
      const dotGitContent = readFileSync(dotGitPath, "utf-8").trim()
      const match = dotGitContent.match(/^gitdir:\s*(.+)$/)
      if (!match) return

      const gitDir = resolve(worktreeDir, match[1].trim())
      const excludePath = resolve(gitDir, "info", "exclude")
      mkdirSync(resolve(gitDir, "info"), { recursive: true })

      const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf-8") : ""
      const missing = EXCLUDE_PATTERNS.filter(p => !existing.includes(p))
      if (missing.length > 0) {
        appendFileSync(excludePath, "\n# Reeve agent artifacts\n" + missing.join("\n") + "\n")
      }
    } catch {
      // Non-critical — exclusion is a safety net, not a hard requirement
    }
  }

  /**
   * Execute a git command in a given directory
   */
  private async execIn(
    cwd: string,
    args: string[],
    opts?: { inherit?: boolean }
  ): Promise<GitCommandResult> {
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })

    const [exitCodeRaw, stdout, stderr] = await Promise.all([
      proc.exited,
      proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(""),
      proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
    ])
    const exitCode = exitCodeRaw ?? 1

    if (opts?.inherit) {
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
    }

    if (exitCode !== 0) {
      const detail = (stderr || stdout).trim()
      ;(console.warn as (...args: unknown[]) => void)({ command: args.join(" "), detail }, "Command failed")
    }

    return { exitCode, stdout, stderr }
  }

  private async execInOrThrow(
    cwd: string,
    args: string[],
    opts?: { inherit?: boolean },
  ): Promise<GitCommandResult> {
    const result = await this.execIn(cwd, args, opts)
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout).trim()
      throw new Error(`git ${args.slice(1).join(" ")} failed (${result.exitCode}): ${detail}`)
    }
    return result
  }
}

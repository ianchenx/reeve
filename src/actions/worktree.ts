// actions/worktree.ts — Worktree inspection actions
// Git status and diff for live agent worktrees.

import { z } from "zod"
import { existsSync } from "fs"
import { registerAction } from "./registry"
import type { ActionContext } from "./types"

// ── worktreeStatus — git status + diff stat + commits ─────────

registerAction({
  name: "worktreeStatus",
  description: "Get git status, commits, and diff stat for a task worktree",
  input: z.object({
    identifier: z.string().min(1),
  }),
  output: z.any(),
  requiresDaemon: true,
  async handler(ctx: ActionContext, input: { identifier: string }) {
    const task = ctx.kernel!.tasks.find(t => t.identifier === input.identifier)
    const dir = task?.worktree
    if (!dir || !existsSync(dir)) throw new Error("worktree not found")

    const [statusProc, logProc, diffStatProc, branchProc] = [
      Bun.spawn(["git", "status", "--porcelain"], { cwd: dir, stdout: "pipe", stderr: "pipe" }),
      Bun.spawn(["git", "log", "--oneline", "main..HEAD"], { cwd: dir, stdout: "pipe", stderr: "pipe" }),
      Bun.spawn(["git", "diff", "--stat", "HEAD"], { cwd: dir, stdout: "pipe", stderr: "pipe" }),
      Bun.spawn(["git", "branch", "--show-current"], { cwd: dir, stdout: "pipe", stderr: "pipe" }),
    ]

    const [statusOut, logOut, diffStatOut, branchOut] = await Promise.all([
      new Response(statusProc.stdout).text(),
      new Response(logProc.stdout).text(),
      new Response(diffStatProc.stdout).text(),
      new Response(branchProc.stdout).text(),
    ])
    await Promise.all([statusProc.exited, logProc.exited, diffStatProc.exited, branchProc.exited])

    const changedFiles = statusOut.split("\n").filter(Boolean).map(line => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }))

    const commits = logOut.trim().split("\n").filter(Boolean).map(line => {
      const spaceIdx = line.indexOf(" ")
      return { hash: line.slice(0, spaceIdx), message: line.slice(spaceIdx + 1) }
    })

    return {
      branch: branchOut.trim(),
      changedFiles,
      commits,
      diffStat: diffStatOut.trim() || null,
    }
  },
})

// ── worktreeDiff — get diff for a specific file ───────────────

registerAction({
  name: "worktreeDiff",
  description: "Get git diff for a specific file in a task worktree",
  input: z.object({
    identifier: z.string().min(1),
    file: z.string().min(1),
  }),
  output: z.any(),
  requiresDaemon: true,
  async handler(ctx: ActionContext, input: { identifier: string; file: string }) {
    const task = ctx.kernel!.tasks.find(t => t.identifier === input.identifier)
    const dir = task?.worktree
    if (!dir || !existsSync(dir)) throw new Error("worktree not found")

    const statusProc = Bun.spawn(["git", "status", "--porcelain", "--untracked-files=all", "--", input.file], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    })
    const status = await new Response(statusProc.stdout).text()
    await statusProc.exited

    const proc = status.startsWith("?? ")
      ? Bun.spawn(["git", "diff", "--no-index", "--", "/dev/null", input.file], { cwd: dir, stdout: "pipe", stderr: "pipe" })
      : Bun.spawn(["git", "diff", "HEAD", "--", input.file], { cwd: dir, stdout: "pipe", stderr: "pipe" })
    const diff = await new Response(proc.stdout).text()
    await proc.exited
    return { diff: diff.trimEnd() }
  },
})

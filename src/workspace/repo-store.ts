// workspace/repo-store.ts — Maps GitHub repo identifiers to local clones.
// Owns reposRoot. Single resolve point: org/repo → absolute path.

import { existsSync, mkdirSync } from "fs"
import { resolve } from "path"
import { validateRepoIdentifier } from "../repo-resolver"
import { spawnPath } from "../utils/path"

export class RepoStore {
  constructor(private reposRoot: string) {}

  /** Pure mapping: repoRef → absolute path. Does not check or clone. */
  repoDirOf(repoRef: string): string {
    validateRepoIdentifier(repoRef)
    return resolve(this.reposRoot, repoRef)
  }

  /** Resolve to absolute path, cloning if absent. Throws on failure. */
  async ensure(repoRef: string): Promise<string> {
    const dir = this.repoDirOf(repoRef)
    if (existsSync(resolve(dir, ".git"))) return dir

    mkdirSync(resolve(this.reposRoot, repoRef.split("/")[0]), { recursive: true })
    const proc = Bun.spawn(["gh", "repo", "clone", repoRef, dir], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: spawnPath() },
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = (await new Response(proc.stderr).text()).trim()
      throw new Error(
        `[repo-store] failed to clone ${repoRef}: ${stderr || "gh exited " + exitCode}.\n` +
        `Install 'gh', run 'gh auth login', and confirm the repo exists.`,
      )
    }
    return dir
  }
}

/**
 * Verify a GitHub repo exists and the user has access. Used at import time.
 * Returns null on success, error message on failure.
 */
export async function verifyRepoExists(repoRef: string): Promise<string | null> {
  validateRepoIdentifier(repoRef)
  const proc = Bun.spawn(["gh", "repo", "view", repoRef, "--json", "name"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: spawnPath() },
  })
  const exitCode = await proc.exited
  if (exitCode === 0) return null
  const stderr = (await new Response(proc.stderr).text()).trim()
  return stderr || `gh repo view exited ${exitCode}`
}

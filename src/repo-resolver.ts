// repo-resolver.ts — Resolve GitHub repos (org/repo) to local clones.
// Reeve manages all repos internally. Only GitHub identifiers accepted.

import { existsSync, mkdirSync } from "fs"
import { resolve } from "path"

/**
 * Validate that a repo string is a GitHub identifier (org/repo).
 * Local paths are not supported — Reeve manages clones internally.
 */
export function validateRepoIdentifier(repo: string): void {
  if (repo.startsWith("/") || repo.startsWith("~") || repo.startsWith(".")) {
    throw new Error(
      `Local paths are not supported. Use 'org/repo' format (e.g. 'acme/my-app').\n` +
      `Reeve will clone and manage the repo automatically.`
    )
  }
  const parts = repo.split("/")
  if (parts.length !== 2 || parts.some(p => !p || p.includes(" "))) {
    throw new Error(
      `Invalid repo format: '${repo}'. Use 'org/repo' format (e.g. 'acme/my-app').`
    )
  }
}

/**
 * Resolve a GitHub repo to a local clone path.
 * Clone on demand if not found locally.
 *
 * Resolution order:
 *   1. Reeve's repo cache (reposRoot/org/repo)
 *   2. Clone via gh CLI
 */
export async function resolveRepo(
  repo: string,
  reposRoot: string,
): Promise<string> {
  validateRepoIdentifier(repo)

  const cachedPath = resolve(reposRoot, repo)

  // Already in our cache?
  if (existsSync(resolve(cachedPath, ".git"))) {
    return cachedPath
  }

  // Clone on demand
  console.log(`[repo-resolver] Cloning ${repo} → ${cachedPath}`)
  mkdirSync(resolve(reposRoot, repo.split("/")[0]), { recursive: true })

  const cloned = await cloneRepo(repo, cachedPath)
  if (!cloned) {
    throw new Error(
      `[repo-resolver] Failed to clone ${repo}. ` +
      `Install 'gh', run 'gh auth login', and make sure git can reach GitHub.`
    )
  }
  console.log(`[repo-resolver] Cloned ${repo}`)
  return cachedPath
}

/**
 * Clone a GitHub repo via gh CLI.
 */
async function cloneRepo(repo: string, targetDir: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["gh", "repo", "clone", repo, targetDir],
      { stdout: "pipe", stderr: "pipe" },
    )
    if (await proc.exited === 0) return true
  } catch {
    // gh not available
  }
  return false
}

/**
 * Resolve all projects' repos in a config.
 * Mutates the projects array in place, replacing org/repo with absolute paths.
 */
export async function resolveAllRepos(
  projects: Array<{ repo: string; slug: string }>,
  reposRoot: string,
): Promise<void> {
  for (const project of projects) {
    const resolved = await resolveRepo(project.repo, reposRoot)
    if (project.repo !== resolved) {
      console.log(`[repo-resolver] ${project.repo} → ${resolved}`)
    }
    project.repo = resolved
  }
}

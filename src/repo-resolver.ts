// repo-resolver.ts — Validate GitHub repo identifiers (org/repo).
// Local paths are not accepted: Reeve manages clones internally via RepoStore.

/**
 * Throws if the string is not a syntactically-valid GitHub `org/repo` identifier.
 * Use this at any boundary that receives a repo string from outside the kernel.
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

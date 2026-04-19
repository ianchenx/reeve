// install-source.ts — Detect how reeve was installed, choose upgrade command.

export type InstallSource = "homebrew" | "bun-global" | "npm-global" | "dev" | "unknown"

export function detectInstallSourceFromPath(entryPath: string): InstallSource {
  // Order matters: check npm-inside-homebrew before plain homebrew.
  if (entryPath.includes("/lib/node_modules/")) return "npm-global"
  if (entryPath.includes("/.bun/install/global/")) return "bun-global"
  if (entryPath.includes("/Cellar/") || entryPath.includes("/homebrew/")) return "homebrew"
  if (entryPath.endsWith(".ts")) return "dev"
  return "unknown"
}

export function detectInstallSource(): InstallSource {
  const argv1 = process.argv[1] ?? ""
  const meta = import.meta.url.replace(/^file:\/\//, "")
  for (const path of [argv1, meta]) {
    const source = detectInstallSourceFromPath(path)
    if (source !== "unknown") return source
  }
  return "unknown"
}

export function upgradeCommandFor(source: InstallSource): string[] | null {
  switch (source) {
    case "homebrew":
      return ["brew", "upgrade", "reeve-ai"]
    case "bun-global":
      return ["bun", "add", "-g", "reeve-ai@latest"]
    case "npm-global":
      return ["npm", "install", "-g", "reeve-ai@latest"]
    case "dev":
      return null
    case "unknown":
      return ["sh", "-c", "curl -fsSL https://reeve.run/install.sh | bash"]
  }
}

const GH_DOCS = "https://cli.github.com/manual/installation"

export function ghInstallHint(
  platform: NodeJS.Platform = process.platform,
): string[] {
  switch (platform) {
    case "darwin":
      return ["brew install gh"]
    case "linux":
      return [
        "sudo apt install gh   # or dnf/pacman — distro-dependent",
        `See ${GH_DOCS} for your package manager`,
      ]
    case "win32":
      return ["winget install --id GitHub.cli"]
    default:
      return [`See ${GH_DOCS}`]
  }
}

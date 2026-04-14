import type { ReeveSettings } from "./config"

type RuntimeHealthOptions = {
  execSync?: typeof Bun.spawnSync
}

const decoder = new TextDecoder()

function readOutput(output: ArrayBufferLike | ArrayBufferView | null | undefined): string {
  if (!output) return ""
  return decoder.decode(output).trim()
}

export interface RuntimeHealth {
  hasApiKey: boolean
  projectCount: number
  ghInstalled: boolean
  ghAuthenticated: boolean
  ghLogin: string
  ghStatusDetail: string
  gitConfigured: boolean
  gitUserName: string
  gitUserEmail: string
  gitHubReachable: boolean
  gitHubReachableDetail: string
  githubReady: boolean
  codexInstalled: boolean
  runtimeReady: boolean
  issues: string[]
}

export interface SetupEntryHealth {
  hasApiKey: boolean
  projectCount: number
  codexInstalled: boolean
  configured: boolean
  issues: string[]
}

function isCodexInstalled(execSync: typeof Bun.spawnSync): boolean {
  return execSync(["which", "codex"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0
}

function probeGitHubHealth(execSync: typeof Bun.spawnSync): Pick<
  RuntimeHealth,
  | "ghInstalled"
  | "ghAuthenticated"
  | "ghLogin"
  | "ghStatusDetail"
  | "gitConfigured"
  | "gitUserName"
  | "gitUserEmail"
  | "gitHubReachable"
  | "gitHubReachableDetail"
  | "githubReady"
> {
  const ghVersion = execSync(["gh", "--version"], { stdout: "pipe", stderr: "pipe" })
  const ghInstalled = ghVersion.exitCode === 0

  let ghAuthenticated = false
  let ghLogin = ""
  let ghStatusDetail = ghInstalled ? "Run gh auth login" : "Install gh first"

  if (ghInstalled) {
    const ghAuth = execSync(["gh", "auth", "status", "--hostname", "github.com"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (ghAuth.exitCode === 0) {
      ghAuthenticated = true
      const ghUser = execSync(["gh", "api", "user", "--jq", ".login"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      ghLogin = readOutput(ghUser.stdout)
      ghStatusDetail = ghLogin ? `Logged in as ${ghLogin}` : "Authenticated"
    } else {
      ghStatusDetail = readOutput(ghAuth.stderr) || readOutput(ghAuth.stdout) || "Run gh auth login"
    }
  }

  const gitName = execSync(["git", "config", "user.name"], { stdout: "pipe", stderr: "pipe" })
  const gitEmail = execSync(["git", "config", "user.email"], { stdout: "pipe", stderr: "pipe" })
  const gitUserName = readOutput(gitName.stdout)
  const gitUserEmail = readOutput(gitEmail.stdout)
  const gitConfigured = !!(gitUserName && gitUserEmail)

  const gitProbe = execSync(["git", "ls-remote", "https://github.com/github/gitignore.git", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const gitHubReachable = gitProbe.exitCode === 0
  const gitHubReachableDetail = gitHubReachable
    ? "git can reach github.com"
    : readOutput(gitProbe.stderr) || readOutput(gitProbe.stdout) || "git cannot reach github.com"

  return {
    ghInstalled,
    ghAuthenticated,
    ghLogin,
    ghStatusDetail,
    gitConfigured,
    gitUserName,
    gitUserEmail,
    gitHubReachable,
    gitHubReachableDetail,
    githubReady: ghAuthenticated && gitConfigured && gitHubReachable,
  }
}

export function getSetupEntryHealth(
  settings: ReeveSettings,
  options?: RuntimeHealthOptions,
): SetupEntryHealth {
  const execSync = options?.execSync ?? Bun.spawnSync
  const hasApiKey = !!settings.linearApiKey
  const projectCount = (settings.projects ?? []).length
  const codexInstalled = isCodexInstalled(execSync)

  const issues: string[] = []
  if (!hasApiKey) issues.push("No Linear API key configured")
  if (projectCount === 0) issues.push("No projects configured")
  if (!codexInstalled) issues.push("Codex CLI not installed")

  return {
    hasApiKey,
    projectCount,
    codexInstalled,
    configured: issues.length === 0,
    issues,
  }
}

export function getRuntimeHealth(
  settings: ReeveSettings,
  options?: RuntimeHealthOptions,
): RuntimeHealth {
  const execSync = options?.execSync ?? Bun.spawnSync
  const setup = getSetupEntryHealth(settings, { execSync })
  const github = probeGitHubHealth(execSync)

  const issues = [...setup.issues]
  if (!github.ghInstalled) issues.push("GitHub CLI not installed")
  else if (!github.ghAuthenticated) issues.push("GitHub CLI not authenticated")
  if (!github.gitConfigured) issues.push("Git identity not configured")
  if (!github.gitHubReachable) issues.push(github.gitHubReachableDetail)

  return {
    hasApiKey: setup.hasApiKey,
    projectCount: setup.projectCount,
    ...github,
    codexInstalled: setup.codexInstalled,
    runtimeReady: issues.length === 0,
    issues,
  }
}

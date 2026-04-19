import type { ReeveSettings } from "./config"
import { trySpawnSync, type SpawnResult } from "./utils/spawn"

type RuntimeHealthOptions = {
  execSync?: typeof Bun.spawnSync
}

const decoder = new TextDecoder()

function readOutput(output: ArrayBufferLike | ArrayBufferView | null | undefined): string {
  if (!output) return ""
  return decoder.decode(output).trim()
}

function ranOk(result: SpawnResult): boolean {
  if (result.kind === "error") throw result.error
  return result.kind === "ok" && result.exitCode === 0
}

export const AGENT_CLIS = ["claude", "codex"] as const
export type AgentCli = (typeof AGENT_CLIS)[number]

export interface AgentHealth {
  name: AgentCli
  installed: boolean
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
  agents: AgentHealth[]
  runtimeReady: boolean
  issues: string[]
}

export interface SetupEntryHealth {
  hasApiKey: boolean
  projectCount: number
  agents: AgentHealth[]
  configured: boolean
  issues: string[]
}

function probeAgents(execSync: typeof Bun.spawnSync): AgentHealth[] {
  return AGENT_CLIS.map(name => ({
    name,
    installed: ranOk(trySpawnSync(["which", name], { stdout: "pipe", stderr: "pipe" }, execSync)),
  }))
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
  const ghVersion = trySpawnSync(["gh", "--version"], { stdout: "pipe", stderr: "pipe" }, execSync)
  const ghInstalled = ranOk(ghVersion)

  let ghAuthenticated = false
  let ghLogin = ""
  let ghStatusDetail = ghInstalled ? "Run gh auth login" : "Install gh first"

  if (ghInstalled) {
    const ghAuth = trySpawnSync(
      ["gh", "auth", "status", "--hostname", "github.com"],
      { stdout: "pipe", stderr: "pipe" },
      execSync,
    )
    if (ranOk(ghAuth)) {
      ghAuthenticated = true
      const ghUser = trySpawnSync(
        ["gh", "api", "user", "--jq", ".login"],
        { stdout: "pipe", stderr: "pipe" },
        execSync,
      )
      if (ghUser.kind === "ok") ghLogin = readOutput(ghUser.stdout)
      ghStatusDetail = ghLogin ? `Logged in as ${ghLogin}` : "Authenticated"
    } else if (ghAuth.kind === "ok") {
      ghStatusDetail = readOutput(ghAuth.stderr) || readOutput(ghAuth.stdout) || "Run gh auth login"
    }
  }

  const gitName = trySpawnSync(["git", "config", "user.name"], { stdout: "pipe", stderr: "pipe" }, execSync)
  const gitEmail = trySpawnSync(["git", "config", "user.email"], { stdout: "pipe", stderr: "pipe" }, execSync)
  if (gitName.kind === "error") throw gitName.error
  if (gitEmail.kind === "error") throw gitEmail.error
  const gitUserName = gitName.kind === "ok" ? readOutput(gitName.stdout) : ""
  const gitUserEmail = gitEmail.kind === "ok" ? readOutput(gitEmail.stdout) : ""
  const gitConfigured = !!(gitUserName && gitUserEmail)

  const gitProbe = trySpawnSync(
    ["git", "ls-remote", "https://github.com/github/gitignore.git", "HEAD"],
    { stdout: "pipe", stderr: "pipe" },
    execSync,
  )
  const gitHubReachable = ranOk(gitProbe)
  const gitHubReachableDetail = gitHubReachable
    ? "git can reach github.com"
    : gitProbe.kind === "ok"
      ? readOutput(gitProbe.stderr) || readOutput(gitProbe.stdout) || "git cannot reach github.com"
      : "git cannot reach github.com"

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

export function hasAnyAgent(agents: AgentHealth[]): boolean {
  return agents.some(a => a.installed)
}

export function getSetupEntryHealth(
  settings: ReeveSettings,
  options?: RuntimeHealthOptions,
): SetupEntryHealth {
  const execSync = options?.execSync ?? Bun.spawnSync
  const hasApiKey = !!settings.linearApiKey
  const projectCount = (settings.projects ?? []).length
  const agents = probeAgents(execSync)

  const issues: string[] = []
  if (!hasApiKey) issues.push("No Linear API key configured")
  if (projectCount === 0) issues.push("No projects configured")
  if (!hasAnyAgent(agents)) issues.push(`No coding agent installed (need one of: ${AGENT_CLIS.join(", ")})`)

  return {
    hasApiKey,
    projectCount,
    agents,
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
    agents: setup.agents,
    runtimeReady: issues.length === 0,
    issues,
  }
}

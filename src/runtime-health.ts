import type { ReeveSettings } from "./config"

type RuntimeHealthOptions = {
  execSync?: typeof Bun.spawnSync
}

const decoder = new TextDecoder()
const EMPTY_OUTPUT = new Uint8Array(0)

function readOutput(output: ArrayBufferLike | ArrayBufferView | null | undefined): string {
  if (!output) return ""
  return decoder.decode(output).trim()
}

function safeSpawn(
  execSync: typeof Bun.spawnSync,
  args: Parameters<typeof Bun.spawnSync>[0],
  options?: Parameters<typeof Bun.spawnSync>[1],
): ReturnType<typeof Bun.spawnSync> {
  try {
    return execSync(args, options)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
    return {
      exitCode: 127,
      stdout: EMPTY_OUTPUT,
      stderr: EMPTY_OUTPUT,
      pid: 0,
      signal: null,
      success: false,
      signalCode: null,
      resourceUsage: undefined,
    } as unknown as ReturnType<typeof Bun.spawnSync>
  }
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
    installed: safeSpawn(execSync, ["which", name], { stdout: "pipe", stderr: "pipe" }).exitCode === 0,
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
  const ghVersion = safeSpawn(execSync, ["gh", "--version"], { stdout: "pipe", stderr: "pipe" })
  const ghInstalled = ghVersion.exitCode === 0

  let ghAuthenticated = false
  let ghLogin = ""
  let ghStatusDetail = ghInstalled ? "Run gh auth login" : "Install gh first"

  if (ghInstalled) {
    const ghAuth = safeSpawn(execSync, ["gh", "auth", "status", "--hostname", "github.com"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (ghAuth.exitCode === 0) {
      ghAuthenticated = true
      const ghUser = safeSpawn(execSync, ["gh", "api", "user", "--jq", ".login"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      ghLogin = readOutput(ghUser.stdout)
      ghStatusDetail = ghLogin ? `Logged in as ${ghLogin}` : "Authenticated"
    } else {
      ghStatusDetail = readOutput(ghAuth.stderr) || readOutput(ghAuth.stdout) || "Run gh auth login"
    }
  }

  const gitName = safeSpawn(execSync, ["git", "config", "user.name"], { stdout: "pipe", stderr: "pipe" })
  const gitEmail = safeSpawn(execSync, ["git", "config", "user.email"], { stdout: "pipe", stderr: "pipe" })
  const gitUserName = readOutput(gitName.stdout)
  const gitUserEmail = readOutput(gitEmail.stdout)
  const gitConfigured = !!(gitUserName && gitUserEmail)

  const gitProbe = safeSpawn(execSync, ["git", "ls-remote", "https://github.com/github/gitignore.git", "HEAD"], {
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

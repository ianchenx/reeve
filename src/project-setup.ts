// project-setup.ts — Shared project detection & Linear integration
// Used by both CLI (commands/init.ts) and Dashboard (server.ts)

import { existsSync } from "fs"
import { resolve } from "path"

// ── GitHub repo discovery ─────────────────────────────────

export interface GitHubRepo {
  name: string
  full_name: string
  default_branch: string
  private: boolean
  language: string | null
}

/**
 * List user's GitHub repos.
 * Requires authenticated gh CLI.
 * - No query: returns 15 most recently pushed repos
 * - With query: searches via GitHub Search API
 */
export async function listGitHubRepos(query?: string): Promise<{ repos: GitHubRepo[]; available: boolean }> {
  return listGitHubReposViaCLI(query)
}

async function listGitHubReposViaCLI(query?: string): Promise<{ repos: GitHubRepo[]; available: boolean }> {
  try {
    let args: string[]

    if (query && query.trim()) {
      const q = encodeURIComponent(`${query.trim()} in:name user:@me fork:true`)
      args = [
        "gh", "api", `/search/repositories?q=${q}&sort=updated&per_page=15`,
        "--jq", '.items[] | {name, full_name, default_branch, private, language}',
      ]
    } else {
      args = [
        "gh", "api", "/user/repos?sort=pushed&per_page=15",
        "--jq", '.[] | {name, full_name, default_branch, private, language}',
      ]
    }

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
    const exitCode = await proc.exited
    if (exitCode !== 0) return { repos: [], available: false }

    const output = (await new Response(proc.stdout).text()).trim()
    if (!output) return { repos: [], available: true }

    const repos: GitHubRepo[] = output
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line) } catch { return null }
      })
      .filter((r): r is GitHubRepo => r !== null)

    return { repos, available: true }
  } catch {
    return { repos: [], available: false }
  }
}

// ── Project config detection ──────────────────────────────

export interface DetectedConfig {
  setup?: string
}

/**
 * Auto-detect setup & validate commands from repo structure.
 * Works on both local paths and bare clones.
 */
export function detectProjectConfig(repoPath: string): DetectedConfig {
  const config: DetectedConfig = {}

  // Detect package manager → setup command
  const pmRules: Array<{ lockfile: string; setup: string }> = [
    { lockfile: "bun.lock", setup: "bun install" },
    { lockfile: "bun.lockb", setup: "bun install" },
    { lockfile: "pnpm-lock.yaml", setup: "pnpm install" },
    { lockfile: "yarn.lock", setup: "yarn install" },
    { lockfile: "package-lock.json", setup: "npm install" },
  ]

  for (const rule of pmRules) {
    if (existsSync(resolve(repoPath, rule.lockfile))) {
      config.setup = rule.setup
      break
    }
  }

  // Non-JS ecosystems
  if (!config.setup) {
    if (existsSync(resolve(repoPath, "go.mod"))) {
      config.setup = "go mod download"
      return config
    }
    if (existsSync(resolve(repoPath, "Cargo.toml"))) {
      config.setup = "cargo build"
      return config
    }
  }

  return config
}

// ── Linear integration ────────────────────────────────────

export interface TeamFixture {
  id: string
  key: string
  name: string
}

export interface LinearTeamProject {
  slugId: string
  name: string
}

export async function linearGQL(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": apiKey },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`)
  const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> }
  if (json.errors?.length) throw new Error(`Linear: ${json.errors[0].message}`)
  return json.data
}

/**
 * Fetch all Linear teams for the authenticated user.
 */
export async function fetchTeams(apiKey: string): Promise<TeamFixture[]> {
  const teamsData = await linearGQL(apiKey, `
    query { teams { nodes { id key name } } }
  `) as { teams: { nodes: TeamFixture[] } }
  return teamsData.teams.nodes
}

/**
 * List all Linear projects for a team.
 */
export async function listTeamProjects(apiKey: string, teamId: string): Promise<LinearTeamProject[]> {
  const projectData = await linearGQL(apiKey, `
    query ($teamId: String!) {
      team(id: $teamId) { projects { nodes { slugId name } } }
    }
  `, { teamId }) as { team: { projects: { nodes: LinearTeamProject[] } } }

  return projectData.team.projects.nodes
}

/**
 * Find a Linear project by name (read-only, no side effects).
 * Returns the match or null.
 */
export async function findProject(apiKey: string, team: TeamFixture, repoName: string): Promise<LinearTeamProject | null> {
  const projects = await listTeamProjects(apiKey, team.id)

  const exactMatch = projects.find(
    (project) => project.name.trim().toLowerCase() === repoName.trim().toLowerCase()
  )
  return exactMatch ?? null
}

/**
 * Find or create a Linear project for a repo.
 * Use findProject() for read-only checks (e.g. detect phase).
 */
export async function ensureProjectSlug(apiKey: string, team: TeamFixture, repoName: string): Promise<{ slugId: string; name: string; created: boolean }> {
  const existing = await findProject(apiKey, team, repoName)
  if (existing) return { ...existing, created: false }

  // Create new project
  const data = await linearGQL(apiKey, `
    mutation ($name: String!, $teamIds: [String!]!) {
      projectCreate(input: { name: $name, teamIds: $teamIds }) {
        success
        project { slugId name }
      }
    }
  `, { name: repoName, teamIds: [team.id] }) as {
    projectCreate: { success: boolean; project: { slugId: string; name: string } }
  }
  if (!data.projectCreate.success) throw new Error("Failed to create Linear project")
  return { slugId: data.projectCreate.project.slugId, name: data.projectCreate.project.name, created: true }
}

interface WorkflowState {
  id: string
  name: string
  type: string
}

const REQUIRED_STATES = [
  { name: "In Review", type: "started" },
] as const

/**
 * Ensure required workflow states exist in the team.
 */
export async function ensureWorkflowStates(apiKey: string, team: TeamFixture): Promise<string[]> {
  const data = await linearGQL(apiKey, `
    query ($teamId: String!) {
      team(id: $teamId) { states { nodes { id name type } } }
    }
  `, { teamId: team.id }) as { team: { states: { nodes: WorkflowState[] } } }

  const states = data.team.states.nodes
  const created: string[] = []

  for (const req of REQUIRED_STATES) {
    const found = states.find(s => s.name.toLowerCase() === req.name.toLowerCase())
    if (found) continue

    try {
      await linearGQL(apiKey, `
        mutation CreateWorkflowState($input: WorkflowStateCreateInput!) {
          workflowStateCreate(input: $input) { success workflowState { id name type } }
        }
      `, { input: { teamId: team.id, name: req.name, type: req.type, color: "#95a2b3" } })
      created.push(req.name)
    } catch (err) {
      console.error(`[project-setup] Failed to create state ${req.name}:`, err)
    }
  }

  return created
}

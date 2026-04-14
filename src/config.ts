// config.ts — Configuration loader
// All config lives in ~/.reeve/settings.json

import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from "fs"
import { resolve } from "path"
import { z } from "zod"

export interface LinearConfig {
  apiKey: string
  projectSlug: string
  teamKey: string
  activeStates: string[]
  dispatchableStateTypes: string[]
  terminalStates: string[]
  stateNames: {
    todo: string
    inProgress: string
    inReview: string
    done: string
    backlog: string
  }
}

export interface ProjectConfig {
  team: string
  slug: string
  repo: string
  baseBranch: string
  setup?: string
  agent?: string
  post?: Record<string, string>
}

export interface WorkspaceConfig {
  root: string
}

export interface AgentConfig {
  maxRounds: number
  stallTimeoutMs: number
  turnTimeoutMs: number
  maxRetries: number
  default: "codex" | "claude" | "auto"
}

export interface PollingConfig {
  intervalMs: number
}

export interface DashboardConfig {
  port: number
  enabled: boolean
}

export interface EventsConfig {
  dir: string
}

export type SourceType = 'linear'

export interface ReeveDaemonConfig {
  source: SourceType
  linear?: LinearConfig
  workspace: WorkspaceConfig
  agent: AgentConfig
  polling: PollingConfig
  dashboard: DashboardConfig
  events: EventsConfig
  projects: ProjectConfig[]
}

const settingsProjectSchema = z.object({
  team: z.string(),
  linear: z.string(),
  repo: z.string(),
  baseBranch: z.string(),
  setup: z.string().optional(),
  agent: z.enum(["codex", "claude", "auto"]).optional(),
  post: z.record(z.string(), z.string()).optional(),
})

const settingsSchema = z.object({
  source: z.enum(["linear"]).optional(),
  linearApiKey: z.string().optional(),
  defaultAgent: z.enum(["codex", "claude", "auto"]).optional(),
  defaultTeam: z.string().optional(),
  projects: z.array(settingsProjectSchema).optional(),
  workspace: z.object({ root: z.string() }).optional(),
  agent: z.object({}).optional(),
  polling: z.object({ intervalMs: z.number() }).optional(),
  dashboard: z.object({
    port: z.number().optional(),
    enabled: z.boolean().optional(),
  }).optional(),
}).catchall(z.unknown())

export type ReeveSettings = z.infer<typeof settingsSchema>

export function getSettingsPath(): string {
  const newPath = resolve(process.env.REEVE_DIR || resolve(process.env.HOME || "/tmp", ".reeve"), "settings.json")
  const legacyPath = resolve(process.env.HOME || "/tmp", ".config", "reeve", "settings.json")

  // Auto-migrate from legacy ~/.config/reeve/ location
  if (!existsSync(newPath) && existsSync(legacyPath)) {
    const dir = resolve(newPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    copyFileSync(legacyPath, newPath)
  }

  return newPath
}

export function saveSettings(settings: ReeveSettings): void {
  const settingsPath = getSettingsPath()
  const dir = resolve(settingsPath, "..")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

const LINEAR_DEFAULTS: LinearConfig = {
  apiKey: "",
  projectSlug: "",
  teamKey: "",
  activeStates: ["Todo", "In Progress"],
  dispatchableStateTypes: ["unstarted", "started"],
  terminalStates: ["Done", "Cancelled"],
  stateNames: {
    todo: "Todo",
    inProgress: "In Progress",
    inReview: "In Review",
    done: "Done",
    backlog: "Backlog",
  },
}

const DEFAULTS: ReeveDaemonConfig = {
  source: "linear",
  linear: LINEAR_DEFAULTS,
  workspace: {
    root: "~/.reeve/workspaces",
  },
  agent: {
    maxRounds: 1,
    stallTimeoutMs: 300_000,      // 5 minutes without output
    turnTimeoutMs: 3_600_000,     // 1 hour max per turn
    maxRetries: 3,
    default: "claude",
  },
  polling: {
    intervalMs: 30_000,
  },
  dashboard: {
    port: 14500,
    enabled: true,
  },
  events: {
    dir: "./events",
  },
  projects: [],
}

export function loadSettings(): ReeveSettings {
  const settingsPath = getSettingsPath()
  if (!existsSync(settingsPath)) return {}
  try {
    const raw = JSON.parse(readFileSync(settingsPath, "utf-8"))
    const result = settingsSchema.safeParse(raw)
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}

function resolvePath(value: string): string {
  const expanded = value.startsWith("~")
    ? value.replace("~", process.env.HOME || "/tmp")
    : value
  return resolve(expanded)
}

export function loadConfig(): ReeveDaemonConfig {
  const settings = loadSettings()

  const projects: ProjectConfig[] = (settings.projects ?? []).map((p) => ({
    team: p.team,
    slug: p.linear,
    repo: p.repo,
    baseBranch: p.baseBranch,
    setup: p.setup,
    agent: p.agent,
    post: p.post as Record<string, string> | undefined,
  }))

  const sourceType = (settings.source as SourceType | undefined) ?? DEFAULTS.source

  const config: ReeveDaemonConfig = {
    source: sourceType,
    linear: sourceType === 'linear' ? {
      ...LINEAR_DEFAULTS,
      apiKey: settings.linearApiKey || "",
      projectSlug: projects[0]?.slug ?? "",
      teamKey: projects[0]?.team ?? "",
    } : undefined,
    workspace: {
      root: resolvePath(settings.workspace?.root ?? DEFAULTS.workspace.root),
    },
    agent: {
      ...DEFAULTS.agent,
      default: settings.defaultAgent ?? DEFAULTS.agent.default,
    },
    polling: {
      intervalMs: settings.polling?.intervalMs ?? DEFAULTS.polling.intervalMs,
    },
    dashboard: {
      port: settings.dashboard?.port ?? DEFAULTS.dashboard.port,
      enabled: settings.dashboard?.enabled ?? DEFAULTS.dashboard.enabled,
    },
    events: {
      dir: resolvePath(DEFAULTS.events.dir),
    },
    projects,
  }

  return config
}

// actions/projects.ts — Project management actions
// Registered in the action registry: CLI and API share the same handlers.

import { z } from "zod"
import { registerAction } from "./registry"
import type { ActionContext } from "./types"
import {
  listGitHubRepos,
  fetchTeams,
  listTeamProjects,
  ensureProjectSlug,
  ensureWorkflowStates,
} from "../project-setup"
import { loadSettings, saveSettings } from "../config"
import { getRuntimeHealth, getSetupEntryHealth } from "../runtime-health"
import { verifyRepoExists } from "../workspace/repo-store"

const REPO_REF_REGEX = /^[\w.-]+\/[\w.-]+$/

function getLinearApiKey(ctx: ActionContext): string {
  return loadSettings().linearApiKey ?? ctx.config.linear?.apiKey ?? ""
}

// ── setupCheck — lightweight entry gate for dashboard ──────────
// Called on every page load by main.tsx. Must stay local and cheap.

registerAction({
  name: "setupCheck",
  description: "Lightweight check: is Reeve configured? (fast, no network calls)",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext) {
    const settings = loadSettings()
    const health = getSetupEntryHealth(settings)
    const runtimeActive = !!ctx.kernel && ctx.kernel.lastTickAt > 0
    const configured = health.hasApiKey && health.codexInstalled

    return {
      configured,
      runtimeActive,
      hasApiKey: health.hasApiKey,
      projectCount: health.projectCount,
    }
  },
})

// ── setupStatus — full diagnostics for setup wizard ───────────
// Runs external commands (gh, git). Only called from SetupWizard.

registerAction({
  name: "setupStatus",
  description: "Full setup diagnostics: Linear, GitHub environment, projects, agents",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext) {
    const settings = loadSettings()
    const projects = settings.projects ?? []

    // Check which agents are available
    const agents: string[] = []
    for (const name of ["claude", "codex"]) {
      const v = Bun.spawnSync(["which", name], { stdout: "pipe" })
      if (v.exitCode === 0) agents.push(name)
    }

    const health = getRuntimeHealth(settings)
    const runtimeActive = !!ctx.kernel && ctx.kernel.lastTickAt > 0

    return {
      ready: health.runtimeReady && runtimeActive,
      configured: health.runtimeReady,
      runtimeActive,
      hasApiKey: health.hasApiKey,
      githubReady: health.githubReady,
      ghInstalled: health.ghInstalled,
      ghAuthenticated: health.ghAuthenticated,
      ghLogin: health.ghLogin,
      ghStatusDetail: health.ghStatusDetail,
      gitConfigured: health.gitConfigured,
      gitUserName: health.gitUserName,
      gitUserEmail: health.gitUserEmail,
      gitHubReachable: health.gitHubReachable,
      gitHubReachableDetail: health.gitHubReachableDetail,
      codexInstalled: health.codexInstalled,
      projectCount: projects.length,
      projects: projects.map(p => ({ repo: p.repo, team: p.team, linear: p.linear })),
      agents,
    }
  },
})

// ── setupSave — save API keys and defaults ────────────────

registerAction({
  name: "setupSave",
  description: "Save setup configuration (Linear key, defaults)",
  input: z.object({
    linearApiKey: z.string().optional(),
    defaultAgent: z.enum(["codex", "claude", "auto"]).optional(),
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(_ctx: ActionContext, input: {
    linearApiKey?: string
    defaultAgent?: "codex" | "claude" | "auto"
  }) {
    const settings = loadSettings()
    const nextSettings = { ...settings }
    if (input.defaultAgent) nextSettings.defaultAgent = input.defaultAgent
    delete (nextSettings as Record<string, unknown>).githubToken

    const result: {
      ok: boolean
      linearValid?: boolean
      linearError?: string
      teams: Array<{ key: string; name: string }>
    } = { ok: true, teams: [] }

    // Validate Linear key
    if (input.linearApiKey) {
      try {
        const teams = await fetchTeams(input.linearApiKey)
        result.linearValid = true
        result.teams = teams.map(t => ({ key: t.key, name: t.name }))
        nextSettings.linearApiKey = input.linearApiKey
      } catch {
        result.linearValid = false
        result.linearError = "Could not connect to Linear. Check the key."
        return result
      }
    }

    saveSettings(nextSettings)
    return result
  },
})

// ── projectList — list configured projects with config details ──

registerAction({
  name: "projectList",
  description: "List all configured projects with their settings",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: true,
  async handler(ctx: ActionContext) {
    const cfg = ctx.kernel!.getConfig()
    return cfg.projects.map((p: any) => ({
      slug: p.slug,
      repo: p.repo,
      team: p.team,
      agent: p.agent,
      setup: p.setup,
      post: p.post,
    }))
  },
})

// ── configGet — read running daemon config ────────────────────

registerAction({
  name: "configGet",
  description: "Get the running daemon configuration summary",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext) {
    const cfg = ctx.config
    return {
      projects: cfg.projects.map((p: { slug: string; repo: string }) => ({ slug: p.slug, repo: p.repo })),
      agent: {
        maxRetries: cfg.agent.maxRetries,
        stallTimeoutMs: cfg.agent.stallTimeoutMs,
        default: cfg.agent.default,
      },
      polling: { intervalMs: cfg.polling.intervalMs },
    }
  },
})

// ── githubRepos — list user's GitHub repos via gh CLI ──────────

registerAction({
  name: "githubRepos",
  description: "List or search user's GitHub repos via gh CLI",
  input: z.object({
    query: z.string().optional(),
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(_ctx: ActionContext, input: { query?: string }) {
    return listGitHubRepos(input.query)
  },
})

// ── projectDetect — auto-detect config for a repo ─────────────

registerAction({
  name: "projectDetect",
  description: "Auto-detect setup/validate commands and Linear team options for a repo",
  input: z.object({
    repo: z.string().min(1, "repo is required"),
    team: z.string().optional(), // if provided, skip defaulting
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: { repo: string; team?: string }) {
    const repoName = input.repo.split("/").pop() ?? input.repo

    // Infer team from input, settings, or existing projects
    const inferredTeam = input.team || loadSettings().defaultTeam || (ctx.config.projects[0]?.team ?? "")

    // Fetch real teams list from Linear
    let teams: Array<{ key: string; name: string }> = []
    const apiKey = getLinearApiKey(ctx)
    if (apiKey) {
      try {
        const allTeams = await fetchTeams(apiKey)
        teams = allTeams.map(t => ({ key: t.key, name: t.name }))
      } catch { /* Linear not available, skip */ }
    }

    return {
      inferredTeam,
      teams,
      repoName,
    }
  },
})

// ── teamProjects — list Linear projects for a team ───────────

registerAction({
  name: "teamProjects",
  description: "List existing Linear projects for a team",
  input: z.object({
    teamKey: z.string().min(1, "teamKey is required"),
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: { teamKey: string }) {
    const apiKey = getLinearApiKey(ctx)
    if (!apiKey) {
      throw new Error("Linear API key is not configured")
    }

    const teams = await fetchTeams(apiKey)
    const team = teams.find(item => item.key === input.teamKey)
    if (!team) {
      throw new Error(`Linear team not found: ${input.teamKey}`)
    }

    return listTeamProjects(apiKey, team.id)
  },
})

// ── projectImport — import a project into Reeve ───────────────

registerAction({
  name: "projectImport",
  description: "Import a GitHub repo or local path as a managed project",
  input: z.object({
    repo: z.string().regex(REPO_REF_REGEX, "repo must be 'org/repo' (e.g. 'acme/app')"),
    slug: z.string(),
    projectName: z.string().optional(),
    team: z.string().min(1),
    baseBranch: z.string().min(1),
    setup: z.string().optional(),
    agent: z.enum(["codex", "claude", "auto"]).optional(),
    post: z.record(z.string(), z.string()).optional(),
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input) {
    // Physical verification: repo must exist on GitHub and be accessible.
    // Failing here is much friendlier than failing at first dispatch.
    const verifyError = await verifyRepoExists(input.repo)
    if (verifyError) {
      throw new Error(
        `Cannot access GitHub repo '${input.repo}': ${verifyError}\n` +
        `Confirm the repo exists, you have access, and 'gh auth status' passes.`,
      )
    }

    const apiKey = getLinearApiKey(ctx)
    let teamFixture: Awaited<ReturnType<typeof fetchTeams>>[number] | undefined
    let projectSlug = input.slug

    if (apiKey) {
      const teams = await fetchTeams(apiKey)
      teamFixture = teams.find(team => team.key === input.team)
      if (!teamFixture) {
        throw new Error(`Linear team not found: ${input.team}`)
      }
    }

    if (!projectSlug) {
      if (!input.projectName) {
        throw new Error("projectName is required when slug is empty")
      }
      if (!apiKey || !teamFixture) {
        throw new Error("Linear API key is required to create a project")
      }

      const ensuredProject = await ensureProjectSlug(apiKey, teamFixture, input.projectName)
      projectSlug = ensuredProject.slugId
    }

    // Persist to settings.json
    const settings = loadSettings()
    settings.projects = settings.projects ?? []

    // Avoid duplicate — merge with existing to preserve fields not in input
    const existing = settings.projects.findIndex(p => p.repo === input.repo)
    if (existing >= 0) {
      settings.projects[existing] = {
        ...settings.projects[existing],
        team: input.team,
        linear: projectSlug,
        repo: input.repo,
        baseBranch: input.baseBranch,
        ...(input.setup !== undefined && { setup: input.setup }),
        ...(input.agent !== undefined && { agent: input.agent }),
        ...(input.post !== undefined && { post: input.post }),
      }
    } else {
      settings.projects.push({
        team: input.team,
        linear: projectSlug,
        repo: input.repo,
        baseBranch: input.baseBranch,
        setup: input.setup,
        agent: input.agent,
        post: input.post,
      })
    }
    saveSettings(settings)

    // Add/update kernel runtime if daemon is running
    if (ctx.kernel) {
      try {
        ctx.kernel.addProject({
          team: input.team, slug: projectSlug, repo: input.repo,
          baseBranch: input.baseBranch,
          setup: input.setup, agent: input.agent, post: input.post,
        })
      } catch (err) {
        if (err instanceof Error && err.message.includes('already exists')) {
          ctx.kernel.updateProject(projectSlug, {
            team: input.team, repo: input.repo,
            baseBranch: input.baseBranch,
            setup: input.setup, agent: input.agent, post: input.post,
          })
        } else {
          throw err
        }
      }
    }

    // Ensure workflow states exist
    const missingStates: Array<{ name: string; error: string }> = []
    if (apiKey && teamFixture) {
      try {
        const result = await ensureWorkflowStates(apiKey, teamFixture)
        for (const m of result.missing) {
          console.warn(`[projects] could not ensure workflow state "${m.name}" on team ${teamFixture.key}: ${m.error}`)
          missingStates.push(m)
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        console.warn(`[projects] failed to ensure workflow states on team ${teamFixture.key}: ${error}`)
        missingStates.push({ name: "workflow states", error })
      }
    }

    // Auto-activate the kernel if it is idle. First successful import is
    // the implicit "start" signal — no dedicated button or endpoint.
    const kernelIdle = !ctx.kernel || ctx.kernel.lastTickAt === 0
    if (kernelIdle && ctx.onActivate) {
      void ctx.onActivate().catch((err) => {
        console.warn('[projects] auto-activation failed:', err)
      })
    }

    return { ok: true, slug: projectSlug, missingStates }
  },
})

// ── projectRemove — remove a project from settings ────────────

registerAction({
  name: "projectRemove",
  description: "Remove a project by Linear slug",
  input: z.object({
    slug: z.string().min(1),
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: { slug: string }) {
    // Remove from kernel if running
    if (ctx.kernel) {
      const removed = ctx.kernel.removeProject(input.slug)
      if (!removed) throw new Error(`Project not found: ${input.slug}`)
    }

    // Persist
    const settings = loadSettings()
    const before = settings.projects?.length ?? 0
    settings.projects = (settings.projects ?? []).filter(p => p.linear !== input.slug)
    if (settings.projects.length === before) {
      throw new Error(`Project not found in settings: ${input.slug}`)
    }
    saveSettings(settings)

    return { ok: true }
  },
})

// ── projectUpdate — update fields on an existing project ──────

registerAction({
  name: "projectUpdate",
  description: "Update settings on an existing project (agent, setup, post)",
  input: z.object({
    slug: z.string().min(1),
    agent: z.enum(["codex", "claude", "auto"]).nullish(),
    setup: z.string().nullish(),
    post: z.record(z.string(), z.string()).nullish(),
  }),
  output: z.any(),
  requiresDaemon: false,
  async handler(ctx: ActionContext, input: {
    slug: string
    agent?: string | null
    setup?: string | null
    post?: Record<string, string> | null
  }) {
    const settings = loadSettings()
    const project = (settings.projects ?? []).find(p => p.linear === input.slug)
    if (!project) throw new Error(`Project not found: ${input.slug}`)

    // null = clear field, undefined = leave unchanged
    const changes: Record<string, unknown> = {}
    if (input.agent !== undefined) {
      project.agent = input.agent === null ? undefined : input.agent as any
      changes.agent = project.agent
    }
    if (input.setup !== undefined) {
      project.setup = input.setup === null ? undefined : input.setup
      changes.setup = project.setup
    }
    if (input.post !== undefined) {
      project.post = input.post && Object.keys(input.post).length > 0 ? input.post : undefined
      changes.post = project.post
    }

    saveSettings(settings)

    // Hot-update running kernel
    if (ctx.kernel) {
      ctx.kernel.updateProject(input.slug, changes)
    }

    return { ok: true, project }
  },
})

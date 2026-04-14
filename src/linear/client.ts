// linear/client.ts — Linear GraphQL API client
// Reference: symphony-ts/src/tracker/linear-client.ts

import type { LinearConfig } from "../config"

import type { NormalizedIssue, IssueStateSnapshot, LinearIssue } from "./normalize"
import { normalizeIssue, sortIssuesForDispatch } from "./normalize"
import {
  FETCH_PROJECT_ISSUES,
  FETCH_ISSUES_BY_IDS,
  UPDATE_ISSUE_STATE,
  ADD_ISSUE_COMMENT,
  FETCH_WORKFLOW_STATES,
  FETCH_ISSUES_BY_TITLE,
  FETCH_PROJECT_BY_SLUG,
  FETCH_ISSUE_TEAM,
  FETCH_ISSUE_LABELS,
  CREATE_ISSUE,
} from "./queries"

const LINEAR_API_URL = "https://api.linear.app/graphql"

export interface CandidateIssueSnapshot {
  issues: NormalizedIssue[]
  filteredByStateType: number
}

export interface IssueBlockerSnapshot {
  id: string
  identifier: string
  state: string | null
}

export interface LinearIssueLookup {
  id: string
  identifier: string
  title: string
  state: {
    name: string
    type: string
  }
}

export interface CreateIssueInput {
  title: string
  description: string
  projectSlug: string
  stateName: string
  labelNames: string[]
}

export class LinearClient {
  private apiKey: string
  private projectSlug: string
  private activeStates: string[]
  private dispatchableStateTypes: Set<string>
  private terminalStates: string[]
  private readonly configuredStateNames: LinearConfig["stateNames"]
  private stateIdCache: Map<string, string> = new Map()
  private projectContextCache: Map<string, { projectId: string; teamId: string; teamKey: string }> = new Map()
  private issueTeamCache: Map<string, { teamId: string; teamKey: string }> = new Map()
  private log: Console = console

  constructor(config: LinearConfig) {
    this.apiKey = config.apiKey
    this.projectSlug = config.projectSlug
    this.activeStates = config.activeStates
    this.dispatchableStateTypes = new Set(
      config.dispatchableStateTypes.map(stateType => stateType.toLowerCase())
    )
    this.terminalStates = config.terminalStates
    this.configuredStateNames = config.stateNames
    this.log = console
  }

  get stateNames(): LinearConfig["stateNames"] {
    return this.configuredStateNames
  }

  /**
   * Execute a GraphQL query against Linear API
   */
  private async query<T = unknown>(gql: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": this.apiKey,
      },
      body: JSON.stringify({ query: gql, variables }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Linear API error: ${response.status} ${response.statusText} — ${body}`)
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors.map(e => e.message).join(", ")}`)
    }

    return json.data as T
  }

  /**
   * Fetch candidate issues for dispatch from the default project
   */
  async fetchCandidateIssues(): Promise<NormalizedIssue[]> {
    const snapshot = await this.fetchCandidateSnapshot()
    return snapshot.issues
  }

  /**
   * Fetch candidate issues from multiple Linear projects in parallel.
   * Each issue is tagged with its projectSlug for routing.
   */
  async fetchCandidateIssuesForSlugs(slugs: string[]): Promise<NormalizedIssue[]> {
    const snapshot = await this.fetchCandidateSnapshotForSlugs(slugs)
    return snapshot.issues
  }

  /**
   * Fetch candidate issues plus state-type filtering diagnostics.
   */
  async fetchCandidateSnapshot(): Promise<CandidateIssueSnapshot> {
    return this.fetchCandidateSnapshotForSlugs([this.projectSlug])
  }

  /**
   * Fetch candidate issues from multiple projects plus state-type filtering diagnostics.
   */
  async fetchCandidateSnapshotForSlugs(slugs: string[]): Promise<CandidateIssueSnapshot> {
    const results = await Promise.all(
      slugs.map(slug => this.fetchIssuesForSlug(slug))
    )

    return {
      issues: sortIssuesForDispatch(results.flatMap(result => result.issues)),
      filteredByStateType: results.reduce((sum, result) => sum + result.filteredByStateType, 0),
    }
  }

  /**
   * Fetch issues for a single project slug
   */
  private async fetchIssuesForSlug(slug: string): Promise<CandidateIssueSnapshot> {
    const data = await this.query<{
      issues: {
        nodes: LinearIssue[]
      }
    }>(FETCH_PROJECT_ISSUES, {
      projectSlug: slug,
      states: this.activeStates,
    })

    const normalizedIssues = data.issues.nodes.map(raw => normalizeIssue(raw, slug))
    const issues = normalizedIssues.filter(issue => this.isDispatchableIssue(issue.stateType))
    return {
      issues: sortIssuesForDispatch(issues),
      filteredByStateType: normalizedIssues.length - issues.length,
    }
  }

  private isDispatchableIssue(stateType: string): boolean {
    return this.isDispatchableStateType(stateType)
  }

  /**
   * Fetch current state for a list of issue IDs (for reconciliation)
   */
  async fetchIssueStatesByIds(ids: string[]): Promise<IssueStateSnapshot[]> {
    if (ids.length === 0) return []

    const data = await this.query<{
      issues: {
        nodes: Array<{
          id: string
          identifier: string
          state: { name: string }
        }>
      }
    }>(FETCH_ISSUES_BY_IDS, { ids })

    return data.issues.nodes.map(issue => ({
      id: issue.id,
      identifier: issue.identifier,
      state: issue.state.name,
    }))
  }

  /**
   * Update an issue's workflow state
   */
  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    const team = await this.resolveIssueTeam(issueId)
    const stateId = await this.resolveStateId(team?.teamKey ?? "", stateName)
    if (!stateId) {
      ;(this.log.warn as (...args: unknown[]) => void)({ stateName }, "Unknown state, skipping update")
      return
    }

    await this.query(UPDATE_ISSUE_STATE, { issueId, stateId })
    ;(this.log.info as (...args: unknown[]) => void)({ stateName }, "Updated issue state")
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueId: string, body: string): Promise<void> {
    await this.query(ADD_ISSUE_COMMENT, { issueId, body })
  }

  async findOpenIssueByTitle(title: string, projectSlug: string): Promise<LinearIssueLookup | null> {
    const data = await this.query<{
      issues: {
        nodes: Array<LinearIssueLookup>
      }
    }>(FETCH_ISSUES_BY_TITLE, { projectSlug, title })

    return data.issues.nodes.find(issue => !this.isTerminalState(issue.state.name)) ?? null
  }

  async createIssue(input: CreateIssueInput): Promise<{ id: string; identifier: string }> {
    const projectContext = await this.resolveProjectContext(input.projectSlug)
    const [stateId, labelIds] = await Promise.all([
      this.resolveStateId(projectContext?.teamKey ?? "", input.stateName),
      this.resolveLabelIds(input.labelNames),
    ])

    if (!projectContext) {
      throw new Error(`Unable to resolve Linear project ${input.projectSlug}`)
    }
    if (!stateId) {
      throw new Error(`Unable to resolve Linear state ${input.stateName}`)
    }

    const data = await this.query<{
      issueCreate: {
        success: boolean
        issue: {
          id: string
          identifier: string
        }
      }
    }>(CREATE_ISSUE, {
      teamId: projectContext.teamId,
      projectId: projectContext.projectId,
      stateId,
      title: input.title,
      description: input.description,
      labelIds,
    })

    if (!data.issueCreate.success) {
      throw new Error(`Linear issueCreate returned success=false for "${input.title}"`)
    }

    return data.issueCreate.issue
  }

  /**
   * Resolve a state name to its Linear ID (cached)
   */
  private async resolveStateId(teamKey: string, stateName: string): Promise<string | null> {
    if (!teamKey) return null
    const cacheKey = `${teamKey}:${stateName}`
    if (this.stateIdCache.has(cacheKey)) {
      return this.stateIdCache.get(cacheKey)!
    }

    const data = await this.query<{
      teams: {
        nodes: Array<{
          id: string
          states: {
            nodes: Array<{ id: string; name: string; type: string }>
          }
        }>
      }
    }>(FETCH_WORKFLOW_STATES, { teamKey })

    const team = data.teams.nodes[0]
    if (!team) return null

    for (const state of team.states.nodes) {
      this.stateIdCache.set(`${teamKey}:${state.name}`, state.id)
    }

    return this.stateIdCache.get(cacheKey) || null
  }

  private async resolveProjectContext(projectSlug: string): Promise<{ projectId: string; teamId: string; teamKey: string } | null> {
    if (this.projectContextCache.has(projectSlug)) {
      return this.projectContextCache.get(projectSlug)!
    }

    const data = await this.query<{
      projects: {
        nodes: Array<{
          id: string
          slugId: string
          teams: {
            nodes: Array<{
              id: string
              key: string
            }>
          }
        }>
      }
    }>(FETCH_PROJECT_BY_SLUG, { projectSlug })

    const project = data.projects.nodes[0]
    if (!project) return null
    const team = project.teams.nodes[0]
    if (!team) return null

    const context = {
      projectId: project.id,
      teamId: team.id,
      teamKey: team.key,
    }
    this.projectContextCache.set(projectSlug, context)
    return context
  }

  private async resolveIssueTeam(issueId: string): Promise<{ teamId: string; teamKey: string } | null> {
    if (this.issueTeamCache.has(issueId)) {
      return this.issueTeamCache.get(issueId)!
    }

    const data = await this.query<{
      issues: {
        nodes: Array<{
          id: string
          team?: {
            id: string
            key: string
          } | null
        }>
      }
    }>(FETCH_ISSUE_TEAM, { issueId })

    const team = data.issues.nodes[0]?.team
    if (!team) return null

    const context = { teamId: team.id, teamKey: team.key }
    this.issueTeamCache.set(issueId, context)
    return context
  }

  async resolveLabelIds(labelNames: string[]): Promise<string[]> {
    if (labelNames.length === 0) return []

    const uniqueNames = [...new Set(labelNames)]
    const data = await this.query<{
      issueLabels: {
        nodes: Array<{
          id: string
          name: string
        }>
      }
    }>(FETCH_ISSUE_LABELS, { names: uniqueNames })

    const labelsByName = new Map(data.issueLabels.nodes.map(label => [label.name, label.id]))
    const missing = uniqueNames.filter(name => !labelsByName.has(name))
    if (missing.length > 0) {
      throw new Error(`Missing Linear label(s): ${missing.join(", ")}`)
    }

    return uniqueNames.map(name => labelsByName.get(name)!)
  }

  /**
   * Check if a state name is terminal
   */
  isTerminalState(stateName: string): boolean {
    return this.terminalStates.some(
      s => s.toLowerCase() === stateName.toLowerCase()
    )
  }

  /**
   * Check whether a Linear workflow type is eligible for dispatch.
   */
  isDispatchableStateType(stateType: string): boolean {
    return this.dispatchableStateTypes.has(stateType.toLowerCase())
  }
}

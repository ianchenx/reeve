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
  FETCH_ISSUE_TEAM,
} from "./queries"

const LINEAR_API_URL = "https://api.linear.app/graphql"


export class LinearClient {
  private apiKey: string
  private dispatchableStateTypes: Set<string>
  private terminalStates: string[]
  private readonly configuredStateNames: LinearConfig["stateNames"]
  private stateIdCache: Map<string, string> = new Map()
  private issueTeamCache: Map<string, { teamId: string; teamKey: string }> = new Map()
  constructor(config: LinearConfig) {
    this.apiKey = config.apiKey
    this.dispatchableStateTypes = new Set(
      config.dispatchableStateTypes.map(stateType => stateType.toLowerCase())
    )
    this.terminalStates = config.terminalStates
    this.configuredStateNames = config.stateNames
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
   * Fetch candidate issues from multiple Linear projects in parallel.
   */
  async fetchCandidateIssuesForSlugs(slugs: string[]): Promise<NormalizedIssue[]> {
    const results = await Promise.all(
      slugs.map(slug => this.fetchIssuesForSlug(slug))
    )
    return sortIssuesForDispatch(results.flat())
  }

  private async fetchIssuesForSlug(slug: string): Promise<NormalizedIssue[]> {
    const data = await this.query<{
      issues: {
        nodes: LinearIssue[]
      }
    }>(FETCH_PROJECT_ISSUES, {
      projectSlug: slug,
      stateTypes: [...this.dispatchableStateTypes],
    })

    return sortIssuesForDispatch(data.issues.nodes.map(raw => normalizeIssue(raw, slug)))
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
    if (!stateId) return

    await this.query(UPDATE_ISSUE_STATE, { issueId, stateId })
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueId: string, body: string): Promise<void> {
    await this.query(ADD_ISSUE_COMMENT, { issueId, body })
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

  /**
   * Check if a state name is terminal
   */
  isTerminalState(stateName: string): boolean {
    return this.terminalStates.some(
      s => s.toLowerCase() === stateName.toLowerCase()
    )
  }

}

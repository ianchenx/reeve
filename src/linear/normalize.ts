// linear/normalize.ts — Normalize Linear API responses to internal types
// Reference: symphony-ts/src/tracker/linear-normalize.ts

/** Raw issue from Linear GraphQL API */
export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: number          // 0=no priority, 1=urgent, 2=high, 3=medium, 4=low
  createdAt: string
  state: {
    name: string
    type: string            // "triage" | "backlog" | "unstarted" | "started" | "completed" | "cancelled"
  }
  labels: {
    nodes: Array<{ name: string; parent?: { name: string } | null }>
  }
  parent?: {
    id: string
    identifier: string
    state: { name: string }
  } | null
  inverseRelations?: {
    nodes: Array<{
      type: string
      issue: { id: string; identifier: string; state: { name: string } }
    }>
  }
  children?: {
    nodes: Array<{
      id: string
      identifier: string
      state: { name: string }
    }>
  }
  comments?: {
    nodes: Array<{
      body: string
      user?: { name: string }
      createdAt: string
    }>
  }
}

/** Normalized issue for orchestrator consumption */
export interface NormalizedIssue {
  id: string
  identifier: string
  title: string
  description: string
  priority: number | null
  createdAt: string
  state: string
  stateType: string
  labels: string[]
  projectSlug: string         // Which Linear project this came from
  blockedBy: Array<{
    id: string
    identifier: string
    state: string | null
  }>
  comments: Array<{
    body: string
    author: string
    createdAt: string
  }>
}

/** Issue state snapshot for reconciliation */
export interface IssueStateSnapshot {
  id: string
  identifier: string
  state: string
}

/**
 * Normalize a Linear API issue to our internal format
 */
export function normalizeIssue(raw: LinearIssue, projectSlug: string): NormalizedIssue {
  const parentBlocker = (raw.parent && raw.children?.nodes.length === 0)
    ? [{
        id: raw.parent.id,
        identifier: raw.parent.identifier,
        state: raw.parent.state.name,
      }]
    : []

  const relationBlockers = (raw.inverseRelations?.nodes || [])
    .filter(r => r.type === "blocks")
    .map(r => ({
      id: r.issue.id,
      identifier: r.issue.identifier,
      state: r.issue.state.name,
    }))

  const seen = new Set<string>()
  const blockedBy = [...parentBlocker, ...relationBlockers].filter(b => {
    if (seen.has(b.id)) return false
    seen.add(b.id)
    return true
  })

  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description || "",
    priority: raw.priority === 0 ? null : raw.priority,
    createdAt: raw.createdAt,
    state: raw.state.name,
    stateType: raw.state.type,
    labels: raw.labels.nodes.map(l => l.parent ? `${l.parent.name}:${l.name}` : l.name),
    projectSlug,
    blockedBy,
    comments: (raw.comments?.nodes || []).map(c => ({
      body: c.body,
      author: c.user?.name || "unknown",
      createdAt: c.createdAt,
    })),
  }
}

/**
 * Sort issues for dispatch priority
 * Priority: urgent(1) → high(2) → medium(3) → low(4) → none(null)
 * Then by creation date (oldest first)
 */
export function sortIssuesForDispatch(issues: NormalizedIssue[]): NormalizedIssue[] {
  return issues.slice().sort((a, b) => {
    const pa = a.priority ?? Infinity
    const pb = b.priority ?? Infinity
    if (pa !== pb) return pa - pb

    const da = new Date(a.createdAt).getTime()
    const db = new Date(b.createdAt).getTime()
    if (da !== db) return da - db

    return a.identifier.localeCompare(b.identifier)
  })
}

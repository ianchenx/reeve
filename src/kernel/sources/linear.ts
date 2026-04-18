// sources/linear.ts — Linear source adapter for
// Wraps the LinearClient to implement the Source interface

import type { Source } from "../source"
import type { SourceDisposition } from "../source"
import type { SourceItem } from "../types"
import { LinearClient } from "../../linear/client"
import type { LinearConfig, ProjectConfig } from "../../config"
import { spawnPath } from "../../utils/path"

export class LinearSource implements Source {
  private client: LinearClient
  private projects: ProjectConfig[]
  private stateNames: LinearConfig["stateNames"]

  constructor(linearConfig: LinearConfig, projects: ProjectConfig[]) {
    this.client = new LinearClient(linearConfig)
    this.projects = projects
    this.stateNames = linearConfig.stateNames
  }

  async poll(): Promise<SourceItem[]> {
    const slugs = this.projects.map(p => p.slug)
    const issues = await this.client.fetchCandidateIssuesForSlugs(slugs)

    const items: SourceItem[] = []
    for (const issue of issues) {
      const project = this.projects.find(p => p.slug === issue.projectSlug)
      if (!project) {
        continue
      }
      const item: SourceItem = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        labels: issue.labels,
        priority: issue.priority,
        repo: project.repo,
        baseBranch: project.baseBranch,
      }
      items.push(item)
    }
    return items
  }

  async onStart(_item: SourceItem): Promise<void> {
    // P3: agent manages its own status via MCP (WORKFLOW.md Step 0)
  }


  async onDone(item: SourceItem, outcome: "merged" | "closed" | "failed"): Promise<void> {
    if (outcome === "merged") {
      await this.client.updateIssueState(item.id, this.stateNames.done)
    } else if (outcome === "failed") {
      // Agent is dead — move to Backlog (non-dispatchable, always exists)
      // so it stops being polled. Comment provides context.
      const backlog = this.stateNames.backlog ?? "Backlog"
      await this.client.updateIssueState(item.id, backlog)
      await this.client.addComment(item.id, `Agent failed — needs attention`)
    }
    // outcome === "closed": no action needed
  }

  async fetchDisposition(itemId: string): Promise<SourceDisposition> {
    const snapshots = await this.client.fetchIssueStatesByIds([itemId])
    const snapshot = snapshots[0]
    if (!snapshot) return "unknown"

    const name = snapshot.state.toLowerCase()

    // passive: awaiting review — no agent needed
    if (this.stateNames.inReview && name === this.stateNames.inReview.toLowerCase()) return "passive"

    // terminal: done or cancelled
    if (this.client.isTerminalState(snapshot.state)) {
      return name === this.stateNames.done.toLowerCase() ? "done" : "cancelled"
    }

    // actionable: anything else the source considers active or ready
    return "actionable"
  }

  async detectPrUrl(codeDir: string): Promise<string | undefined> {
    try {
      const proc = Bun.spawn(
        ['gh', 'pr', 'view', '--json', 'url', '--jq', '.url'],
        {
          cwd: codeDir,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            PATH: spawnPath(),
          },
        },
      )
      const exitCode = await proc.exited
      if (exitCode !== 0) return undefined
      const trimmed = (await new Response(proc.stdout).text()).trim()
      return trimmed || undefined
    } catch {
      return undefined
    }
  }
}

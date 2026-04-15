import { describe, expect, test } from "bun:test"

import { LinearClient } from "./client"
import type { LinearIssue } from "./normalize"

const baseIssue = {
  description: null,
  priority: 0,
  createdAt: "2026-03-17T00:00:00.000Z",
  labels: { nodes: [] },
  comments: { nodes: [] },
  parent: null,
} satisfies Omit<LinearIssue, "id" | "identifier" | "title" | "state">

describe("LinearClient.fetchCandidateIssuesForSlugs", () => {
  test("returns In Review issues from candidate fetch (filtering is done by orchestrator)", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
      dispatchableStateTypes: ["unstarted", "started"],
      terminalStates: ["Done", "Cancelled"],
      stateNames: {
        todo: "Todo",
        inProgress: "In Progress",
        inReview: "In Review",
        done: "Done",
        backlog: "Backlog",
      },
    })

    const query = async (): Promise<{ issues: { nodes: LinearIssue[] } }> => ({
      issues: {
        nodes: [
          {
            ...baseIssue,
            id: "review-1",
            identifier: "WOR-30",
            title: "In Review is returned for review handling",
            state: { name: "In Review", type: "started" },
          },
          {
            ...baseIssue,
            id: "started-1",
            identifier: "WOR-31",
            title: "In Progress should dispatch",
            state: { name: "In Progress", type: "started" },
          },
        ],
      },
    })

    ;(client as unknown as { query: typeof query }).query = query

    const issues = await client.fetchCandidateIssuesForSlugs(["project-slug"])

    expect(issues.map(issue => issue.identifier)).toEqual(["WOR-30", "WOR-31"])
  })
})

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

describe("LinearClient.fetchCandidateIssues", () => {
  test("returns In Review issues from candidate snapshot (filtering is done by orchestrator)", async () => {
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

    const issues = await client.fetchCandidateIssues()

    expect(issues.map(issue => issue.identifier)).toEqual(["WOR-30", "WOR-31"])
  })
})

describe("LinearClient self-heal helpers", () => {
  test("findOpenIssueByTitle ignores terminal issues", async () => {
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

    const query = async (): Promise<{
      issues: {
        nodes: Array<{
          id: string
          identifier: string
          title: string
          state: { name: string; type: string }
        }>
      }
    }> => ({
      issues: {
        nodes: [
          {
            id: "done-1",
            identifier: "WOR-80",
            title: "Self-heal: flaky test",
            state: { name: "Done", type: "completed" },
          },
          {
            id: "todo-1",
            identifier: "WOR-81",
            title: "Self-heal: flaky test",
            state: { name: "Todo", type: "unstarted" },
          },
        ],
      },
    })

    ;(client as unknown as { query: typeof query }).query = query

    const issue = await client.findOpenIssueByTitle("Self-heal: flaky test", "project-slug")

    expect(issue?.identifier).toBe("WOR-81")
  })

  test("resolveLabelIds errors when configured labels are missing", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
      dispatchableStateTypes: ["unstarted"],
      terminalStates: ["Done"],
      stateNames: {
        todo: "Todo",
        inProgress: "In Progress",
        inReview: "In Review",
        done: "Done",
        backlog: "Backlog",
      },
    })

    const query = async (): Promise<{
      issueLabels: {
        nodes: Array<{ id: string; name: string }>
      }
    }> => ({
      issueLabels: {
        nodes: [{ id: "label-1", name: "existing-label" }],
      },
    })

    ;(client as unknown as { query: typeof query }).query = query

    await expect(client.resolveLabelIds(["self-heal"])).rejects.toThrow("Missing Linear label(s): self-heal")
  })
})

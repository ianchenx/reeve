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
  test("filters out backlog-type issues even when the state name matches activeStates", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
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
    })

    const query = async (): Promise<{ issues: { nodes: LinearIssue[] } }> => ({
      issues: {
        nodes: [
          {
            ...baseIssue,
            id: "backlog-1",
            identifier: "WOR-1",
            title: "Backlog todo should not dispatch",
            state: { name: "Todo", type: "backlog" },
          },
          {
            ...baseIssue,
            id: "todo-1",
            identifier: "WOR-2",
            title: "Unstarted todo should dispatch",
            state: { name: "Todo", type: "unstarted" },
          },
          {
            ...baseIssue,
            id: "started-1",
            identifier: "WOR-3",
            title: "Started issue should remain eligible",
            state: { name: "In Progress", type: "started" },
          },
        ],
      },
    })

    ;(client as unknown as { query: typeof query }).query = query

    const issues = await client.fetchCandidateIssues()

    expect(issues.map(issue => issue.identifier)).toEqual(["WOR-2", "WOR-3"])
    expect(issues.every(issue => issue.stateType !== "backlog")).toBe(true)
  })

  test("reports how many issues were filtered by state type", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
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
    })

    const query = async (): Promise<{ issues: { nodes: LinearIssue[] } }> => ({
      issues: {
        nodes: [
          {
            ...baseIssue,
            id: "backlog-1",
            identifier: "WOR-10",
            title: "Backlog todo should not dispatch",
            state: { name: "Todo", type: "backlog" },
          },
          {
            ...baseIssue,
            id: "triage-1",
            identifier: "WOR-11",
            title: "Triage should not dispatch",
            state: { name: "Todo", type: "triage" },
          },
          {
            ...baseIssue,
            id: "todo-1",
            identifier: "WOR-12",
            title: "Unstarted todo should dispatch",
            state: { name: "Todo", type: "unstarted" },
          },
        ],
      },
    })

    ;(client as unknown as { query: typeof query }).query = query

    const snapshot = await client.fetchCandidateSnapshot()

    expect(snapshot.issues.map(issue => issue.identifier)).toEqual(["WOR-12"])
    expect(snapshot.filteredByStateType).toBe(2)
  })

  test("uses dispatchableStateTypes from config instead of hardcoded workflow types", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
      activeStates: ["Todo", "In Progress"],
      dispatchableStateTypes: ["BACKLOG", "started"],
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
            id: "backlog-1",
            identifier: "WOR-20",
            title: "Configured backlog should dispatch",
            state: { name: "Todo", type: "backlog" },
          },
          {
            ...baseIssue,
            id: "todo-1",
            identifier: "WOR-21",
            title: "Unstarted should be filtered when not configured",
            state: { name: "Todo", type: "unstarted" },
          },
          {
            ...baseIssue,
            id: "started-1",
            identifier: "WOR-22",
            title: "Started should dispatch",
            state: { name: "In Progress", type: "started" },
          },
        ],
      },
    })

    ;(client as unknown as { query: typeof query }).query = query

    const snapshot = await client.fetchCandidateSnapshot()

    expect(snapshot.issues.map(issue => issue.identifier)).toEqual(["WOR-20", "WOR-22"])
    expect(snapshot.filteredByStateType).toBe(1)
  })

  test("returns In Review issues from candidate snapshot (filtering is done by orchestrator)", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
      activeStates: ["Todo", "In Progress", "In Review"],
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

    const snapshot = await client.fetchCandidateSnapshot()

    expect(snapshot.issues.map(issue => issue.identifier)).toEqual(["WOR-30", "WOR-31"])
    expect(snapshot.filteredByStateType).toBe(0)
  })
})

describe("LinearClient self-heal helpers", () => {
  test("findOpenIssueByTitle ignores terminal issues", async () => {
    const client = new LinearClient({
      apiKey: "test",
      projectSlug: "project-slug",
      teamKey: "WOR",
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
      activeStates: ["Todo"],
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

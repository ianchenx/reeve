import { describe, expect, mock, test } from "bun:test"

import type { SourceItem } from "../types"
import { LinearSource } from "./linear"

const LINEAR_CONFIG = {
  apiKey: "lin_api_test",
  projectSlug: "test-project",
  teamKey: "TEST",
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
} as const

const PROJECTS = [
  { team: "TEST", slug: "test-project", repo: "/tmp/repo", baseBranch: "main" },
]

const ITEM: SourceItem = {
  id: "issue-1",
  identifier: "TES-1",
  title: "test",
  description: "",
  labels: [],
  priority: null,
  repo: "/tmp/repo",
  baseBranch: "main",
}

describe("LinearSource.onDone", () => {
  test("merged issues only move to Done", async () => {
    const updateIssueState = mock(async () => {})
    const addComment = mock(async () => {})
    const source = new LinearSource(LINEAR_CONFIG as any, PROJECTS as any)

    ;(source as any).client = {
      updateIssueState,
      addComment,
      isTerminalState: () => false,
    }

    await source.onDone(ITEM, "merged")

    expect(updateIssueState).toHaveBeenCalledWith("issue-1", "Done")
    expect(addComment).not.toHaveBeenCalled()
  })
})

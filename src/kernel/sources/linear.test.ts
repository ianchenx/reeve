import { describe, expect, mock, test } from "bun:test"

import type { NormalizedIssue } from "../../linear/normalize"
import type { SourceItem } from "../types"
import { LinearSource } from "./linear"

const LINEAR_CONFIG = {
  apiKey: "lin_api_test",
  projectSlug: "test-project",
  teamKey: "TEST",
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

const BASE_ISSUE: Omit<NormalizedIssue, "id" | "identifier" | "title" | "state" | "stateType"> = {
  description: "",
  priority: null,
  createdAt: "2026-04-19T00:00:00.000Z",
  labels: [],
  projectSlug: "test-project",
  blockedBy: [],
  comments: [],
}

describe("LinearSource.poll", () => {
  test("only returns actionable issues to the kernel", async () => {
    const source = new LinearSource(LINEAR_CONFIG as any, PROJECTS as any)

    ;(source as any).client = {
      fetchCandidateIssuesForSlugs: mock(async () => [
        {
          ...BASE_ISSUE,
          id: "issue-review",
          identifier: "TES-2",
          title: "Needs human review",
          state: "In Review",
          stateType: "started",
        },
        {
          ...BASE_ISSUE,
          id: "issue-todo",
          identifier: "TES-3",
          title: "Ready to dispatch",
          state: "Todo",
          stateType: "unstarted",
        },
      ]),
      isTerminalState: () => false,
    }

    const items = await source.poll()

    expect(items.map(item => item.identifier)).toEqual(["TES-3"])
  })
})

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

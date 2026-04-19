import { describe, expect, test } from "bun:test"

import { shouldShowBoardEmptyState } from "./BoardPage"

describe("shouldShowBoardEmptyState", () => {
  test("shows the empty state only for a single project with no task history", () => {
    expect(
      shouldShowBoardEmptyState({
        projectCount: 1,
        hasActive: false,
        hasQueued: false,
        hasPublished: false,
        hasCompleted: false,
      }),
    ).toBe(true)
  })

  test("hides the empty state when tasks are waiting in review", () => {
    expect(
      shouldShowBoardEmptyState({
        projectCount: 1,
        hasActive: false,
        hasQueued: false,
        hasPublished: true,
        hasCompleted: false,
      }),
    ).toBe(false)
  })

  test("hides the empty state once any completed task exists", () => {
    expect(
      shouldShowBoardEmptyState({
        projectCount: 1,
        hasActive: false,
        hasQueued: false,
        hasPublished: false,
        hasCompleted: true,
      }),
    ).toBe(false)
  })

  test("hides the empty state for multi-project setups even before the first task", () => {
    expect(
      shouldShowBoardEmptyState({
        projectCount: 2,
        hasActive: false,
        hasQueued: false,
        hasPublished: false,
        hasCompleted: false,
      }),
    ).toBe(false)
  })
})

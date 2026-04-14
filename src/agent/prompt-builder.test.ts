// prompt-builder.test.ts — Verify hardcoded prompt generation
import { describe, test, expect } from "bun:test"
import {
  buildPrompt,
  buildReviewPrompt,
  buildRetrySection,
} from "./prompt-builder"
import type { AgentTask } from "./runner"
import type { TaskTrace } from "../kernel/types"

const fakeTask: AgentTask = {
  id: "task-001",
  identifier: "TEST-1",
  title: "Fix the thing",
  description: "Something is broken",
  labels: [],
  priority: 2,
  state: "Todo",
  repo: "/tmp/fake-repo",
}

describe("buildPrompt: implement", () => {
  test("contains issue identity and description", () => {
    const prompt = buildPrompt({ task: fakeTask })

    expect(prompt).toContain("TEST-1")
    expect(prompt).toContain("Fix the thing")
    expect(prompt).toContain("Something is broken")
  })

  test("contains branch name in lowercase", () => {
    const prompt = buildPrompt({ task: fakeTask })

    expect(prompt).toContain("agent/test-1")
  })

  test("omits description block when empty", () => {
    const emptyDescTask = { ...fakeTask, description: "" }
    const prompt = buildPrompt({ task: emptyDescTask })

    expect(prompt).not.toContain("\n\n\n")
  })
})

describe("buildReviewPrompt", () => {
  test("contains review protocol and filtering rules", () => {
    const prompt = buildReviewPrompt({
      task: {
        identifier: "WOR-53",
        title: "Add review defaults",
        description: "Review prompt pipeline.",
        labels: ["feat"],
      },
      review: { round: 1, maxRounds: 2 },
    })

    expect(prompt).toContain("## Review Protocol")
    expect(prompt).toContain("## Filtering Rules")
    expect(prompt).toContain("at most 5 findings")
  })

  test("includes PR diff command when prUrl provided", () => {
    const prompt = buildReviewPrompt({
      task: {
        identifier: "WOR-53",
        title: "Test",
        description: "",
        labels: [],
      },
      review: { round: 1, maxRounds: 1 },
      prUrl: "https://github.com/org/repo/pull/42",
    })

    expect(prompt).toContain("gh pr diff")
    expect(prompt).toContain("https://github.com/org/repo/pull/42")
    expect(prompt).not.toContain("git diff origin/main")
  })

  test("falls back to origin/main diff without prUrl", () => {
    const prompt = buildReviewPrompt({
      task: {
        identifier: "WOR-53",
        title: "Test",
        description: "",
        labels: [],
      },
      review: { round: 1, maxRounds: 1 },
    })

    expect(prompt).toContain("git diff origin/main...HEAD")
    expect(prompt).not.toContain("gh pr diff")
  })

  test("includes previous feedback on round > 1", () => {
    const prompt = buildReviewPrompt({
      task: {
        identifier: "WOR-53",
        title: "Test",
        description: "",
        labels: [],
      },
      review: {
        round: 2,
        maxRounds: 3,
        previousFeedback: "Focus on coupling.",
      },
    })

    expect(prompt).toContain("Previous Review Feedback (Round 1)")
    expect(prompt).toContain("Focus on coupling.")
  })

  test("includes spec file reference when present", () => {
    const prompt = buildReviewPrompt({
      task: {
        identifier: "WOR-53",
        title: "Test",
        description: "",
        specFile: "006-review-hook.md",
        labels: [],
      },
      review: { round: 1, maxRounds: 1 },
    })

    expect(prompt).toContain("docs/specs/006-review-hook.md")
  })
})

describe("buildRetrySection", () => {
  test("includes failure reason and attempt number", () => {
    const trace: TaskTrace = {
      gateReason: "validate hook failed",
      detail: "tsc found 3 errors",
    }

    const section = buildRetrySection(trace, 2)
    expect(section).toContain("Attempt 2")
    expect(section).toContain("validate hook failed")
    expect(section).toContain("tsc found 3 errors")
  })

  test("includes diff stat when present", () => {
    const trace: TaskTrace = {
      gateReason: "test failure",
      diffStat: " src/foo.ts | 10 ++++\n src/bar.ts | 3 ---",
    }

    const section = buildRetrySection(trace, 3)
    expect(section).toContain("src/foo.ts")
    expect(section).toContain("Files touched")
  })
})

import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { testTmpDir, cleanupTestTmp } from "./test-helpers"
import { ensureHistoryIndex, readHistoryIndex, rebuildHistoryIndex, syncHistoryIndexForTask } from "./history-index"

function makeLogsDir(): { logsDir: string; indexPath: string } {
  const root = testTmpDir("reeve-history-index-")

  const logsDir = join(root, "logs")
  const indexPath = join(logsDir, "index.json")
  mkdirSync(logsDir, { recursive: true })
  return { logsDir, indexPath }
}

function writeMeta(targetDir: string, meta: Record<string, unknown>): void {
  mkdirSync(targetDir, { recursive: true })
  writeFileSync(join(targetDir, "meta.json"), JSON.stringify(meta, null, 2))
}

afterEach((): void => {
  cleanupTestTmp()
})

describe("history-index", () => {
  test("rebuilds grouped attempt history from root and archived meta files", (): void => {
    const { logsDir, indexPath } = makeLogsDir()
    const issueDir = join(logsDir, "wor-32")

    writeMeta(join(issueDir, "attempt-1"), {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 1,
      startedAt: "2026-03-18T00:00:00.000Z",
      endedAt: "2026-03-18T00:05:00.000Z",
      outcome: "failed",
    })
    writeMeta(join(issueDir, "attempt-2"), {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "claude",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 2,
      startedAt: "2026-03-18T01:00:00.000Z",
      endedAt: "2026-03-18T01:07:00.000Z",
      outcome: "failed",
    })
    writeMeta(issueDir, {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 3,
      startedAt: "2026-03-18T02:00:00.000Z",
      endedAt: "2026-03-18T02:08:00.000Z",
      outcome: "completed",
    })

    writeMeta(join(logsDir, "wor-40"), {
      issueId: "linear-2",
      identifier: "WOR-40",
      title: "Another task",
      agent: "codex",
      repo: "/tmp/repo-b",
      worktree: "/tmp/worktree-b",
      attempt: 1,
      startedAt: "2026-03-18T03:00:00.000Z",
      outcome: "failed",
    })

    const index = rebuildHistoryIndex(logsDir, indexPath)

    expect(index.items).toHaveLength(4)
    expect(index.items.map(item => item.historyId)).toEqual([
      "wor-40",
      "wor-32",
      "wor-32__attempt-2",
      "wor-32__attempt-1",
    ])
    expect(index.items.filter(item => item.issueId === "linear-1")).toHaveLength(3)
  })

  test("syncHistoryIndexForTask replaces a task's entries after a new attempt is archived", (): void => {
    const { logsDir, indexPath } = makeLogsDir()
    const issueDir = join(logsDir, "wor-32")

    writeMeta(issueDir, {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 1,
      startedAt: "2026-03-18T00:00:00.000Z",
      outcome: "failed",
    })
    rebuildHistoryIndex(logsDir, indexPath)

    writeMeta(join(issueDir, "attempt-1"), {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 1,
      startedAt: "2026-03-18T00:00:00.000Z",
      endedAt: "2026-03-18T00:05:00.000Z",
      outcome: "failed",
    })
    writeMeta(issueDir, {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "claude",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 2,
      startedAt: "2026-03-18T01:00:00.000Z",
      outcome: "failed",
    })

    const index = syncHistoryIndexForTask("wor-32", logsDir, indexPath)
    const issueItems = index.items.filter(item => item.issueId === "linear-1")

    expect(issueItems).toHaveLength(2)
    expect(issueItems.map(item => item.historyId)).toEqual(["wor-32", "wor-32__attempt-1"])
    expect(issueItems[0]?.attempt).toBe(2)
  })

  test("ensureHistoryIndex rebuilds missing index and prunes stale entries on read", (): void => {
    const { logsDir, indexPath } = makeLogsDir()
    const issueDir = join(logsDir, "wor-32")

    writeMeta(issueDir, {
      issueId: "linear-1",
      identifier: "WOR-32",
      title: "Observability retry chain",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 1,
      startedAt: "2026-03-18T00:00:00.000Z",
      outcome: "failed",
    })

    const rebuilt = ensureHistoryIndex(logsDir, indexPath)
    expect(rebuilt.items).toHaveLength(1)
    expect(existsSync(indexPath)).toBe(true)

    unlinkSync(join(issueDir, "meta.json"))
    const pruned = readHistoryIndex(indexPath, logsDir)
    expect(pruned?.items).toHaveLength(0)
    const persisted = JSON.parse(readFileSync(indexPath, "utf-8")) as { items: unknown[] }
    expect(persisted.items).toHaveLength(0)
  })

  test("indexes nested review entries with stage metadata", (): void => {
    const { logsDir, indexPath } = makeLogsDir()
    const issueDir = join(logsDir, "wor-56")

    writeMeta(issueDir, {
      issueId: "linear-56",
      identifier: "WOR-56",
      title: "Review stage badge + session visibility",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 1,
      stage: "implement",
      startedAt: "2026-03-18T00:00:00.000Z",
      outcome: "completed",
    })
    writeMeta(join(issueDir, "review"), {
      issueId: "linear-56",
      identifier: "WOR-56",
      title: "Review stage badge + session visibility",
      agent: "codex",
      repo: "/tmp/repo-a",
      worktree: "/tmp/worktree-a",
      attempt: 1,
      phase: "review",
      stage: "review",
      hookReviewRound: 2,
      startedAt: "2026-03-18T00:05:00.000Z",
      outcome: "completed",
    })

    const index = rebuildHistoryIndex(logsDir, indexPath)
    const reviewEntry = index.items.find(item => item.historyId === "wor-56__review")

    expect(reviewEntry?.phase).toBe("review")
    expect(reviewEntry?.stage).toBe("review")
    expect(reviewEntry?.hookReviewRound).toBe(2)
  })

  test("preserves token breakdown fields from meta", (): void => {
    const { logsDir, indexPath } = makeLogsDir()
    const issueDir = join(logsDir, "wor-77")

    writeMeta(issueDir, {
      issueId: "linear-77",
      identifier: "WOR-77",
      title: "Usage breakdown",
      agent: "codex",
      repo: "/tmp/repo-a",
      startedAt: "2026-03-18T00:00:00.000Z",
      tokensUsed: {
        input: 28000,
        output: 10000,
        cacheRead: 777000,
        total: 815000,
      },
    })

    const index = rebuildHistoryIndex(logsDir, indexPath)

    expect(index.items[0]?.tokensUsed).toEqual({
      input: 28000,
      output: 10000,
      cacheRead: 777000,
      total: 815000,
    })
  })
})

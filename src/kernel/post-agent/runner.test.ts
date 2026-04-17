import { describe, test, expect, afterEach } from "bun:test"
import { existsSync, readFileSync, lstatSync, mkdirSync } from "fs"
import { resolve } from "path"
import { runPostAgents } from "./runner"
import type { SpawnPostAgentFn } from "./runner"
import type { Task } from "../types"
import type { ReeveDaemonConfig } from "../../config"
import type { PostAgent } from "./types"
import { testTmpDir, cleanupTestTmp } from "../../test-helpers"

const mockConfig = {} as ReeveDaemonConfig

afterEach(() => {
  cleanupTestTmp()
})

function createMockTask(tmpDir: string): Task {
  const worktree = resolve(tmpDir, "reeve-test-fixture")
  mkdirSync(worktree, { recursive: true })
  const implementDir = resolve(tmpDir, "implement")
  mkdirSync(implementDir, { recursive: true })
  return {
    identifier: "WOR-1",
    prUrl: "https://github.com/org/repo/pull/1",
    worktree,
    taskDir: tmpDir,
    workDir: implementDir,
  } as Task
}

function mockPostAgent(name: string): PostAgent {
  return {
    name,
    buildPrompt: () => `prompt for ${name}`,
    buildRules: (repoName: string) => `# ${name} agent\nProject: ${repoName}`,
  }
}

function mockSpawnWithCode(code: number): SpawnPostAgentFn {
  return async () => ({ exitCode: code, stderr: "" })
}

const passSpawn = mockSpawnWithCode(0)
const failSpawn = mockSpawnWithCode(1)

describe("runPostAgents", () => {
  test("empty agent list returns pass", async () => {
    const tmpDir = testTmpDir("post-agent-empty-")
    const task = createMockTask(tmpDir)
    const result = await runPostAgents(task, mockConfig, [], passSpawn)
    expect(result).toEqual({ verdict: "pass", results: [] })
  })

  test("single agent exits 0 → pass", async () => {
    const tmpDir = testTmpDir("post-agent-pass-")
    const task = createMockTask(tmpDir)
    const agent = mockPostAgent("review")
    const result = await runPostAgents(task, mockConfig, [agent], passSpawn)
    expect(result).toEqual({
      verdict: "pass",
      results: [{ agent: "review", exitCode: 0 }],
    })
  })

  test("single agent exits non-zero → fail", async () => {
    const tmpDir = testTmpDir("post-agent-fail-")
    const task = createMockTask(tmpDir)
    const agent = mockPostAgent("review")
    const result = await runPostAgents(task, mockConfig, [agent], failSpawn)
    expect(result).toEqual({
      verdict: "fail",
      failedAt: "review",
      results: [{ agent: "review", exitCode: 1 }],
    })
  })

  test("two agents, first passes, second fails → fail at second", async () => {
    const tmpDir = testTmpDir("post-agent-chain-")
    const task = createMockTask(tmpDir)
    const agents = [mockPostAgent("review"), mockPostAgent("test")]
    let callCount = 0
    const mixedSpawn: SpawnPostAgentFn = async () => {
      callCount++
      return { exitCode: callCount === 1 ? 0 : 1, stderr: "" }
    }
    const result = await runPostAgents(task, mockConfig, agents, mixedSpawn)
    expect(result).toEqual({
      verdict: "fail",
      failedAt: "test",
      results: [
        { agent: "review", exitCode: 0 },
        { agent: "test", exitCode: 1 },
      ],
    })
  })

  test("creates isolated agent directory with CLAUDE.md and worktree symlink", async () => {
    const tmpDir = testTmpDir("post-agent-isolation-")
    const task = createMockTask(tmpDir)
    const agent = mockPostAgent("review")

    await runPostAgents(task, mockConfig, [agent], passSpawn)

    const agentDir = resolve(tmpDir, "review")
    expect(existsSync(agentDir)).toBe(true)
    expect(readFileSync(resolve(agentDir, "CLAUDE.md"), "utf-8")).toContain("review agent")
    expect(readFileSync(resolve(agentDir, "AGENTS.md"), "utf-8")).toContain("review agent")
    expect(lstatSync(resolve(agentDir, "reeve-test-fixture")).isSymbolicLink()).toBe(true)
  })
})

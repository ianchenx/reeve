import { describe, expect, test } from "bun:test"

import { getRuntimeHealth, getSetupEntryHealth } from "./runtime-health"

function createExecStub(entries: Record<string, { exitCode: number; stdout?: string; stderr?: string }>): typeof Bun.spawnSync {
  const encoder = new TextEncoder()
  return ((args: string[]) => {
    const key = args.join(" ")
    const entry = entries[key] ?? { exitCode: 1, stdout: "", stderr: "" }
    return {
      exitCode: entry.exitCode,
      stdout: encoder.encode(entry.stdout ?? ""),
      stderr: encoder.encode(entry.stderr ?? ""),
      pid: 1,
      signal: null,
    } as unknown as ReturnType<typeof Bun.spawnSync>
  }) as typeof Bun.spawnSync
}

describe("runtime health", () => {
  test("setup entry health only checks local prerequisites", () => {
    const execSync = createExecStub({
      "which codex": { exitCode: 0, stdout: "/usr/local/bin/codex" },
    })

    const health = getSetupEntryHealth(
      {
        linearApiKey: "lin_api_test",
        projects: [{ team: "TES", linear: "proj", repo: "ian/demo", baseBranch: "main" }],
      },
      { execSync },
    )

    expect(health.configured).toBe(true)
    expect(health.issues).toEqual([])
  })

  test("setup entry health fails when no agent CLI is installed", () => {
    const execSync = createExecStub({
      "which codex": { exitCode: 1 },
      "which claude": { exitCode: 1 },
    })

    const health = getSetupEntryHealth(
      {
        linearApiKey: "lin_api_test",
        projects: [{ team: "TES", linear: "proj", repo: "ian/demo", baseBranch: "main" }],
      },
      { execSync },
    )

    expect(health.configured).toBe(false)
    expect(health.agents.every(a => !a.installed)).toBe(true)
    expect(health.issues.some(i => i.startsWith("No coding agent installed"))).toBe(true)
  })

  test("setup entry health passes when any one agent CLI is installed", () => {
    const execSync = createExecStub({
      "which codex": { exitCode: 1 },
      "which claude": { exitCode: 0, stdout: "/usr/local/bin/claude" },
    })

    const health = getSetupEntryHealth(
      {
        linearApiKey: "lin_api_test",
        projects: [{ team: "TES", linear: "proj", repo: "ian/demo", baseBranch: "main" }],
      },
      { execSync },
    )

    expect(health.configured).toBe(true)
    expect(health.agents.find(a => a.name === "claude")?.installed).toBe(true)
    expect(health.agents.find(a => a.name === "codex")?.installed).toBe(false)
  })

  test("is runtime-ready only when key, project, Codex, and GitHub are all healthy", () => {
    const execSync = createExecStub({
      "which codex": { exitCode: 0, stdout: "/usr/local/bin/codex" },
      "gh --version": { exitCode: 0, stdout: "gh version 2.0.0" },
      "gh auth status --hostname github.com": { exitCode: 0 },
      "gh api user --jq .login": { exitCode: 0, stdout: "testuser" },
      "git config user.name": { exitCode: 0, stdout: "Ian" },
      "git config user.email": { exitCode: 0, stdout: "ian@example.com" },
      "git ls-remote https://github.com/github/gitignore.git HEAD": { exitCode: 0, stdout: "ok" },
    })

    const health = getRuntimeHealth(
      {
        linearApiKey: "lin_api_test",
        projects: [{ team: "TES", linear: "proj", repo: "ian/demo", baseBranch: "main" }],
      },
      { execSync },
    )

    expect(health.runtimeReady).toBe(true)
    expect(health.issues).toEqual([])
  })

  test("is not runtime-ready when GitHub authentication is missing", () => {
    const execSync = createExecStub({
      "which codex": { exitCode: 0, stdout: "/usr/local/bin/codex" },
      "gh --version": { exitCode: 0, stdout: "gh version 2.0.0" },
      "gh auth status --hostname github.com": { exitCode: 1, stderr: "not logged in" },
      "git config user.name": { exitCode: 0, stdout: "Ian" },
      "git config user.email": { exitCode: 0, stdout: "ian@example.com" },
      "git ls-remote https://github.com/github/gitignore.git HEAD": { exitCode: 0, stdout: "ok" },
    })

    const health = getRuntimeHealth(
      {
        linearApiKey: "lin_api_test",
        projects: [{ team: "TES", linear: "proj", repo: "ian/demo", baseBranch: "main" }],
      },
      { execSync },
    )

    expect(health.runtimeReady).toBe(false)
    expect(health.githubReady).toBe(false)
    expect(health.issues).toContain("GitHub CLI not authenticated")
  })
})

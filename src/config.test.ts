import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

import { loadConfig } from "./config"

const createdDirs: string[] = []
let savedHome: string | undefined
let savedReeveDir: string | undefined

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "reeve-config-"))
  createdDirs.push(dir)
  return dir
}

function writeSettings(homeDir: string, settings: Record<string, unknown>): void {
  const settingsDir = resolve(homeDir, ".reeve")
  mkdirSync(settingsDir, { recursive: true })
  writeFileSync(join(settingsDir, "settings.json"), JSON.stringify(settings, null, 2))
}

afterEach((): void => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  if (savedHome !== undefined) process.env.HOME = savedHome
  else delete process.env.HOME
  savedHome = undefined
  if (savedReeveDir !== undefined) process.env.REEVE_DIR = savedReeveDir
  else delete process.env.REEVE_DIR
  savedReeveDir = undefined
})

describe("loadConfig", () => {
  test("loads projects from settings.json", (): void => {
    const homeDir = createTempHome()
    writeSettings(homeDir, {
      linearApiKey: "lin_api_test",
      defaultAgent: "codex",
      projects: [
        { team: "TES", linear: "proj-1", repo: "testuser/myapp", baseBranch: "main" },
      ],
      workspace: { root: "~/custom-workspaces" },
    })

    savedHome = process.env.HOME
    savedReeveDir = process.env.REEVE_DIR
    process.env.HOME = homeDir
    delete process.env.REEVE_DIR

    const config = loadConfig()
    expect(config.linear!.apiKey).toBe("lin_api_test")
    expect(config.linear!.teamKey).toBe("TES")
    expect(config.linear!.projectSlug).toBe("proj-1")
    expect(config.agent.default).toBe("codex")
    expect(config.projects).toEqual([{ team: "TES", slug: "proj-1", repo: "testuser/myapp", baseBranch: "main" }])
    expect(config.workspace.root).toBe(resolve(homeDir, "custom-workspaces"))
  })

  test("uses defaults when settings.json is missing", (): void => {
    const homeDir = createTempHome()
    savedHome = process.env.HOME
    savedReeveDir = process.env.REEVE_DIR
    process.env.HOME = homeDir
    delete process.env.REEVE_DIR

    const config = loadConfig()
    expect(config.linear!.apiKey).toBe("")
    expect(config.agent.default).toBe("claude")
    expect(config.projects).toEqual([])
    expect(config.workspace.root).toBe(resolve(homeDir, ".reeve", "workspaces"))
  })

  test("ignores legacy ~/.config/reeve/settings.json", (): void => {
    const homeDir = createTempHome()
    const legacyDir = resolve(homeDir, ".config", "reeve")
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      join(legacyDir, "settings.json"),
      JSON.stringify({
        linearApiKey: "lin_api_legacy",
        projects: [
          { team: "LEG", linear: "legacy-proj", repo: "legacy/repo", baseBranch: "main" },
        ],
      }, null, 2),
    )

    savedHome = process.env.HOME
    savedReeveDir = process.env.REEVE_DIR
    process.env.HOME = homeDir
    delete process.env.REEVE_DIR

    const config = loadConfig()

    expect(config.linear!.apiKey).toBe("")
    expect(config.projects).toEqual([])
    expect(existsSync(resolve(homeDir, ".reeve", "settings.json"))).toBe(false)
  })
})

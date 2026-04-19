import { z } from "zod"
import { registerAction } from "./registry"
import { loadConfig, loadSettings } from "../config"
import { existsSync } from "fs"
import { resolve } from "path"
import { REEVE_DIR } from "../paths"
import { trySpawnSync } from "../utils/spawn"

registerAction({
  name: "validate",
  description: "Validate Reeve configuration files",
  input: z.object({}),
  output: z.any(),
  requiresDaemon: false,
  async handler() {
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = []

    // 1. settings.json exists
    const settingsPath = resolve(REEVE_DIR, "settings.json")
    checks.push({
      name: "settings.json exists",
      ok: existsSync(settingsPath),
      detail: settingsPath,
    })

    // 2. settings.json is valid + downstream checks
    try {
      const config = loadSettings()
      checks.push({ name: "settings.json valid", ok: true })

      // 3. Linear API key
      const hasKey = !!config.linearApiKey
      checks.push({
        name: "Linear API key",
        ok: hasKey,
        detail: hasKey ? "set" : "missing",
      })

      // 4. Projects
      const projects = config.projects ?? []
      checks.push({
        name: "projects configured",
        ok: projects.length > 0,
        detail: `${projects.length} project(s)`,
      })

      // 5. Each project repo accessible (clone exists under workspace.root)
      const { RepoStore } = await import("../workspace/repo-store")
      const repoStore = new RepoStore(loadConfig().workspace.root)
      for (const p of projects) {
        let repoPath: string | undefined
        let repoOk = false
        if (p.repo) {
          try {
            repoPath = repoStore.repoDirOf(p.repo)
            repoOk = existsSync(resolve(repoPath, ".git"))
          } catch (err) {
            checks.push({
              name: `project ${p.linear ?? p.repo}`,
              ok: false,
              detail: err instanceof Error ? err.message : String(err),
            })
            continue
          }
        }
        checks.push({
          name: `project ${p.linear ?? p.repo}`,
          ok: repoOk,
          detail: repoOk ? `cloned at ${repoPath}` : `repo not cloned: ${p.repo}`,
        })
      }

      // 6. Agent binaries
      for (const agent of ["claude", "codex"]) {
        const result = trySpawnSync(["which", agent], { stdout: "pipe", stderr: "pipe" })
        const ok = result.kind === "ok" && result.exitCode === 0
        checks.push({
          name: `agent: ${agent}`,
          ok,
          detail: ok ? "available" : "not found in PATH",
        })
      }
    } catch (err) {
      checks.push({
        name: "settings.json valid",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    }

    const allOk = checks.every(c => c.ok)
    return { ok: allOk, checks }
  },
})

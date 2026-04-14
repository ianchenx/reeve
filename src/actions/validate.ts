import { z } from "zod"
import { registerAction } from "./registry"
import { loadSettings } from "../config"
import { existsSync } from "fs"
import { resolve } from "path"
import { REEVE_DIR } from "../paths"

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

      // 5. Each project repo accessible
      for (const p of projects) {
        const repoPath = p.repo?.startsWith("/") ? p.repo : undefined
        const repoOk = repoPath ? existsSync(repoPath) : true
        checks.push({
          name: `project ${p.linear ?? p.repo}`,
          ok: repoOk,
          detail: repoOk ? "accessible" : `repo not found: ${p.repo}`,
        })
      }

      // 6. Agent binaries
      for (const agent of ["claude", "codex"]) {
        const proc = Bun.spawnSync(["which", agent], { stdout: "pipe", stderr: "pipe" })
        checks.push({
          name: `agent: ${agent}`,
          ok: proc.exitCode === 0,
          detail: proc.exitCode === 0 ? "available" : "not found in PATH",
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

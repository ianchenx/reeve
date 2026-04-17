// commands/init.ts — Global setup wizard
// Sets up Linear API key, detects agent, ensures workflow states.
// Project onboarding is handled by `reeve import`.

import * as p from "@clack/prompts"
import { mkdirSync, writeFileSync } from "fs"
import { dirname } from "path"

import { getSettingsPath, loadSettings, type ReeveSettings } from "../config"
import { ensureWorkflowStates, linearGQL, type TeamFixture } from "../project-setup"

function saveSettings(settings: ReeveSettings): void {
  const settingsPath = getSettingsPath()
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n")
}

function detectDefaultAgent(): ReeveSettings["defaultAgent"] {
  for (const name of ["codex", "claude"] as const) {
    const result = Bun.spawnSync(["which", name], { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode === 0) return name
  }
  return "codex"
}

async function fetchTeams(apiKey: string): Promise<TeamFixture[]> {
  const teamsData = await linearGQL(apiKey, `
    query { teams { nodes { id key name } } }
  `) as { teams: { nodes: TeamFixture[] } }
  return teamsData.teams.nodes
}

export async function cmdInit(): Promise<void> {
  p.intro("Reeve — Setup")

  const settings = loadSettings()
  let apiKey = settings.linearApiKey ?? ""
  if (!apiKey) {
    const apiKeyInput = await p.text({
      message: "Linear API key:",
      placeholder: "lin_api_xxxxxxxxxx",
      validate: (value) => !value?.trim() ? "Required" : undefined,
    })
    if (p.isCancel(apiKeyInput)) { p.cancel("Aborted"); process.exit(0) }
    apiKey = apiKeyInput as string
  }

  const spinner = p.spinner()
  spinner.start("Verifying...")
  try {
    const data = await linearGQL(apiKey, `query { viewer { name } }`) as { viewer: { name: string } }
    spinner.stop(`Authenticated as ${data.viewer.name}`)
  } catch (err) {
    spinner.stop("Invalid key")
    p.log.error(String(err))
    process.exit(1)
  }

  settings.linearApiKey = apiKey
  settings.defaultAgent = settings.defaultAgent ?? detectDefaultAgent()

  // Fetch teams, then let user pick
  spinner.start("Fetching Linear teams...")
  let teams: TeamFixture[]
  try {
    teams = await fetchTeams(apiKey)
    if (teams.length === 0) {
      spinner.stop("No teams found")
      process.exit(1)
    }
    spinner.stop(`Found ${teams.length} team${teams.length > 1 ? "s" : ""}`)
  } catch (err) {
    spinner.stop("Failed")
    p.log.error(String(err))
    process.exit(1)
  }

  let team: TeamFixture
  if (teams.length === 1) {
    team = teams[0]
    p.log.info(`Team: ${team.name} (${team.key})`)
  } else {
    const choice = await p.select({
      message: "Select team:",
      options: teams.map((t) => ({ value: t, label: `${t.name} (${t.key})` })),
    })
    if (p.isCancel(choice)) { p.cancel("Aborted"); process.exit(0) }
    team = choice as TeamFixture
  }

  const result = await ensureWorkflowStates(apiKey, team)
  if (result.missing.length > 0) {
    for (const m of result.missing) {
      p.log.warn(`Could not ensure workflow state "${m.name}": ${m.error}`)
    }
    p.log.warn(`Reeve needs the above state${result.missing.length > 1 ? "s" : ""} on team ${team.key}. Create ${result.missing.length > 1 ? "them" : "it"} manually in Linear or re-run with an admin API key.`)
  }

  settings.defaultTeam = team.key
  saveSettings(settings)
  p.outro(`Done — global settings saved (team: ${team.key})\n  Next: reeve import <org/repo>`)
}

// cli/commands/system.ts — System utilities: doctor, validate, version, actions, rebuild-index

import type { CAC } from 'cac'
import { resolve, dirname } from 'path'
import { readFileSync } from 'fs'
import { loadSettings } from '../../config'
import { getRuntimeHealth } from '../../runtime-health'
import { rebuildHistoryIndex } from '../../history-index'
import { executeAction, listActions } from '../../actions/registry'
import type { ActionContext } from '../../actions/types'

const REEVE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..')

export function registerSystemCommands(cli: CAC): void {
  cli.command('doctor', 'Check environment + prerequisites').action(async () => {
    console.log('reeve doctor \u2014 checking environment\n')
    const bunProc = Bun.spawnSync(['bun', '--version'], { stdout: 'pipe' })
    const bunOk = bunProc.exitCode === 0
    const bunVersion = bunOk
      ? new TextDecoder().decode(bunProc.stdout).trim()
      : 'not found'
    console.log(`  ${bunOk ? '\u2705' : '\u274c'} Bun: ${bunVersion}`)

    const settings = loadSettings()
    const health = getRuntimeHealth(settings)

    console.log(`  ${health.ghInstalled ? '\u2705' : '\u274c'} GitHub CLI (gh): ${health.ghStatusDetail}`)
    console.log(`  ${health.gitConfigured ? '\u2705' : '\u274c'} Git identity: ${health.gitConfigured ? `${health.gitUserName} <${health.gitUserEmail}>` : 'missing'}`)
    console.log(`  ${health.gitHubReachable ? '\u2705' : '\u274c'} GitHub via git: ${health.gitHubReachableDetail}`)
    console.log(`  ${health.codexInstalled ? '\u2705' : '\u274c'} Codex CLI: ${health.codexInstalled ? 'installed' : 'missing'}`)
    console.log(`  ${health.hasApiKey ? '\u2705' : '\u274c'} Linear API key: ${health.hasApiKey ? 'configured' : 'missing'}`)
    console.log(`  ${health.projectCount > 0 ? '\u2705' : '\u274c'} Projects: ${health.projectCount} configured`)

    const issues = health.issues.length + (bunOk ? 0 : 1)
    console.log(`\n${issues === 0 ? '\u2705 All checks passed' : `\u274c ${issues} issue(s) found`}`)
    process.exit(issues > 0 ? 1 : 0)
  })

  cli.command('validate', 'Validate configuration').action(async () => {
    const result = await executeAction({} as ActionContext, 'validate', {})
    if (!result.ok) {
      console.error('Validation failed:', result.error)
      process.exit(1)
    }
    const { checks } = result.data as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> }
    for (const c of checks) {
      const icon = c.ok ? '\u2713' : '\u2717'
      console.log(`  ${icon} ${c.name}${c.detail ? ` \u2014 ${c.detail}` : ''}`)
    }
    const allOk = checks.every((c: { ok: boolean }) => c.ok)
    console.log(allOk ? '\nAll checks passed' : '\nSome checks failed')
    if (!allOk) process.exit(1)
  })

  cli.command('rebuild-index', 'Rebuild the history index').action(() => {
    const index = rebuildHistoryIndex()
    console.log(
      `Indexed ${index.items.length} history entr${index.items.length === 1 ? 'y' : 'ies'}`,
    )
  })

  cli.command('actions', 'List available actions').action(async (opts: { json: boolean }) => {
    const actions = listActions()
    if (opts.json) {
      process.stdout.write(JSON.stringify(actions, null, 2) + '\n')
      return
    }
    console.log('Available actions:\n')
    for (const a of actions) {
      const badge = a.requiresDaemon ? '\ud83d\udd34 daemon' : '\ud83d\udfe2 local'
      console.log(`  ${a.name.padEnd(20)} ${badge.padEnd(12)} ${a.description}`)
    }
  })

  cli.command('version', 'Show version').action(() => {
    try {
      const pkg = JSON.parse(readFileSync(resolve(REEVE_ROOT, 'package.json'), 'utf-8'))
      console.log(`reeve ${pkg.version}`)
    } catch {
      console.log('reeve (unknown version)')
    }
  })
}

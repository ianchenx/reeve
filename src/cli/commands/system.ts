// cli/commands/system.ts — System utilities: doctor, validate, version, actions, rebuild-index

import type { CAC } from 'cac'
import { resolve, dirname } from 'path'
import { readFileSync } from 'fs'
import pc from 'picocolors'
import { loadSettings } from '../../config'
import { getRuntimeHealth } from '../../runtime-health'
import { rebuildHistoryIndex } from '../../history-index'
import { executeAction, listActions } from '../../actions/registry'
import type { ActionContext } from '../../actions/types'

const REEVE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..')

type DoctorRow = { ok: boolean; label: string; detail: string; fix?: string[] }

function renderDoctor(rows: DoctorRow[]): void {
  const labelWidth = Math.max(...rows.map((r) => r.label.length))
  for (const r of rows) {
    const icon = r.ok ? pc.green('\u2705') : pc.red('\u274c')
    const label = r.label.padEnd(labelWidth)
    const detail = r.ok ? pc.dim(r.detail) : pc.red(r.detail)
    console.log(`  ${icon}  ${label}  ${detail}`)
    if (!r.ok && r.fix) {
      for (const line of r.fix) {
        console.log(`      ${pc.cyan('\u21b3')} ${pc.bold(line)}`)
      }
    }
  }
}

export function registerSystemCommands(cli: CAC): void {
  cli.command('doctor', 'Check environment + prerequisites').action(async () => {
    console.log(`${pc.bold('reeve doctor')}${pc.dim(' \u2014 checking environment')}\n`)

    const bunProc = Bun.spawnSync(['bun', '--version'], { stdout: 'pipe' })
    const bunOk = bunProc.exitCode === 0
    const bunVersion = bunOk
      ? new TextDecoder().decode(bunProc.stdout).trim()
      : 'not found'

    const settings = loadSettings()
    const health = getRuntimeHealth(settings)

    const rows: DoctorRow[] = [
      {
        ok: bunOk,
        label: 'Bun',
        detail: bunVersion,
        fix: bunOk ? undefined : ['curl -fsSL https://reeve.run/install.sh | bash'],
      },
      {
        ok: health.ghInstalled && health.ghAuthenticated,
        label: 'GitHub CLI (gh)',
        detail: health.ghStatusDetail,
        fix: !health.ghInstalled
          ? ['brew install gh   (or see https://cli.github.com)']
          : !health.ghAuthenticated
            ? ['gh auth login']
            : undefined,
      },
      {
        ok: health.gitConfigured,
        label: 'Git identity',
        detail: health.gitConfigured
          ? `${health.gitUserName} <${health.gitUserEmail}>`
          : 'missing',
        fix: health.gitConfigured
          ? undefined
          : [
              'git config --global user.name  "Your Name"',
              'git config --global user.email "you@example.com"',
            ],
      },
      {
        ok: health.gitHubReachable,
        label: 'GitHub via git',
        detail: health.gitHubReachableDetail,
        fix: health.gitHubReachable ? undefined : ['Check your network / proxy'],
      },
      (() => {
        const installed = health.agents.filter(a => a.installed).map(a => a.name)
        const missing = health.agents.filter(a => !a.installed).map(a => a.name)
        const ok = installed.length > 0
        return {
          ok,
          label: 'Coding agent',
          detail: ok
            ? `installed: ${installed.join(', ')}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`
            : `none installed (need one of: ${health.agents.map(a => a.name).join(', ')})`,
          fix: ok ? undefined : ['npm i -g @anthropic-ai/claude-code   (or install codex)'],
        }
      })(),
      {
        ok: health.hasApiKey,
        label: 'Linear API key',
        detail: health.hasApiKey ? 'configured' : 'missing',
        fix: health.hasApiKey ? undefined : ['reeve init'],
      },
      {
        ok: health.projectCount > 0,
        label: 'Projects',
        detail: `${health.projectCount} configured`,
        fix: health.projectCount > 0 ? undefined : ['reeve import <org/repo>'],
      },
    ]

    renderDoctor(rows)

    const issues = rows.filter((r) => !r.ok).length
    console.log()
    if (issues === 0) {
      console.log(pc.green('\u2705 All checks passed'))
    } else {
      console.log(
        `${pc.red(`\u274c ${issues} issue${issues > 1 ? 's' : ''} found`)}` +
          pc.dim(' \u2014 run the commands above, then re-run ') +
          pc.bold('reeve doctor'),
      )
    }
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

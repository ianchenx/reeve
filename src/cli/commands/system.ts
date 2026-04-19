// cli/commands/system.ts — System utilities: doctor

import type { CAC } from 'cac'
import pc from 'picocolors'
import { loadSettings } from '../../config'
import { getRuntimeHealth } from '../../runtime-health'
import { executeAction } from '../../actions/registry'
import type { ActionContext } from '../../actions/types'
import { ghInstallHint } from '../../utils/platform-hints'
import { trySpawnSync } from '../../utils/spawn'

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
  cli
    .command('doctor', 'Check environment + prerequisites')
    .option('--strict', 'Additional strict checks (repos cloned, agent binaries)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { strict?: boolean; json?: boolean }) => {
      const settings = loadSettings()
      const health = getRuntimeHealth(settings)

      const bunProbe = trySpawnSync(['bun', '--version'], { stdout: 'pipe' })
      const bunOk = bunProbe.kind === 'ok' && bunProbe.exitCode === 0
      const bunVersion = bunOk && bunProbe.kind === 'ok'
        ? bunProbe.stdout?.toString().trim() || 'not found'
        : 'not found'

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
            ? ghInstallHint()
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
          fix: health.projectCount > 0 ? undefined : ['reeve project add <org/repo>'],
        },
      ]

      if (opts.strict) {
        const result = await executeAction({} as ActionContext, 'validate', {})
        if (result.ok) {
          const { checks } = result.data as {
            checks: Array<{ name: string; ok: boolean; detail?: string }>
          }
          for (const c of checks) {
            rows.push({
              ok: c.ok,
              label: `[strict] ${c.name}`,
              detail: c.detail ?? (c.ok ? 'ok' : 'failed'),
            })
          }
        } else {
          rows.push({
            ok: false,
            label: '[strict] validate',
            detail: result.error ?? 'action failed',
          })
        }
      }

      const allOk = rows.every(r => r.ok)

      if (opts.json) {
        const payload = {
          ok: allOk,
          checks: rows.map(r => ({ label: r.label, ok: r.ok, detail: r.detail })),
        }
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
        process.exit(allOk ? 0 : 1)
      }

      console.log(`${pc.bold('reeve doctor')}${pc.dim(' \u2014 checking environment')}\n`)
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
      process.exit(allOk ? 0 : 1)
    })

}

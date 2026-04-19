// cli/commands/update.ts — Self-upgrade to latest reeve-ai on npm.

import type { CAC } from 'cac'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { StateStore } from '../../kernel/state'
import { REEVE_DIR } from '../../paths'
import { readPid } from '../../daemon-pid'
import { hasNewerVersion } from '../../update-check'
import type { Task } from '../../kernel/types'
import { detectInstallSource, upgradeCommandFor, type InstallSource } from '../../install-source'

const REEVE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..')

// ── Pure planning (testable) ─────────────────────────────

export type UpdatePlan =
  | { kind: 'already-latest'; current: string }
  | { kind: 'no-daemon'; current: string; latest: string }
  | { kind: 'idle-daemon'; current: string; latest: string; pid: number }
  | { kind: 'active-daemon'; current: string; latest: string; pid: number; active: Task[] }

export function planUpdate(input: {
  current: string
  latest: string
  daemonPid: number | null
  activeTasks: Task[]
}): UpdatePlan {
  const { current, latest, daemonPid, activeTasks } = input
  if (!hasNewerVersion(current, latest)) {
    return { kind: 'already-latest', current }
  }
  if (daemonPid === null) {
    return { kind: 'no-daemon', current, latest }
  }
  if (activeTasks.length === 0) {
    return { kind: 'idle-daemon', current, latest, pid: daemonPid }
  }
  return { kind: 'active-daemon', current, latest, pid: daemonPid, active: activeTasks }
}

// ── Runtime helpers ──────────────────────────────────────

function readCurrentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(REEVE_ROOT, 'package.json'), 'utf-8'))
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch('https://registry.npmjs.org/reeve-ai/latest', {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

function readActiveTasks(): Task[] {
  const path = resolve(REEVE_DIR, 'state.json')
  if (!existsSync(path)) return []
  const store = new StateStore(path)
  store.load()
  return store.all().filter((t) => t.state === 'active')
}

async function runUpgrade(source: InstallSource): Promise<number> {
  const cmd = upgradeCommandFor(source)
  if (!cmd) {
    console.error(pc.red('error: running from a dev checkout — upgrade with `git pull`'))
    return 1
  }
  const proc = Bun.spawn(cmd, { stdout: 'inherit', stderr: 'inherit' })
  await proc.exited
  return proc.exitCode ?? 1
}

async function runStop(): Promise<number> {
  const proc = Bun.spawn(['reeve', 'stop'], { stdout: 'inherit', stderr: 'inherit' })
  await proc.exited
  return proc.exitCode ?? 1
}

async function runStart(): Promise<number> {
  const proc = Bun.spawn(['reeve', 'start'], { stdout: 'inherit', stderr: 'inherit' })
  await proc.exited
  return proc.exitCode ?? 1
}

// ── Command implementation ──────────────────────────────

async function cmdUpdate(opts: { check: boolean }): Promise<void> {
  const current = readCurrentVersion()
  const latest = await fetchLatestVersion()
  const source = detectInstallSource()

  if (!latest) {
    console.error(pc.red('error: could not reach npm registry'))
    const cmd = upgradeCommandFor(source)
    if (cmd) {
      console.error(pc.dim(`       check network, or run manually: ${cmd.join(' ')}`))
    } else {
      console.error(pc.dim('       running from dev checkout — use git pull'))
    }
    process.exit(1)
  }

  const plan = planUpdate({
    current,
    latest,
    daemonPid: readPid(),
    activeTasks: readActiveTasks(),
  })

  if (opts.check) {
    if (plan.kind === 'already-latest') {
      console.log(`${pc.green('\u2705')} reeve v${current} is up to date`)
    } else {
      console.log(
        `${pc.bold('reeve')} v${current} ${pc.dim('\u2192')} v${latest} ${pc.dim('available')}`,
      )
      console.log(pc.dim('      run ') + pc.bold('reeve update') + pc.dim(' to upgrade'))
    }
    return
  }

  if (plan.kind === 'already-latest') {
    console.log(`${pc.green('\u2705')} reeve v${current} is already the latest version`)
    return
  }

  if (plan.kind === 'active-daemon') {
    console.log(pc.yellow(`\u26a0\ufe0f  ${plan.active.length} active task${plan.active.length > 1 ? 's' : ''} running:`))
    for (const task of plan.active) {
      const label = task.identifier ?? task.id
      console.log(`   ${pc.dim('\u2022')} ${pc.bold(label)}`)
    }
    console.log()
    const cmd = upgradeCommandFor(source)
    const cmdStr = cmd ? cmd.join(' ') : 'git pull'
    console.log(pc.dim('   Safest: wait for tasks to finish, then run:'))
    console.log(`      ${pc.bold(`reeve stop && ${cmdStr} && reeve start`)}`)
    console.log()
    const proceed = await p.confirm({
      message: 'Upgrade binary now? (daemon keeps running the old version until you restart it manually)',
      initialValue: false,
    })
    if (p.isCancel(proceed) || !proceed) {
      console.log(pc.dim('Cancelled.'))
      return
    }
    const code = await runUpgrade(source)
    if (code !== 0) {
      console.error(pc.red(`\n\u274c upgrade failed (exit ${code})`))
      process.exit(code)
    }
    console.log(`\n${pc.green('\u2705')} Updated to v${latest}`)
    console.log(
      pc.yellow('\u26a0\ufe0f  daemon still running v' + current + ' \u2014 run ') +
        pc.bold('reeve restart') +
        pc.yellow(' when tasks finish to apply the update.'),
    )
    return
  }

  const cmd = upgradeCommandFor(source)
  const cmdStr = cmd ? cmd.join(' ') : 'git pull'
  console.log(`${pc.bold('reeve')} v${current} ${pc.dim('\u2192')} v${latest}`)
  console.log(pc.dim(`Upgrading via ${cmdStr}...\n`))

  if (plan.kind === 'idle-daemon') {
    console.log(pc.dim('   daemon is running with no active tasks \u2014 will restart after upgrade'))
  }

  const code = await runUpgrade(source)
  if (code !== 0) {
    console.error(pc.red(`\n\u274c upgrade failed (exit ${code})`))
    process.exit(code)
  }

  if (plan.kind === 'idle-daemon') {
    console.log(pc.dim('\nRestarting daemon...'))
    await runStop()
    const startCode = await runStart()
    if (startCode !== 0) {
      console.error(pc.yellow(`\u26a0\ufe0f  daemon restart failed \u2014 run 'reeve start' manually`))
      process.exit(startCode)
    }
    console.log(`\n${pc.green('\u2705')} Updated to v${latest} (daemon restarted)`)
  } else {
    console.log(`\n${pc.green('\u2705')} Updated to v${latest}`)
  }
}

// ── Registration ────────────────────────────────────────

export function registerUpdateCommand(cli: CAC): void {
  cli
    .command('update', 'Upgrade reeve-ai to the latest version on npm')
    .option('--check', 'Check for updates without installing')
    .action(async (opts: { check?: boolean }) => {
      await cmdUpdate({ check: Boolean(opts.check) })
    })
}

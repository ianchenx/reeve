// cli/commands/lifecycle.ts — Daemon lifecycle: init, start, run, stop, restart

import type { CAC } from 'cac'
import { resolve, dirname } from 'path'
import { existsSync, readFileSync, openSync } from 'fs'
import { Hono } from 'hono'
import { loadConfig, getSettingsPath, loadSettings } from '../../config'
import { getRuntimeHealth } from '../../runtime-health'
import { createApiApp, serveSpa } from '../../kernel/server'
import { printAnimatedBanner, printStaticLogo, renderBox } from '../../kernel/banner'
import { readPid, writePid, removePid } from '../../daemon-pid'

const REEVE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..')
const DIST_DIR = new URL('../../../dashboard/dist', import.meta.url).pathname

// ── Kernel bootstrap ─────────────────────────────────────

function preflight(): { ready: boolean; issues: string[] } {
  const health = getRuntimeHealth(loadSettings())
  return { ready: health.runtimeReady, issues: health.issues }
}

async function printStartBanner(config: ReturnType<typeof loadConfig>): Promise<void> {
  const repos = config.projects.map((p: { repo: string }) => p.repo).join(', ')
  let version = '0.0.0'
  try {
    const pkg = JSON.parse(readFileSync(resolve(REEVE_ROOT, 'package.json'), 'utf-8'))
    version = pkg.version
  } catch { /* fallback to 0.0.0 */ }
  await printAnimatedBanner({
    repos,
    dashboardUrl: config.dashboard.enabled
      ? `http://localhost:${config.dashboard.port}`
      : undefined,
    version,
  })
}

async function createRuntimeKernel(config: ReturnType<typeof loadConfig>) {
  const { Kernel } = await import('../../kernel/kernel')

  let source
  switch (config.source) {
    case 'linear': {
      if (!config.linear) throw new Error('Linear config is required when source is "linear"')
      const { LinearSource } = await import('../../kernel/sources/linear')
      source = new LinearSource(config.linear, config.projects)
      break
    }
    default:
      throw new Error(`Unknown source type: ${config.source}`)
  }

  const kernel = new Kernel(source, config, {
    maxRounds: config.agent.maxRounds,
    pollIntervalMs: config.polling.intervalMs,
    stallTimeoutMs: config.agent.stallTimeoutMs,
    turnTimeoutMs: config.agent.turnTimeoutMs,
    agentDefault: config.agent.default,
    dashboardPort: config.dashboard.port,
    dashboardEnabled: config.dashboard.enabled,
  })

  return {
    kernel,
    projects: config.projects.map((p: { slug: string; repo: string }) => ({
      slug: p.slug,
      repo: p.repo,
    })),
  }
}

// ── Command implementations ──────────────────────────────

async function cmdInit(): Promise<void> {
  const { cmdInit: runInit } = await import('../../commands/init')
  return runInit()
}

async function cmdStart(): Promise<void> {
  const existingPid = readPid()
  if (existingPid) {
    console.error(`reeve is already running (pid: ${existingPid}). Run 'reeve stop' first.`)
    process.exit(1)
  }

  const config = loadConfig()
  const { ready, issues } = preflight()
  if (!ready) {
    console.error(`reeve start blocked: setup incomplete`)
    for (const issue of issues) {
      console.error(`  - ${issue}`)
    }
    console.error(`Run 'reeve doctor' for full diagnostics.`)
    process.exit(1)
  }

  const cliPath = new URL(import.meta.url).pathname
  const logDir = resolve(getSettingsPath(), '..', 'logs')
  if (!existsSync(logDir)) {
    const { mkdirSync } = await import('fs')
    mkdirSync(logDir, { recursive: true })
  }
  const logPath = resolve(logDir, 'daemon.log')
  const logFd = openSync(logPath, 'a')

  // Resolve PATH from user's login shell so daemon inherits the same tools
  let daemonPath = process.env.PATH ?? ''
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = Bun.spawnSync([shell, '-l', '-c', 'echo $PATH'], { stdout: 'pipe' })
    const loginPath = new TextDecoder().decode(result.stdout).trim()
    if (loginPath) daemonPath = loginPath
  } catch { /* fall back to current PATH */ }

  // Fork daemon — it must enter via app.ts `run` command
  const appPath = resolve(dirname(cliPath), '..', 'app.ts')
  const child = Bun.spawn(['bun', 'run', appPath, 'run'], {
    stdout: logFd,
    stderr: logFd,
    stdin: 'ignore',
    detached: true,
    env: { ...process.env, PATH: daemonPath },
  })
  child.unref()
  writePid(child.pid)

  await Bun.sleep(500)
  try {
    process.kill(child.pid, 0)
  } catch {
    removePid()
    console.error(`reeve failed to start (pid ${child.pid} exited immediately)`)
    console.error(`  Check log: ${logPath}`)
    const tail = Bun.spawnSync(['tail', '-n', '5', logPath])
    process.stderr.write(tail.stdout)
    process.exit(1)
  }

  printStaticLogo()
  const BOLD = '\x1b[1m'
  const RESET = '\x1b[0m'
  const DIM = '\x1b[2m'
  console.log(renderBox([
    `${BOLD}reeve${RESET} started ${DIM}(pid: ${child.pid})${RESET}`,
    '',
    `Dashboard  http://localhost:${config.dashboard.port}`,
    `Log        ${logPath}`,
    `Stop       reeve stop`,
  ]))
}

async function cmdRun(opts: { poll: boolean }): Promise<void> {
  const { suppressUpdateNotification } = await import('../context')
  suppressUpdateNotification()

  const noPoll = !opts.poll

  const config = loadConfig()
  const { ready, issues } = preflight()

  let runtime = await createRuntimeKernel(config)
  let activationPromise: Promise<typeof runtime> | null = null

  const activateRuntime = async () => {
    if (runtime.kernel.lastTickAt > 0) return runtime
    if (!activationPromise) {
      activationPromise = (async () => {
        const nextConfig = loadConfig()
        const { ready: nextReady, issues: nextIssues } = preflight()
        if (!nextReady) {
          throw new Error(`Setup incomplete: ${nextIssues.join(', ')}`)
        }

        const nextRuntime = await createRuntimeKernel(nextConfig)
        await printStartBanner(nextConfig)
        await nextRuntime.kernel.start()
        runtime = nextRuntime
        return nextRuntime
      })().finally(() => {
        activationPromise = null
      })
    }
    return activationPromise
  }

  const startDashboardServer = (port: number, mountSpa: boolean): ReturnType<typeof Bun.serve> => {
    let currentKernel = runtime.kernel
    let currentProjects = runtime.projects

    const apiApp = createApiApp({
      getCtx: () => ({
        kernel: currentKernel,
        config: currentKernel.getConfig(),
        projects: currentProjects,
      }),
      onActivate: async () => {
        const nextRuntime = await activateRuntime()
        currentKernel = nextRuntime.kernel
        currentProjects = nextRuntime.projects
      },
    })

    const app = new Hono()
    app.route('/api', apiApp)
    if (mountSpa) {
      app.use('*', serveSpa(DIST_DIR))
    }

    return Bun.serve({
      port,
      hostname: process.env.REEVE_HOST || '0.0.0.0',
      idleTimeout: 120,
      fetch(req, server) {
        if (new URL(req.url).pathname === '/api/events') {
          server.timeout(req, 0)
        }
        return app.fetch(req, server)
      },
    })
  }

  if (!ready || noPoll) {
    if (!config.dashboard.enabled) {
      console.log(`\n   Enable dashboard in settings to use setup/dev shell mode.`)
      process.exit(1)
    }

    if (!ready) {
      console.log(`\n\u26a0\ufe0f  Setup incomplete:`)
      for (const issue of issues) console.log(`   \u2022 ${issue}`)
      console.log(`\n\ud83c\udf10 Starting setup mode\u2026`)
      console.log(`   Complete setup at http://localhost:${config.dashboard.port}\n`)
    } else {
      console.log(`\n\ud83d\udee0\ufe0f  Starting development shell\u2026`)
      console.log(`   API: http://localhost:${config.dashboard.port}`)
      console.log(`   Polling stays off until you click "Start Reeve".\n`)
    }

    startDashboardServer(config.dashboard.port, !ready)

    let shuttingDown = false
    const graceful = async () => {
      if (shuttingDown) return
      shuttingDown = true
      if (runtime.kernel.lastTickAt > 0) {
        await runtime.kernel.shutdown()
      }
      process.exit(0)
    }
    process.on('SIGINT', graceful)
    process.on('SIGTERM', graceful)
    return
  }

  if (config.dashboard.enabled) {
    startDashboardServer(config.dashboard.port, true)
  }

  let stopRenderer: (() => void) | null = null
  if (process.stdout.isTTY) {
    const { createTTYRenderer } = await import('../../kernel/tty-renderer')
    stopRenderer = createTTYRenderer((fn) => runtime.kernel.onSSE(fn))
  }

  await printStartBanner(config)
  await runtime.kernel.start()

  let shuttingDown = false
  const graceful = async () => {
    if (shuttingDown) {
      runtime.kernel.forceShutdown()
      stopRenderer?.()
      process.exit(1)
    }
    shuttingDown = true
    await runtime.kernel.shutdown()
    stopRenderer?.()
    removePid()
    process.exit(0)
  }
  process.on('SIGINT', graceful)
  process.on('SIGTERM', graceful)
}

async function cmdStop(): Promise<void> {
  const config = loadConfig()
  const port = config.dashboard.port
  let pid = readPid()

  // Fallback: check legacy PID file location (~/.config/reeve/reeve.pid)
  if (!pid) {
    const legacyPidPath = resolve(process.env.HOME || '/tmp', '.config', 'reeve', 'reeve.pid')
    try {
      const { readFileSync: readFs, unlinkSync: unlinkFs } = await import('fs')
      const raw = readFs(legacyPidPath, 'utf-8').trim()
      const legacyPid = parseInt(raw, 10)
      if (!isNaN(legacyPid)) {
        pid = legacyPid
        try { unlinkFs(legacyPidPath) } catch {}
      }
    } catch {}
  }

  if (!pid) {
    // Last resort: find by port
    try {
      const proc = Bun.spawnSync(['lsof', '-ti', `:${port}`], { stdout: 'pipe' })
      const portPid = parseInt(new TextDecoder().decode(proc.stdout).trim(), 10)
      if (!isNaN(portPid)) {
        process.kill(portPid, 'SIGTERM')
        console.log(`reeve stopped (pid: ${portPid}, found by port ${port})`)
        removePid()
        return
      }
    } catch {}
    console.log('reeve is not running')
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
    removePid()
    console.log(`reeve stopped (pid: ${pid})`)
  } catch {
    removePid()
    console.log('reeve is not running (stale pid cleaned)')
  }
}

async function cmdRestart(): Promise<void> {
  await cmdStop()
  await new Promise((r) => setTimeout(r, 500))
  await cmdStart()
}

// ── Registration ─────────────────────────────────────────

export function registerLifecycleCommands(cli: CAC): void {
  cli
    .command('init', 'Interactive setup wizard')
    .action(async () => {
      await cmdInit()
    })

  cli.command('start', 'Start daemon in background').action(async () => {
    await cmdStart()
  })

  cli
    .command('run', 'Start in foreground (Ctrl+C to stop)')
    .option('--no-poll', 'Start dashboard shell without polling')
    .action(async (opts: { poll: boolean }) => {
      await cmdRun(opts)
    })

  cli.command('stop', 'Stop daemon').action(async () => {
    await cmdStop()
  })

  cli.command('restart', 'Stop + start daemon').action(async () => {
    await cmdRestart()
  })
}

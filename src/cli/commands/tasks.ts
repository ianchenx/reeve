// cli/commands/tasks.ts — Task operations: status, task list/show/log/cancel/history/clean

import type { CAC } from 'cac'
import { resolve } from 'path'
import { existsSync, rmSync } from 'fs'
import type { Task } from '../../kernel/types'
import { runAction } from '../context'
import { sanitizeTaskIdentifier, taskDir, LOGS_DIR } from '../../paths'
import { getSettingsPath } from '../../config'

// ── Formatters ───────────────────────────────────────────

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h${mins % 60}m`
}

function stateIcon(state: string): string {
  switch (state) {
    case 'queued':   return '\u23f3'
    case 'active':   return '\ud83d\udfe2'
    case 'published': return '\ud83d\udce6'
    case 'done':     return '\u2705'
    default:         return '\u2753'
  }
}

// ── Registration ─────────────────────────────────────────

export function registerTaskCommands(cli: CAC): void {
  cli.command('status', 'Task state counts').action(async (opts: { json: boolean }) => {
    await runAction('status', {}, { json: opts.json }, (data: unknown) => {
      const status = data as Record<string, number>
      console.log('reeve status:')
      for (const [state, count] of Object.entries(status)) {
        if (state === 'total') continue
        console.log(`  ${stateIcon(state)} ${state}: ${count}`)
      }
      console.log(`  total: ${status.total}`)
    })
  })

  cli.command('task list', 'List all tasks').action(async (opts: { json: boolean }) => {
    await runAction('taskList', {}, { json: opts.json }, (data: unknown) => {
      const tasks = data as Task[]
      if (tasks.length === 0) {
        console.log('No tasks')
        return
      }
      for (const t of tasks) {
        const age = t.startedAt ? elapsed(t.startedAt) : ''
        console.log(
          `${stateIcon(t.state)} ${t.identifier.padEnd(12)} ${t.state.padEnd(10)} ${(t.agent ?? '').padEnd(8)} ${age.padEnd(6)} ${t.title}`,
        )
      }
    })
  })

  cli
    .command('task show <identifier>', 'Show a single task')
    .action(async (identifier: string, opts: { json: boolean }) => {
      await runAction('taskDetail', { id: identifier }, { json: opts.json })
    })

  cli
    .command('task log [identifier]', 'Inspect session or daemon logs')
    .option('-n <lines>', 'Limit how many lines are shown')
    .option('-f, --follow', 'Follow the logs')
    .option('--daemon', 'Show daemon runtime log instead of per-task session log')
    .action(async (
      identifier: string | undefined,
      opts: { n: number; follow: boolean; daemon: boolean; json: boolean },
    ) => {
      // Daemon runtime log branch (replaces former `logs` command)
      if (opts.daemon) {
        const logPath = resolve(getSettingsPath(), '..', 'logs', 'daemon.log')
        if (!existsSync(logPath)) {
          console.error('No daemon log found. Start with: reeve start')
          process.exit(1)
        }
        if (opts.follow) {
          const tail = Bun.spawn(['tail', '-f', '-n', String(opts.n ?? 30), logPath], {
            stdout: 'inherit',
            stderr: 'inherit',
          })
          process.on('SIGINT', () => { tail.kill(); process.exit(0) })
        } else {
          const tail = Bun.spawnSync(['tail', '-n', String(opts.n ?? 30), logPath])
          process.stdout.write(tail.stdout)
        }
        return
      }

      // Task session log branch (replaces former `log` command)
      if (opts.follow) {
        const logFile = resolve(LOGS_DIR, 'session.jsonl')
        const tailArgs = ['tail', '-f', logFile]
        const proc = Bun.spawn(tailArgs, { stdout: 'pipe', stderr: 'inherit' })
        const reader = proc.stdout?.getReader()
        const decoder = new TextDecoder()
        if (!reader) { console.error('Cannot read log file'); return }
        process.on('SIGINT', () => { proc.kill(); process.exit(0) })
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value)
          for (const line of text.split('\n').filter(Boolean)) {
            try {
              const e = JSON.parse(line)
              if (identifier && e.identifier !== identifier && e.taskId !== identifier) continue
              console.log(JSON.stringify(e))
            } catch { /* skip malformed */ }
          }
        }
        return
      }

      await runAction('log', { task: identifier, tail: opts.n ?? 20 }, { json: opts.json }, (data: unknown) => {
        for (const e of data as Array<Record<string, unknown>>) {
          console.log(JSON.stringify(e))
        }
      })
    })

  cli
    .command('task cancel <identifier>', 'Cancel a running task')
    .action(async (identifier: string, opts: { json: boolean }) => {
      await runAction('cancel', { id: identifier }, { json: opts.json }, () => {
        console.log(`Cancelled: ${identifier}`)
      })
    })

  cli
    .command('task history [identifier]', 'Show task history')
    .action(async (identifier: string | undefined, opts: { json: boolean }) => {
      if (identifier) {
        await runAction('historyDetail', { id: identifier }, { json: opts.json })
        return
      }
      await runAction('historyList', {}, { json: opts.json }, (data: unknown) => {
        const { items, total } = data as {
          items: Array<Record<string, unknown>>
          total: number
        }
        console.log(`${total} history entries:`)
        for (const item of items) {
          console.log(
            `  ${item.identifier} \u2014 ${item.outcome ?? 'unknown'} \u2014 ${item.title}`,
          )
        }
      })
    })

  cli
    .command('task clean [identifier]', 'Clean task artifacts')
    .option('--all', 'Remove every task')
    .option('--force', 'Force removal')
    .option('--purge', 'Purge any caches')
    .action(async (identifier: string | undefined, opts: { all: boolean; force: boolean; purge: boolean }) => {
      if (!identifier && !opts.all) {
        console.log('Usage: reeve task clean <identifier> | --all [--force] [--purge]')
        console.log('  --all    Clean all done/failed tasks (add --force for active tasks too)')
        console.log('  --force  Include active/queued tasks (requires --all)')
        console.log('  --purge  Full deletion (worktree + logs + state). Default preserves logs')
        return
      }

      const { WorkspaceManager } = await import('../../workspace/manager')
      const { RepoStore } = await import('../../workspace/repo-store')
      const { StateStore } = await import('../../kernel/state')
      const { REEVE_DIR } = await import('../../paths')
      const { loadConfig } = await import('../../config')

      const workspace = new WorkspaceManager()
      const repoStore = new RepoStore(loadConfig().workspace.root)
      const store = new StateStore(resolve(REEVE_DIR, 'state.json'))
      const loaded = store.load()
      console.log(`[clean] Loaded ${loaded} tasks from state`)

      let cleaned = 0

      const cleanTask = async (task: Task) => {
        if (!opts.force && task.state !== 'done' && task.state !== 'queued') {
          console.log(
            `  skip ${task.identifier} (state: ${task.state}, use --force to clean)`,
          )
          return false
        }

        if (opts.purge) {
          const sanitized = sanitizeTaskIdentifier(task.identifier)
          const wtDir = taskDir(task.identifier)
          if (existsSync(wtDir)) {
            try {
              const managed = workspace
                .listManagedWorktrees()
                .find((m) => m.identifier === sanitized)
              if (managed) {
                await workspace.removeForTask(task.identifier, managed.repoDir)
              } else {
                rmSync(wtDir, { recursive: true, force: true })
              }
              console.log(`  purged worktree + logs: ${task.identifier}`)
            } catch (err) {
              console.warn(`  worktree cleanup failed: ${task.identifier}: ${err}`)
            }
          }
          store.delete(task.id)
          console.log(`  removed from state: ${task.identifier}`)
        } else {
          try {
            await workspace.cleanWorktreeOnly(task.identifier, repoStore.repoDirOf(task.repo))
            console.log(`  cleaned worktree: ${task.identifier} (logs preserved)`)
          } catch {
            console.log(`  worktree already removed: ${task.identifier}`)
          }
        }

        return true
      }

      if (opts.all) {
        const tasks = store.all()
        for (const task of tasks) {
          if (await cleanTask(task)) cleaned++
        }
        store.save()
        console.log(`Cleaned ${cleaned} task(s)`)
      } else if (identifier) {
        const task = store.getByIdentifier(identifier)
        if (task) {
          if (await cleanTask(task)) {
            store.save()
            cleaned = 1
          }
        } else {
          const orphanDir = existsSync(taskDir(identifier)) ? taskDir(identifier) : null
          if (orphanDir) {
            rmSync(orphanDir, { recursive: true, force: true })
            console.log(`  cleaned orphan worktree: ${identifier}`)
            cleaned = 1
          } else {
            console.log(`  not found: ${identifier}`)
          }
        }
        if (cleaned > 0) console.log(`Cleaned ${cleaned} task(s)`)
      }
    })
}

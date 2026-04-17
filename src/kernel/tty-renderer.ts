// kernel/tty-renderer.ts — Pretty terminal output for `reeve run` foreground mode.
// Subscribes to kernel SSE events → human-readable event stream.
// One active spinner at a time; completed events scroll above it.

import pc from 'picocolors'
import ora, { type Ora } from 'ora'

// Minimal subset of Task — renderer never imports kernel types directly.
interface TaskSnapshot {
  identifier: string
  title: string
  agent?: string
  prUrl?: string
  retryCount: number
  round: number
  maxRounds: number
  doneReason?: string
}

interface KernelEvent {
  type: string
  task: TaskSnapshot
  data?: Record<string, unknown>
}

type Subscribe = (fn: (event: KernelEvent) => void) => () => void

// ── Helpers ──────────────────────────────────────────────────

function ts(): string {
  const d = new Date()
  return pc.dim(
    `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}]`,
  )
}

// ── Renderer ─────────────────────────────────────────────────

export function createTTYRenderer(subscribe: Subscribe): () => void {
  let spinner: Ora | null = null
  let spinnerTask: string | null = null

  // Print a static line, preserving any active spinner.
  function print(text: string): void {
    const active = spinner
    if (active) active.stop()
    console.log(text)
    if (active && spinner === active) active.start()
  }

  function line(icon: string, id: string, msg: string): void {
    print(`${ts()} ${icon} ${pc.bold(id)} ${msg}`)
  }

  // isSilent suppresses the `- text` fallback line in non-TTY / CI (ora #147).
  function spin(id: string, msg: string): void {
    if (spinner) spinner.stop()
    spinner = ora({
      text: `${pc.bold(id)} ${msg}`,
      stream: process.stderr,
      isSilent: !process.stderr.isTTY,
    }).start()
    spinnerTask = id
  }

  // If the spinner belongs to a different task, prints without stopping it.
  function settle(id: string, icon: string, msg: string): void {
    if (spinner && spinnerTask === id) {
      spinner.stop()
      spinner = null
      spinnerTask = null
    }
    line(icon, id, msg)
  }

  const unsub = subscribe((event) => {
    const { task, data } = event
    const id = task.identifier

    switch (event.type) {
      case 'task_added':
        line(pc.blue('●'), id, pc.dim(`"${task.title}"`))
        break

      case 'dispatching':
        spin(id, `Running ${pc.cyan(String(data?.agent ?? 'agent'))}…`)
        break

      case 'pr_detected':
        line(pc.green('↗'), id, `PR → ${pc.underline(String(data?.prUrl))}`)
        break

      case 'post_agent_start': {
        const agents = data?.agents as string[] | undefined
        const label = agents?.join(', ') ?? 'post-agent'
        spin(id, `Running ${pc.cyan(label)}…`)
        break
      }

      case 'post_agent_result': {
        if (data?.verdict === 'pass') {
          const names = (data?.agents as string[])?.join(', ') ?? 'Post-agents'
          settle(id, pc.green('✔'), `${names} passed`)
        } else {
          const agent = String(data?.agent ?? 'Post-agent')
          settle(id, pc.red('✖'), `${agent} failed`)
        }
        break
      }

      case 'retrying': {
        const max = String(data?.maxRetries ?? '?')
        const reason = data?.reason ? pc.dim(` — ${data.reason}`) : ''
        settle(id, pc.yellow('↻'), `Retrying (${task.retryCount}/${max})${reason}`)
        break
      }

      case 'state_change': {
        const to = data?.to as string | undefined
        const from = data?.from as string | undefined
        const reason = data?.reason as string | undefined

        // queued → active already covered by 'dispatching' spinner
        if (to === 'active' && from === 'queued') break

        if (to === 'published') {
          settle(id, pc.green('✔'), task.prUrl
            ? `Published → ${pc.underline(task.prUrl)}`
            : 'Published')
          break
        }

        if (to === 'done') {
          if (reason === 'merged') {
            settle(id, pc.green('✔'), pc.green('Done (merged)'))
          } else if (reason === 'closed') {
            settle(id, pc.yellow('–'), pc.yellow('Closed'))
          } else {
            settle(id, pc.red('✖'), pc.red('Failed'))
          }
          break
        }

        // published → active = re-dispatch after review rejection
        // task.round is already incremented by the kernel before this event fires.
        if (to === 'active' && from === 'published') {
          spin(id, `Re-dispatching (round ${task.round}/${task.maxRounds})…`)
          break
        }

        break
      }
    }
  })

  return () => {
    if (spinner) {
      spinner.stop()
      spinner = null
    }
    unsub()
  }
}

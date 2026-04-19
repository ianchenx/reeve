// cli/commands/runtime.ts — Shared helpers for foreground and daemon runtimes.

import { Hono } from 'hono'
import { createApiApp, serveSpa } from '../../kernel/server'
import type { ActionContext } from '../../actions/types'

const DIST_DIR = new URL('../../../dashboard/dist', import.meta.url).pathname

export function serveDashboard(opts: {
  port: number
  getCtx: () => ActionContext
}): void {
  const apiApp = createApiApp({ getCtx: opts.getCtx })

  const app = new Hono()
  app.route('/api', apiApp)
  app.use('*', serveSpa(DIST_DIR))

  Bun.serve({
    port: opts.port,
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

export function installGracefulShutdown(opts: {
  shutdown: () => Promise<void>
  forceShutdown: () => void
  afterShutdown?: () => void
}): void {
  let shuttingDown = false
  const graceful = async () => {
    if (shuttingDown) {
      opts.forceShutdown()
      opts.afterShutdown?.()
      process.exit(1)
    }
    shuttingDown = true
    await opts.shutdown()
    opts.afterShutdown?.()
    process.exit(0)
  }
  process.on('SIGINT', graceful)
  process.on('SIGTERM', graceful)
}

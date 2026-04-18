#!/usr/bin/env bun
// cli/app.ts — Reeve CLI entry point (cac-based)

import { cac } from 'cac'
import picocolors from 'picocolors'
import { readFileSync } from 'node:fs'

// Register all actions (side-effect imports)
import '../actions/index'

import { showUpdateNotification } from './context'
import { registerLifecycleCommands } from './commands/lifecycle'
import { registerTaskCommands } from './commands/tasks'
import { registerProjectCommands } from './commands/projects'
import { registerSystemCommands } from './commands/system'
import { registerReviewCommand } from './commands/review'
import { registerUpdateCommand } from './commands/update'

const pkgJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string }

export function createCliApp() {
  const cli = cac('reeve')

  cli.version(pkgJson.version)
  cli.option('--json', `Output ${picocolors.bold('JSON')}`)

  registerLifecycleCommands(cli)
  registerTaskCommands(cli)
  registerProjectCommands(cli)
  registerSystemCommands(cli)
  registerReviewCommand(cli)
  registerUpdateCommand(cli)

  cli.help()

  return cli
}

export async function runCli(argv = process.argv): Promise<void> {
  const cli = createCliApp()
  await cli.parse(argv)
}

// ── Main entry ───────────────────────────────────────────

if (import.meta.main) {
  runCli()
    .then(() => {
      showUpdateNotification()
    })
    .catch((err) => {
      console.error('Fatal:', err)
      showUpdateNotification()
      process.exit(1)
    })
}

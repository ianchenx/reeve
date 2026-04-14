// cli/context.ts — Shared action bridge for all CLI commands

import { loadConfig } from '../config'
import { executeAction } from '../actions/registry'
import type { ActionContext } from '../actions/types'
import {
  readUpdateCache,
  hasNewerVersion,
  isCacheStale,
  spawnUpdateCheck,
  isUpdateCheckDisabled,
} from '../update-check'

/** Build action context (no kernel — CLI is a separate process). */
export function buildCtx(): ActionContext {
  const config = loadConfig()
  return {
    config,
    projects: config.projects.map((p: { slug: string; repo: string }) => ({
      slug: p.slug,
      repo: p.repo,
    })),
  }
}

/** Execute an action and handle output format (--json vs human). */
export async function runAction(
  name: string,
  input: unknown,
  opts: { json: boolean },
  humanFormat?: (data: unknown) => void,
): Promise<void> {
  const ctx = buildCtx()
  const result = await executeAction(ctx, name, input)

  if (!result.ok) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ error: result.error, code: result.code }) + '\n',
      )
    } else {
      console.error(`Error: ${result.error}`)
    }
    showUpdateNotification(opts.json)
    process.exit(result.code === 'VALIDATION_ERROR' ? 2 : 1)
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + '\n')
  } else if (humanFormat) {
    humanFormat(result.data)
  } else {
    console.log(JSON.stringify(result.data, null, 2))
  }
}

export function showUpdateNotification(json = false): void {
  if (isUpdateCheckDisabled()) return
  if (json) return
  if (!process.stderr.isTTY) return

  const cache = readUpdateCache()
  if (cache && hasNewerVersion(cache.current, cache.latest)) {
    process.stderr.write(
      `\n  Update available: ${cache.current} \u2192 ${cache.latest}\n\n`,
    )
  }

  if (isCacheStale()) {
    spawnUpdateCheck()
  }
}

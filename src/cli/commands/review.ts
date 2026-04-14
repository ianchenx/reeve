// cli/commands/review.ts — Code review command

import type { CAC } from 'cac'
import { runAction } from '../context'

export function registerReviewCommand(cli: CAC): void {
  cli
    .command('review [identifier]', 'Run AI code review on a task worktree')
    .option('--worktree <path>', 'Inspect the worktree')
    .option('--pr-url <url>', 'Associate a PR URL')
    .option('--agent <agent>', 'Force the review agent')
    .action(async (identifier: string | undefined, opts: { worktree?: string; prUrl?: string; agent?: string; json: boolean }) => {
      await runAction('review', {
        identifier,
        worktree: opts.worktree,
        prUrl: opts.prUrl,
        agent: opts.agent,
      }, { json: opts.json }, (data: unknown) => {
        const r = data as { verdict: string; agent: string; exitCode: number }
        const icon = r.verdict === 'pass' ? '\u2705' : r.verdict === 'fail' ? '\u26a0\ufe0f' : '\u274c'
        console.log(`${icon} Review: ${r.verdict} (agent: ${r.agent})`)
        process.exit(r.verdict === 'pass' ? 0 : 1)
      })
    })
}

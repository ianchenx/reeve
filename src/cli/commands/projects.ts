// cli/commands/projects.ts — Project management: add, edit, remove

import type { CAC } from 'cac'
import { runAction, buildCtx } from '../context'
import { executeAction } from '../../actions/registry'

export function registerProjectCommands(cli: CAC): void {
  cli
    .command('project add <repo>', 'Add a GitHub repo to Reeve')
    .option('--team <team>', 'Team slug to assign')
    .option('--slug <slug>', 'Project slug to generate')
    .option('--agent <agent>', 'Default agent to use')
    .option('--review <agent>', 'Enable post-agent review with specified agent (claude or codex)')
    .action(async (repo: string, opts: { team?: string; slug?: string; agent?: string; review?: string; json: boolean }) => {
      console.log(`\ud83d\udd0d Detecting configuration for ${repo}\u2026`)
      const ctx = buildCtx()
      const detectResult = await executeAction(ctx, 'projectDetect', { repo })
      if (!detectResult.ok) {
        console.error(`Error: ${detectResult.error}`)
        process.exit(1)
      }
      const detected = detectResult.data as {
        setup?: string; inferredTeam?: string; repoName?: string
      }

      const team = opts.team || detected.inferredTeam
      if (!team) { console.error('\u274c Could not infer team. Use --team KEY'); process.exit(1) }
      const projectName = detected.repoName || repo.split('/').pop() || repo

      const ghProc = Bun.spawnSync(
        ["gh", "api", `repos/${repo}`, "--jq", ".default_branch"],
        { stdout: "pipe", stderr: "pipe" },
      )
      const baseBranch = ghProc.exitCode === 0 ? ghProc.stdout.toString().trim() : ""
      if (!baseBranch) {
        console.error('\u274c Could not detect default branch from GitHub. Is `gh` authenticated?')
        process.exit(1)
      }

      if (detected.setup) console.log(`  Setup:    ${detected.setup}`)
      console.log(`  Branch:   ${baseBranch}`)
      console.log(`  Team:     ${team}`)
      if (opts.slug) {
        console.log(`  Slug:     ${opts.slug}`)
      } else {
        console.log(`  Project:  ${projectName} (will create)`)
      }

      await runAction('projectImport', {
        repo,
        slug: opts.slug || '',
        projectName: opts.slug ? undefined : projectName,
        team,
        baseBranch,
        setup: detected.setup,
        agent: opts.agent,
        post: opts.review ? { review: opts.review } : undefined,
      }, { json: opts.json }, () => {
        console.log(`\n\u2705 Added ${repo}\n`)
        console.log(`  Next: reeve start      Launch the daemon (background)`)
        console.log(`        reeve status     Check it's running`)
      })
    })

  cli
    .command('project remove <slug>', 'Remove a project')
    .action(async (slug: string, opts: { json: boolean }) => {
      await runAction('projectRemove', { slug }, { json: opts.json }, () => {
        console.log(`\u2705 Removed project: ${slug}`)
      })
    })

  cli
    .command('project edit <slug>', 'Edit project settings')
    .option('--agent <agent>', 'Override default agent')
    .option('--setup <cmd>', 'Trigger setup workflow with the given command')
    .option('--review <agent>', 'Set review agent (claude or codex), or "off" to disable')
    .action(async (slug: string, opts: { agent?: string; setup?: string; review?: string; json: boolean }) => {
      const input: Record<string, unknown> = { slug }
      if (opts.agent !== undefined) input.agent = opts.agent
      if (opts.setup !== undefined) input.setup = opts.setup
      if (opts.review !== undefined) input.post = opts.review === "off" ? null : { review: opts.review }

      await runAction('projectUpdate', input, { json: opts.json }, (data: unknown) => {
        const r = data as { project: Record<string, unknown> }
        console.log(`\u2705 Updated project: ${slug}`)
        console.log(JSON.stringify(r.project, null, 2))
      })
    })
}

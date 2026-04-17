// workspace/context-injector.ts — Inject Reeve runtime context into wrapper directories.
//
// Writes CLAUDE.md/AGENTS.md with agent identity and critical rules,
// and symlinks bundled skills into the wrapper's agent skill directories.
// This leverages Claude's hierarchical CLAUDE.md discovery: the wrapper-level
// file provides persistent Reeve identity, while the user's project-level
// CLAUDE.md (inside the repo subdirectory) naturally layers on top.

import { existsSync, mkdirSync, readdirSync, symlinkSync, readlinkSync, unlinkSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"

/** Reeve package root (two levels up from src/workspace/) */
const PACKAGE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../..")

/** Bundled skills directory within the Reeve package */
const BUNDLED_SKILLS_DIR = resolve(PACKAGE_ROOT, "skills")

// ── Agent rules sections ───────────────────────────────────
// Each section is an independent block of agent instructions.
// buildAgentRules() assembles them into the final CLAUDE.md/AGENTS.md.

const SECTION_IDENTITY = (repoName: string): string =>
`# Reeve Agent

You are an autonomous coding agent managed by the Reeve daemon.
Project code is in the \`${repoName}/\` subdirectory. Always work from there.`

const SECTION_POSTURE =
`## Default Posture

- This is an **unattended** session. Never ask a human to act. Never say "next steps for user".
- Only stop early for a true blocker (missing auth/secrets/permissions that cannot be resolved).
- **Reproduce first:** confirm current behavior before changing code, so the fix target is explicit.
- **Plan before code:** spend effort on understanding and planning before implementation.
- **Language:** Write all Linear updates (workpad, comments, PR description) in the same language as the issue title and description.
- When you discover out-of-scope improvements, do NOT expand scope — create a separate Linear issue (Backlog, same project, linked to current issue).`

const SECTION_ROUTING =
`## Step 0: Determine Current State and Route

1. Read the issue current state using the \`reeve-linear\` skill.
2. Route to matching flow:
   - **Todo** → move to In Progress. Check if an open PR exists for this branch (\`gh pr view --json comments --jq '.comments[].body'\`). If any comment starts with \`🔍 Review\` and contains \`❌ FAIL\`, read the findings — you are being re-dispatched to address review feedback. Then proceed to Step 1.
   - **In Progress** → continue from existing workpad. Check for PR review comments as above.
   - **In Review** → PR is under human review — do nothing, exit.
   - **Done / Cancelled** → do nothing, exit.
3. If a PR exists and is CLOSED/MERGED, create a fresh branch.`

const SECTION_STATUS =
`## Status Management

Refer to the \`reeve-linear\` skill for GraphQL query templates.

1. **On start:** If issue is Todo, immediately move to In Progress.
2. **During work:** Keep issue in In Progress. Update workpad frequently.
3. **On completion:** After all validation passes, move to In Review.
4. **On blocker:** Record blocker in workpad with: what is missing, why it blocks, exact human action needed.
5. **On re-dispatch:** If issue is Todo/In Progress and an open PR exists with review comments, read those comments first.`

const SECTION_EXECUTION =
`## Execution Flow

### Step 1: Assess & Plan

1. If a PR already exists for this branch, check its status:
   - If \`MERGED\` or \`CLOSED\` → start fresh.
   - If \`OPEN\` → review existing feedback before new work.
3. Explore the codebase — read README, project config, and relevant source files.
4. Write a brief plan: what to change, what to validate, what could go wrong.

### Step 2: Implement

1. Establish a baseline — reproduce the issue or confirm current behavior.
2. Implement changes. Commit using the \`reeve-commit\` skill.
3. Only stage files you actually created or modified — never \`git add -A\` or \`git add .\`.
4. Run validation after each meaningful change.
5. Stay in scope — only modify files directly related to the task.

### Step 3: Validate & Complete

1. Run validation using commands from the project (package.json, Makefile, etc.). Prefer targeted proofs.
2. Verify your changes actually solve the stated problem (not just "no errors").
3. If a check fails:
   - Try to fix it and re-run.
   - Pre-existing failure (not caused by your changes): note it and move on.
   - Cannot fix a failure you caused: explain what remains broken in PR description.

### Step 4: Push & Create PR

Follow the \`reeve-push\` skill. After the PR is created, move the issue to In Review using \`reeve-linear\`.`

const SECTION_WORKPAD =
`## Workpad — Progress Tracking

Maintain a **single persistent comment** on the Linear issue as your progress log. Use \`reeve-linear\` to create and update.

1. Search existing comments for a \`## Reeve Workpad\` header (ignore resolved comments).
2. If found, reuse. If not, create one. Persist the comment ID for future updates.
3. Update immediately after each meaningful milestone.

Template:

\`\`\`markdown
## Reeve Workpad

@<short-sha>

### Plan
- [ ] 1. (derive from issue)

### Acceptance Criteria
- [ ] (from issue description)
- [ ] (edge cases you discover)

### Validation
- [ ] (commands you infer from the project structure)

### Notes
- <timestamp> <progress>

### Confusions
- (anything unclear during execution)
\`\`\``

const SECTION_COMPLETION =
`## Completion Bar

NOT done until ALL are true:

- [ ] Changes committed locally
- [ ] Branch pushed to origin
- [ ] PR created (or confirmed existing)
- [ ] Issue state updated to In Review
- [ ] No known regressions introduced`

const SECTION_BLOCKED =
`## Blocked Escape Hatch

Use ONLY when a required external resource is genuinely missing (auth, secrets, permissions, required tools). Exit with non-zero code — the daemon will retry.`

const SECTION_SAFETY =
`## Safety Rails

### NEVER

- \`git add -A\` or \`git add .\` — always stage specific files
- Commit \`.env\` files or secrets
- Modify \`.git\` config, remotes, or unrelated files
- Touch files outside the task scope
- Modify tests unrelated to the task — if a pre-existing test fails, report it, don't fix it
- Install packages unless necessary
- Leave temporary proof edits in commits (revert before commit)

### ALWAYS

- Run type check / lint before every commit
- Commit format: \`feat(WOR-42):\`, \`fix(WOR-42):\`, \`refactor(WOR-42):\`
- Final message: report completed actions and any blockers. No "next steps for user".`

const SECTION_SKILLS =
`## Skills

| Skill | Purpose |
|-------|---------|
| \`reeve-commit\` | Consistent, well-formed git commits |
| \`reeve-push\` | Push branch + create/update PR |
| \`reeve-pull\` | Sync with origin/main, resolve conflicts |
| \`reeve-linear\` | Linear GraphQL queries, state management, comments |`

// ── Assembly ───────────────────────────────────────────────

export function buildAgentRules(repoName: string): string {
  return [
    SECTION_IDENTITY(repoName),
    SECTION_POSTURE,
    SECTION_ROUTING,
    SECTION_STATUS,
    SECTION_EXECUTION,
    SECTION_WORKPAD,
    SECTION_COMPLETION,
    SECTION_BLOCKED,
    SECTION_SAFETY,
    SECTION_SKILLS,
  ].join("\n\n")
}

/**
 * Provision Reeve skills into a wrapper directory's agent skill paths.
 * Uses symlinks to the bundled skills directory (no duplication).
 *
 * Creates symlinks in two discovery paths:
 * - {dir}/.agents/skills/  — universal agent standard (Codex reads this)
 * - {dir}/.claude/skills/  — Claude Code
 *
 * Idempotent — skips skills that are already correctly linked.
 */
export function provisionSkillsToWrapper(wrapperDir: string, filter?: string[]): string[] {
  if (!existsSync(BUNDLED_SKILLS_DIR)) return []

  const skillsDirs = [
    resolve(wrapperDir, ".agents", "skills"),
    resolve(wrapperDir, ".claude", "skills"),
  ]

  for (const skillsDir of skillsDirs) {
    mkdirSync(skillsDir, { recursive: true })
  }

  const bundledSkills = readdirSync(BUNDLED_SKILLS_DIR)
    .filter(name => name.startsWith("reeve-"))
    .filter(name => !filter || filter.includes(name))

  const provisioned: string[] = []

  for (const skill of bundledSkills) {
    const src = resolve(BUNDLED_SKILLS_DIR, skill)
    let created = false

    for (const skillsDir of skillsDirs) {
      const dst = resolve(skillsDir, skill)

      if (existsSync(dst)) {
        try {
          const target = readlinkSync(dst)
          if (target === src) continue
        } catch {
          // Not a symlink — remove and re-create
        }
        unlinkSync(dst)
      }

      symlinkSync(src, dst)
      created = true
    }

    if (created) provisioned.push(skill)
  }

  return provisioned
}

/**
 * Set up an agent directory with custom rules and filtered skills.
 * Writes CLAUDE.md/AGENTS.md and provisions skills via symlinks.
 */
export function setupAgentContext(
  agentDir: string,
  rules: string,
  skillFilter?: string[],
): void {
  mkdirSync(agentDir, { recursive: true })
  writeFileSync(resolve(agentDir, "CLAUDE.md"), rules)
  writeFileSync(resolve(agentDir, "AGENTS.md"), rules)
  provisionSkillsToWrapper(agentDir, skillFilter)
}


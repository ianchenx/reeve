# AGENTS.md — Reeve

> Behavioral constraints for AI agents working in this repo.
> For architecture and data flow, read the source.

## Build & Test

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run test` | Run all tests (Bun test runner) |
| `bun test path/to/file.test.ts` | Run a single test file |
| `npx tsc --noEmit` | Type check (**run before every commit**) |
| `bun run src/cli/app.ts start` | Start daemon |
| `bun run src/cli/app.ts status` | Check active tasks |
| `bun run src/cli/app.ts restart` | Stop + start daemon |
| `bun run src/cli/app.ts clean` | Clean task worktrees/logs |
| `make dev` | Daemon hot-reload + dashboard HMR |

## Dashboard

| Command | Purpose |
|---------|---------|
| `cd dashboard && bun run dev` | Vite dev server on :5173, proxies /api → :14500 |
| `cd dashboard && bun run build` | Production build |
| `cd dashboard && bun run lint` | ESLint |

## Release

Atomic steps — each is a separate `make` target:

| Step | Command | What it does |
|------|---------|-------------|
| 1 | `make preflight` | Assert clean tree + typecheck + tests |
| 2 | `make version-{patch\|minor\|major}` | `npm version` + auto-commit |
| 3 | *(manual)* | Edit `CHANGELOG.md`, commit |
| 4 | `make tag` | `git tag -a vX.Y.Z` from package.json |
| 5 | `make release-dry` | Preview what would be pushed |
| 6 | `make release` | `git push` + push tag → CI publishes to npm |

## Where to Find Things

- `src/` — Shared modules (config, paths, persistence, update-check, session handling)
- `src/kernel/` — Core orchestration: main loop, state store, HTTP/SSE server, agent spawn, post-agent chain, source adapters
- `src/agent/` — Agent backends (Claude Code, Codex), process management, prompt builder
- `src/linear/` — Linear GraphQL client and issue normalization
- `src/workspace/` — Git worktree lifecycle and agent context injection
- `src/cli/` — CLI entry point (cac-based), command modules: lifecycle, tasks, projects, system, review
- `src/actions/` — CLI action layer: daemon ops, history, project CRUD, review, validation
- `skills/` — Agent skills: `reeve-commit`, `reeve-push`, `reeve-pull`, `reeve-linear`
- `dashboard/` — Web dashboard (React 19 + Vite + Tailwind CSS v4 + shadcn/ui)

## Architectural Invariants

Hard rules. Breaking them breaks the system.

1. **Kernel never calls Linear directly.** All tracker interaction goes through `Source` (`kernel/source.ts`). The kernel imports `Source`, never `linear/`.

2. **State machine is the only lifecycle authority.** 4 states: `queued → active → published → done`. Every transition validated by `assertTransition()`. Adding a state means updating `TRANSITIONS` in `kernel/types.ts` AND the Zod schema in `kernel/state.ts`.

3. **Kernel doesn't know why, only whether.** The kernel never distinguishes *why* a re-dispatch is needed. It asks the source "is this actionable?" and acts on the answer.

4. **Agent verdict file is the gate.** The agent writes `verdict.txt` (PASS/FAIL) in its work directory. Exit code is checked first; if zero, `verdict.txt` determines pass/fail. See the "Agents can't control their exit code" gotcha below.

5. **Post-agent chain is serial, fail-fast.** First failure aborts the chain and triggers retry.

6. **Atomic state persistence.** `StateStore.save()` writes to temp file then renames. Corrupt primary falls back to `.bak`.

## Coding Conventions

- Runtime: **Bun** (NOT Node.js — never use `node` or `npm run`)
- Explicit return types on exported functions
- `Bun.spawn` not `child_process`
- Import without file extensions (`moduleResolution: "bundler"`)
- Log with bracketed module prefix: `[kernel]`, `[runner]`, `[hooks]`, `[server]`
- Errors: explicit handling, structured messages with context

## Agent-Driven Mode

Agents are fully autonomous — code to PR to Linear state.

- Read Linear issue state and route accordingly (Todo → In Progress → In Review)
- Implement changes and commit incrementally
- Run validation (tests, typecheck)
- `git push` and `gh pr create`
- Manage Linear state transitions
- Maintain a Workpad (Linear comment) to track progress across continuation turns

### Skills

| Skill | Purpose |
|-------|---------|
| `reeve-commit` | Consistent, well-formed git commits |
| `reeve-push` | Push branch + create/update PR |
| `reeve-pull` | Sync with origin/main, resolve conflicts |
| `reeve-linear` | Linear GraphQL queries, state management |

## Config

Single source: `~/.reeve/settings.json`
- **Global**: `linearApiKey`, `defaultAgent`, `workspace.root`
- **Per-project** (in `projects` array): `baseBranch`, `agent`, `setup`, `post` (dict: `{ "review": "codex" }`)
- **Task-level** (set at intake): `maxRounds` (default 1), `maxRetries` (default 2) — both in kernel config

Secrets go in `settings.json` (never committed).

## Gotchas

- **Agent CWD ≠ git worktree.** `task.workDir` (implement/) is where the agent runs. `task.worktree` is where git lives. PR detection (`gh pr view`) runs in the worktree dir, not workDir.

- **Worktree .git/info/exclude is per-worktree.** `workspace/manager.ts` writes exclude patterns to the worktree's gitdir (not the main repo's).

- **PATH extension in backends.** Both Claude and Codex backends append `/usr/local/bin:/opt/homebrew/bin` to PATH. Without this, `gh`/`claude`/`codex` may not be found in daemon context.

- **`gh pr view` failure is silent.** `detectPrUrl` returns `undefined` on failure. The kernel proceeds normally.

- **`project.setup` exit code is not checked.** `kernel.ts` awaits `proc.exited` but discards the return value. Setup failures are silent — the agent spawns regardless.

- **repo basename is an implicit protocol.** `basename(repoDir)` is used across workspace manager, post-agent runner, and context-injector to name worktree dirs and symlinks. All three layers must agree — no explicit contract enforces this.

- **Prompt branch name vs git branch can diverge.** Prompt uses `toLowerCase()` only; actual git branch uses `sanitizeTaskIdentifier()` which also replaces non-alphanumeric chars with `-`. Standard Linear identifiers (e.g. `WOR-42`) are unaffected, but non-standard identifiers will mismatch.

- **`findProject()` suffix matching is ambiguous.** The second condition `repo.endsWith(p.repo)` lacks a `/` guard — `"special-api"` matches config entry `"api"`.

- **Agents can't control their exit code.** Neither Claude Code nor Codex CLI allows the agent to exit non-zero on demand. Post-agent verdict is communicated via `verdict.txt` (written by the agent, read by `runner.ts`). Never rely on exit code alone for pass/fail semantics.

## Safety Rails

### NEVER

- `git add -A` or `git add .` — always specify exact files
- Modify `.env` — never commit secrets
- Modify `settings.json` unless issue is specifically about config
- Edit documentation files unless issue explicitly asks for documentation
- Use `node` or `npm` — `bun` exclusively

### ALWAYS

- `npx tsc --noEmit` before every commit
- Commit format: `feat(WOR-42):`, `fix(WOR-42):`, `refactor(WOR-42):`
- PR body via `--body-file` (inline `--body` breaks on newlines/backticks)

# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- `reeve init` classifies Linear API failures (network, auth 401/403, rate-limit, server, graphql) and prints a targeted hint instead of a raw error string. 401s point to `https://linear.app/settings/account/security`; offline failures nudge to reconnect; rate-limit hits suggest waiting

### Fixed
- `reeve doctor` suggests the correct gh install command per platform (`brew install gh` on macOS, `sudo apt install gh` on Linux with dnf/pacman fallback, `winget install --id GitHub.cli` on Windows) instead of hardcoded `brew install gh`
- `reeve project add <repo>` without `--team` and no configured `defaultTeam` now points users to `reeve init` for first-time setup, rather than only saying "use --team KEY"

## [0.0.9] - 2026-04-19

### Fixed
- `reeve project add` no longer crashes with an ENOENT stack trace when `gh` CLI is missing. The command now shows an actionable install hint (`Install: https://cli.github.com/`) instead, matching the graceful handling added for `reeve doctor` in v0.0.8

## [0.0.8] - 2026-04-19

### Fixed
- `reeve doctor`, `reeve start`, and `reeve run` no longer crash with ENOENT on machines without `gh` (or git) in PATH. Missing CLI tools are now reported as "not installed" instead of aborting the process

## [0.0.7] - 2026-04-19

### Added
- `reeve doctor --json` — machine-readable health output for scripts and CI
- `reeve task clean --all` — unified worktree/log cleanup (replaces the standalone `reeve clean`)

### Changed
- **CLI layout reorganized.** Task and project operations are now grouped under their own subcommands: `reeve task list|log|history|clean|retry`, `reeve project list|add|remove|update`. Old top-level forms (`reeve tasks`, `reeve log`, `reeve history`, `reeve import`, `reeve repos`) were removed — no backwards-compatible shims
- `reeve validate` folded into `reeve doctor --strict` — one entry point for environment checks, strict failures now surface instead of being silently skipped
- `reeve update` detects how reeve was installed (npm global vs dev checkout) and routes to the matching upgrade command instead of blindly running npm
- Dashboard board shows the base branch instead of a (rarely useful) clickable worktree path
- `reeve start` output trimmed to 3 lines; daemon activation now happens implicitly on first project import, removing the "Start Reeve" button from the dashboard

### Removed
- `reeve actions`, `reeve version`, `reeve rebuild-index`, `reeve review` CLI commands (internal tooling or covered by other commands)
- Manual retry action — re-dispatch now happens via Linear state reset, matching the rest of the lifecycle model
- Legacy `~/.config/reeve/` config and pid-file fallbacks — everything lives under `~/.reeve/` now

### Fixed
- Kernel crash on delayed agent exit: an exit event arriving for a task already transitioned to a terminal state would attempt `done → queued` and abort the daemon. Terminal states now ignore stale exits instead of re-dispatching
- Dashboard CI cold build failed with `TS2688: Cannot find type definition file for 'bun-types'` — the type package is now declared as a dashboard devDep instead of relying on the parent workspace
- `reeve update` no longer double-prints "upgrade failed" when run from a dev checkout — the dev-mode guard now returns before invoking the upgrader
- Live-session events now order by mtime with first-available resolution, fixing out-of-order rendering in multi-stage flows
- Worktree diff route matches nested paths (previously only flat file names resolved)
- Dashboard shows diffs for untracked files, not just tracked changes

## [0.0.6] - 2026-04-18

### Added
- `reeve update` — self-upgrade to the latest reeve-ai on npm. Detects daemon state: idle daemon is automatically restarted after upgrade; active tasks trigger a prompt (never kills running agents without confirmation). Also supports `--check` for a non-destructive version probe
- Startup banner and post-command update notification now point users at `reeve update` instead of leaving them to figure out the upgrade path
- CI job that installs a 0.0.0 tarball and upgrades to npm latest, covering the real I/O path that unit tests cannot reach

## [0.0.5] - 2026-04-18

### Fixed
- npm package now includes `assets/logo.txt` — restores the animated ASCII logo on `reeve run` and the static logo banner on `reeve start` (previously silently skipped because the file was missing from published tarballs)

## [0.0.4] - 2026-04-18

### Fixed
- `reeve run` setup page no longer serves HTML in place of JS/image assets — fixes the "Expected a JavaScript module, got text/html" MIME error that broke the first-run setup UI

## [0.0.3] - 2026-04-18

### Changed
- `reeve init` and `reeve project add` print the full next-step chain (project add → start → status) so the handoff between setup stages is explicit
- `reeve doctor` prints an inline fix command for each failing check and uses picocolors for ✅/❌ coloring with column-aligned labels

## [0.0.2] - 2026-04-17

### Added
- Smoke tests: Docker-based package verification (`make smoke`, `make smoke-full`)
- E2E test infrastructure: atomic fixture runner with real Linear issues (`make e2e`, `make e2e-happy`, `make e2e-review`)

### Changed
- Linear issue filtering now uses workflow state type (unstarted/started) instead of display name, making it locale-independent
- Kernel streams lifecycle events over SSE; startup and task events render via a new TTY renderer

### Removed
- `activeStates` config field (replaced by `dispatchableStateTypes`)
- `CandidateIssueSnapshot` type and related methods (simplified to direct issue arrays)

### Fixed
- Update check now queries the correct npm package name (`reeve-ai`) — previously looked up the wrong name and never reported upgrades
- Startup banner compares the running version against `cache.latest` — no more false "new version available" right after upgrading
- Dashboard project import surfaces missing Linear workflow states instead of silently closing the sheet
- `ensureWorkflowStates` honors `workflowStateCreate.success`, so API-rejected state creations are now reported as missing
- Several previously-silent failures now surface in logs: project-setup exit codes, state-load failures, reconcile errors
- Workpad header shows the short SHA only

## [0.0.1] - 2026-04-14

Initial open-source release.

### Added
- Daemon that watches Linear for dispatchable issues and spawns AI coding agents
- CLI: `reeve init`, `reeve doctor`, `reeve start/run/stop`, `reeve status/tasks/log/history`
- Web dashboard with live task board, session viewer, and setup wizard
- Linear integration as pluggable source adapter
- Claude Code and Codex agent backends with NDJSON/JSON-RPC stream parsing
- Isolated git worktree per task with wrapper-level agent context injection
- Post-agent review chain (configurable per project via `post` dict)
- Retry with exponential backoff, continuation, and crash recovery
- 4 bundled skills: `reeve-commit`, `reeve-push`, `reeve-pull`, `reeve-linear`
- `reeve doctor` for environment health checks
- `reeve project add <org/repo>` for quick project onboarding
- Update notification system — CLI and dashboard show a banner when a newer version is available
- Token usage and cost tracking — visible in `reeve task history` and task detail views
- Animated startup banner with ASCII logo reveal on `reeve run`
- `/version` API endpoint for dashboard update checks
- CI/CD pipeline with GitHub Actions (CI on PR, npm publish on tag)
- GitHub issue templates (bug report, feature request) and PR template
- `make` targets for release workflow (`preflight`, `version-*`, `tag`, `release`)

### Security
- `DASHBOARD_SECRET` env var for bearer token auth (timing-safe comparison)
- Path traversal protection in history agent name validation
- `REEVE_HOST` env var to control server bind address (default `0.0.0.0`)

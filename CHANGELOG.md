# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- `reeve update` — self-upgrade to the latest reeve-ai on npm. Detects daemon state: idle daemon is automatically restarted after upgrade; active tasks trigger a prompt (never kills running agents without confirmation). Also supports `--check` for a non-destructive version probe
- Startup banner and post-command update notification now point users at `reeve update` instead of leaving them to figure out the upgrade path

## [0.0.5] - 2026-04-18

### Fixed
- npm package now includes `assets/logo.txt` — restores the animated ASCII logo on `reeve run` and the static logo banner on `reeve start` (previously silently skipped because the file was missing from published tarballs)

## [0.0.4] - 2026-04-18

### Fixed
- `reeve run` setup page no longer serves HTML in place of JS/image assets — fixes the "Expected a JavaScript module, got text/html" MIME error that broke the first-run setup UI

## [0.0.3] - 2026-04-18

### Changed
- `reeve init` and `reeve import` print the full next-step chain (import → start → status) so the handoff between setup stages is explicit
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
- `reeve import <org/repo>` for quick project onboarding
- Update notification system — CLI and dashboard show a banner when a newer version is available
- Token usage and cost tracking — visible in `reeve history` and task detail views
- Animated startup banner with ASCII logo reveal on `reeve run`
- `/version` API endpoint for dashboard update checks
- CI/CD pipeline with GitHub Actions (CI on PR, npm publish on tag)
- GitHub issue templates (bug report, feature request) and PR template
- `make` targets for release workflow (`preflight`, `version-*`, `tag`, `release`)

### Security
- `DASHBOARD_SECRET` env var for bearer token auth (timing-safe comparison)
- Path traversal protection in history agent name validation
- `REEVE_HOST` env var to control server bind address (default `0.0.0.0`)

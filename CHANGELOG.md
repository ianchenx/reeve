# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed
- Linear issue filtering now uses workflow state type (unstarted/started) instead of display name, making it locale-independent

### Added
- Smoke tests: Docker-based package verification (`make smoke`, `make smoke-full`)
- E2E test infrastructure: atomic fixture runner with real Linear issues (`make e2e`, `make e2e-happy`, `make e2e-review`)
- Testing documentation in AGENTS.md with three-layer test strategy (unit/smoke/E2E)

### Removed
- `activeStates` config field (replaced by `dispatchableStateTypes`)
- `CandidateIssueSnapshot` type and related methods (simplified to direct issue arrays)

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

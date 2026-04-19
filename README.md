<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-transparent.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/icon-light-transparent.png">
    <img alt="Reeve" src="assets/icon-light-transparent.png" width="120">
  </picture>
  <br>
  <strong>Reeve</strong> — Write a ticket, get a PR.
</p>

<div align="center">

Write a ticket, grab a coffee, work gets done.

**Your machine · Your keys · Your agent**

English | [中文](README_CN.md)

[Why Reeve?](#what-is-reeve) · [Quick Start](#quick-start) · [How It Works](#how-it-works) · [Configuration](#configuration) · [Dashboard](#dashboard)

</div>

---

## What is Reeve?

AI coding agents can now complete engineering tasks independently. But running them, you only have two choices:

**Watch the terminal until it finishes** — CLI tools are powerful but block your foreground. If it crashes, you restart manually.
**Hand execution to a cloud service** — no babysitting, but your code runs on someone else's infrastructure, billed per seat, with opaque data flows.

Reeve is the third option: **self-hosted unattended execution**. Runs on your machine, your API keys, your choice of agent. Write a ticket, grab a coffee — everything flows automatically in the background.

```
┌──────────────┐      ┌─────────────┐      ┌──────────────┐      ┌───────────┐
│ Issue Tracker │ ───▶ │   Reeve     │ ───▶ │  AI Agent    │ ───▶ │ GitHub PR │
│   (any)       │      │  (daemon)   │      │  (any CLI)   │      │           │
└──────────────┘      └─────────────┘      └──────────────┘      └───────────┘
```

> Built-in **Linear** adapter. Task sources plug in via the `Source` interface — connecting other trackers only requires a lightweight adapter.

### Core Design

**Three things are decoupled: where tasks come from, who writes the code, where code runs.** Swap out Linear without touching the agent. Swap the agent without touching the workspace. Each layer evolves independently.

- **Ticket-driven, not prompt-driven**. You don't write prompts — you write tickets in the project management tool you already use. Reeve watches for status changes and turns Todo items into agent tasks.

- **The ticket is the single source of truth**. The agent treats the ticket as its only context source, maintaining a live Workpad in the comments to track execution progress. If the process crashes or the agent restarts, the next run picks up from where it left off.

- **Full execution transparency**. Token usage and run duration for every task, visible in real time. You won't run something unattended that you can't see the bill for.

- **Pluggable task sources**. The kernel never calls any platform API directly — all trackers connect through `Source` adapters. Linear is the first built-in adapter, and the interface is fully open.

### Design Philosophy

**The dumber the orchestration layer, the stronger the system.**

Most orchestration tools try to be smart — decomposing tasks, planning steps, managing complex workflows. Reeve makes the opposite bet: **keep the orchestration layer as thin as possible**, and hand all intelligence to the agent.

The kernel doesn't understand code, doesn't plan, doesn't decompose problems. It does one thing: connect your issue tracker to an AI agent, provide isolation and lifecycle guardrails, and get out of the way.

Agents will only get better. Today's frontier model is next year's baseline. Thick orchestration layers become liabilities — they cap what the agent can do. A thin layer is an asset — every improvement in agent capability flows through with zero friction. Use Claude Code today, switch to a stronger model tomorrow, zero migration cost.

## Quick Start

### Prerequisites

- macOS or Linux
- [Bun](https://bun.sh) >= 1.0
- [gh](https://cli.github.com) CLI (authenticated via `gh auth login`)
- At least one agent CLI: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://github.com/openai/codex)
- A [Linear](https://linear.app) account (the only built-in task source for now — more adapters coming)

### 1. Install

```bash
curl -fsSL https://reeve.run/install.sh | bash
```

Or with a package manager:

```bash
bun install -g reeve-ai
npm install -g reeve-ai
```

### 2. Start Reeve — pick one

**▸ Terminal**
```bash
reeve init                  # Interactive wizard
reeve run                   # Foreground (Ctrl+C to stop)
```

**▸ Browser**
```bash
reeve start                 # Background daemon
# open http://localhost:14500 to finish setup and watch
```

Either flow walks you through the same inputs: Linear API key → team → repo → agent.

### 3. Assign a task like you always do

Open your Linear project, create an issue describing the change you want, and drag it to **Todo**. Then go grab a coffee.

Reeve's scheduling kernel takes over automatically:

1. **Isolate** — Creates an independent git worktree for the task, leaving your main workspace untouched
2. **Dispatch** — Transforms the ticket into structured context and wakes your configured agent
3. **Execute** — The agent writes code, runs tests, and commits inside the isolated environment
4. **Validate** — If review is enabled, triggers a cross-agent code review; failures are sent back for retry
5. **Deliver** — Pushes a PR, advances the ticket status, and waits for your final approval

Reeve delivers PRs, not merges. The merge decision is yours.

### From Source

```bash
git clone https://github.com/ianchenx/reeve.git
cd reeve
make install                # Install backend + dashboard deps
make dev-daemon             # Backend watch in one terminal
make dev-web                # Dashboard dev server in another terminal
```

## How It Works

Every scheduling cycle (default 30 seconds), Reeve runs:

1. **Intake** — Poll the task source for dispatchable issues. New items become tasks.
2. **Reconcile** — For published tasks, check if the issue is still actionable (e.g. a human requested changes).
3. **Dispatch** — For queued tasks, create a git worktree, build the prompt, spawn the agent.
4. **Monitor** — Track agent output, detect stalls, enforce timeouts.

### Task Lifecycle

```
queued ──▶ active ──▶ published ──▶ done
                         │
                         ▼
                    done (failed) ──▶ [human moves to Todo] ──▶ revived
```

`published` = PR created, awaiting human review. If changes are requested during review, Reeve detects this and automatically re-dispatches the agent to address the feedback.

### Reliability & Recovery

| Failure Scenario | Recovery |
|---|---|
| **Validation blocked** | Exponential backoff, agent retried up to `maxRetries` times |
| **Agent process crashes** | Reads Workpad progress, reuses worktree, resumes from checkpoint |
| **Task fully failed** | Human moves it back to Todo — code state preserved, budget reset, forced revival |
| **Daemon crash** | On restart, reconciles local state against remote tracker, lossless recovery |

## Configuration

`~/.reeve/settings.json` — created by `reeve init`:

```json
{
  "linearApiKey": "lin_api_...",
  "defaultAgent": "claude",
  "projects": [
    { "team": "ENG", "linear": "my-project-slug", "repo": "myorg/myrepo" }
  ],
  "workspace": { "root": "~/reeve-workspaces" },
  "polling": { "intervalMs": 30000 },
  "dashboard": { "port": 14500, "enabled": true }
}
```

Per-project settings are managed via the dashboard or `settings.json`:

```json
{
  "projects": [
    {
      "team": "ENG",
      "linear": "my-project-slug",
      "repo": "myorg/myrepo",
      "agent": "claude",
      "setup": "bun install",
      "post": { "review": "codex" }
    }
  ]
}
```

## Skills

Agents learn how to commit, push, and manage ticket state through Skills — here are the built-in defaults, which you can override or extend:

```
skills/
├── reeve-commit/SKILL.md   # Well-formed git commits
├── reeve-push/SKILL.md     # Push branch + create/update PRs
├── reeve-pull/SKILL.md     # Sync with origin/main, resolve conflicts
└── reeve-linear/SKILL.md   # Linear GraphQL queries + state management
```

## Dashboard

The agent continuously syncs progress to the ticket Workpad, so Reeve runs fully in headless mode.

The dashboard (`http://localhost:14500`) provides system-level observability:

- **Trace view**: Real-time observation of agent reasoning and tool call flows
- **Concurrent board**: Overview of all isolated tasks dispatched by the kernel
- **Cost attribution**: Token consumption per task — decide which tasks are worth automating
- **Full logs**: When retries or blocks occur, provides far more detail than the Workpad

## CLI Reference

```
reeve init                  Interactive setup wizard
reeve start                 Start daemon in background
reeve run                   Start in foreground (Ctrl+C to stop)
reeve stop                  Stop daemon
reeve restart               Stop + start
reeve status                Task state summary
reeve tasks                 List active tasks
reeve log <id>              Session log for a task
reeve cancel <id>           Cancel a running task
reeve history               Past task results
reeve clean [id]            Remove task state + worktree
reeve doctor                Check environment health
reeve import <org/repo>     Import a GitHub repo as a project
reeve edit <slug>           Update project settings
reeve remove <slug>         Remove a project
```

## Development

```bash
make install            # Install all dependencies
make dev-daemon         # Backend watch
make dev-web            # Dashboard dev server
make test               # Run all tests
make check              # Typecheck + tests
make smoke              # Verify npm package in clean Docker
make e2e                # End-to-end tests (requires Linear sandbox)
make help               # Show all make targets
```

## What's Next

- [ ] More task source adapters
- [ ] Custom task source adapter guide
- [ ] Multi-agent collaboration

Star or Watch this repo to follow progress.

## License

MIT

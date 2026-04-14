---
name: reeve-commit
description: |
  Create incremental, well-formed git commits during autonomous task execution.
  Use after completing a logical unit of work — don't batch everything into one commit.
---

# Commit

You are an unattended agent. Commit incrementally as you work, not once at the end.

## Rules

1. **Stage exact files** — `git add path/to/file`. Never `git add -A` or `git add .`.
2. **One logical change per commit** — if you changed tests and implementation, that can be one commit. If you also reformatted unrelated files, that's a separate commit.
3. **Sanity-check the index** — run `git diff --staged --stat` before committing. If anything looks unexpected (build artifacts, lockfiles you didn't intend to change), unstage it.

## Message Format

```
<type>(<scope>): <subject>

<body>
```

- **type**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- **scope**: issue identifier if available (e.g. `WOR-42`), or module name
- **subject**: imperative mood, ≤72 chars, no trailing period
- **body**: what changed and why, wrapped at 72 chars

Use `git commit -F <tmpfile>` to avoid shell escaping issues with `-m`.

## Check Project Conventions

Follow the commit format in the injected AGENTS.md (e.g. `feat(WOR-42): add login page`).

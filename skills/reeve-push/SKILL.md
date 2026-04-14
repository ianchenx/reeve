---
name: reeve-push
description: |
  Push the current branch and create or update a pull request.
  Use when implementation is complete and validated.
---

# Push

## Before Pushing

1. Run project validation (check `AGENTS.md` for commands, e.g. `npx tsc --noEmit`, `bun test`).
2. Confirm all intended changes are committed (`git status` shows clean tree).
3. If uncommitted work remains, use the `reeve-commit` skill first.

## Push

```sh
git push -u origin HEAD
```

If rejected (non-fast-forward), use the `reeve-pull` skill to sync with main, then retry.
Only use `--force-with-lease` if you intentionally rewrote history (e.g. after rework).

## Pull Request

Check if a PR already exists:

```sh
pr_url=$(gh pr view --json url -q .url 2>/dev/null || true)
```

**No existing PR** — create one:

```sh
# Write body to a temp file to avoid shell escaping issues
cat > /tmp/pr-body.md << 'EOF'
## Summary
<what changed and why>

## Task
Fixes ISSUE-ID
- **Status:** success | partial

---
*Automated by [Reeve](https://github.com/ianchenx/reeve)*
EOF

gh pr create --title "ISSUE-ID: <concise title>" --body-file /tmp/pr-body.md
```

**PR exists and open** — update if needed:

```sh
gh pr edit --title "ISSUE-ID: <updated title if scope changed>"
```

**PR exists but closed/merged** — you need a new branch:

```sh
git checkout -b <new-branch-name>
git push -u origin HEAD
gh pr create --title "..." --body-file /tmp/pr-body.md
```

## After

Print the PR URL:

```sh
gh pr view --json url -q .url
```

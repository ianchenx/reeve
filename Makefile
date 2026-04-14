.PHONY: dev dev-server dev-web run start stop restart status test check typecheck build build-web tasks history init install logs clean help \
       preflight version-patch version-minor version-major tag release-dry release

# ── Quick Start ──────────────────────────────────────

run:                    ## Start in foreground (Ctrl+C to stop)
	cd dashboard && bun run build
	bun run src/cli/app.ts run

start:                  ## Start daemon in background
	cd dashboard && bun run build
	bun run src/cli/app.ts start

stop:                   ## Stop background daemon
	bun run src/cli/app.ts stop

restart:                ## Restart background daemon
	cd dashboard && bun run build
	bun run src/cli/app.ts restart

status:                 ## Show task status
	bun run src/cli/app.ts status

# ── Development ──────────────────────────────────────

dev-server:             ## Start backend shell in watch mode (no polling)
	bun --watch src/cli/app.ts run --no-poll

dev-web:                ## Start dashboard dev server
	cd dashboard && bun run dev

dev:                    ## Start backend watch + dashboard dev server
	@trap 'kill 0' INT TERM EXIT; \
	bun --watch src/cli/app.ts run --no-poll & \
	(cd dashboard && bun run dev) & \
	wait

test:                   ## Run all tests
	bun test

check:                  ## Typecheck + tests
	bunx tsc --noEmit && bun test

typecheck:              ## Typecheck only (backend + dashboard)
	bunx tsc --noEmit
	cd dashboard && bunx tsc -b

build-web:              ## Build dashboard to dashboard/dist/
	cd dashboard && bun run build

build: build-web        ## Build dashboard assets

# ── CLI Shortcuts ────────────────────────────────────

tasks:                  ## List active tasks
	bun run src/cli/app.ts tasks

history:                ## Show task history
	bun run src/cli/app.ts history

init:                   ## Interactive setup wizard
	bun run src/cli/app.ts init

logs:                   ## Tail daemon log
	tail -f ~/reeve.log

# ── Maintenance ──────────────────────────────────────

install:                ## Install all dependencies
	bun install
	cd dashboard && bun install

clean:                  ## Clean build artifacts
	rm -rf dashboard/dist dashboard/node_modules/.tmp

# ── Release ──────────────────────────────────────────
#
# Atomic steps:
#   1. make preflight          — verify clean tree + CI passes
#   2. make version-{patch|minor|major} — bump package.json + commit
#   3. (manually edit CHANGELOG.md, amend or new commit)
#   4. make tag                — create vX.Y.Z tag from package.json
#   5. make release            — push main + tag → triggers CI + npm publish
#
# Dry run:
#   make release-dry           — show what would be pushed (no side effects)

VERSION := $(shell node -p "require('./package.json').version")

preflight:              ## Verify clean tree, typecheck, tests pass
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "❌ Working tree is dirty. Commit or stash first."; exit 1; \
	fi
	@echo "▶ Typecheck…"
	@bunx tsc --noEmit
	@echo "▶ Tests…"
	@bun test
	@echo "✅ Preflight passed (v$(VERSION))"

version-patch:          ## Bump patch version (0.1.0 → 0.1.1) + commit
	@npm version patch --no-git-tag-version
	@NEW=$$(node -p "require('./package.json').version"); \
	git add package.json && \
	git commit -m "chore: bump version to $$NEW"
	@echo "✅ Version bumped to $$(node -p "require('./package.json').version")"

version-minor:          ## Bump minor version (0.1.0 → 0.2.0) + commit
	@npm version minor --no-git-tag-version
	@NEW=$$(node -p "require('./package.json').version"); \
	git add package.json && \
	git commit -m "chore: bump version to $$NEW"
	@echo "✅ Version bumped to $$(node -p "require('./package.json').version")"

version-major:          ## Bump major version (0.1.0 → 1.0.0) + commit
	@npm version major --no-git-tag-version
	@NEW=$$(node -p "require('./package.json').version"); \
	git add package.json && \
	git commit -m "chore: bump version to $$NEW"
	@echo "✅ Version bumped to $$(node -p "require('./package.json').version")"

tag:                    ## Create git tag vX.Y.Z from current package.json version
	@if git rev-parse "v$(VERSION)" >/dev/null 2>&1; then \
		echo "❌ Tag v$(VERSION) already exists"; exit 1; \
	fi
	git tag -a "v$(VERSION)" -m "v$(VERSION)"
	@echo "✅ Tagged v$(VERSION)"

release-dry:            ## Show what would be pushed (no side effects)
	@echo "Version:  v$(VERSION)"
	@echo "Branch:   $$(git branch --show-current)"
	@echo "Tag:      v$(VERSION) → $$(git rev-parse --short HEAD)"
	@echo "Commits to push:"
	@git log --oneline origin/main..HEAD 2>/dev/null || echo "  (no remote tracking)"
	@echo ""
	@echo "This would run: git push && git push origin v$(VERSION)"

release:                ## Push main + tag → triggers CI + npm publish
	@if ! git rev-parse "v$(VERSION)" >/dev/null 2>&1; then \
		echo "❌ Tag v$(VERSION) does not exist. Run 'make tag' first."; exit 1; \
	fi
	@echo "▶ Pushing main…"
	git push
	@echo "▶ Pushing tag v$(VERSION)…"
	git push origin "v$(VERSION)"
	@echo "✅ Released v$(VERSION) — CI will publish to npm"

# ── Help ─────────────────────────────────────────────

help:                   ## Show this help
	@grep -E '^[a-z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

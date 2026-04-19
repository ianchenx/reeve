.PHONY: dev-daemon dev-web run start stop restart status test check typecheck build build-web tasks history init install logs clean help \
       preflight version-patch version-minor version-major tag release-dry release \
       smoke smoke-full smoke-dev e2e e2e-happy e2e-review

# ── Quick Start ──────────────────────────────────────

run:                    ## Start in foreground (Ctrl+C to stop)
	@cd dashboard && bun run build > /dev/null 2>&1
	bun run src/cli/app.ts run

start:                  ## Start daemon in background
	@cd dashboard && bun run build > /dev/null 2>&1
	bun run src/cli/app.ts start

stop:                   ## Stop background daemon
	bun run src/cli/app.ts stop

restart:                ## Restart background daemon
	cd dashboard && bun run build
	bun run src/cli/app.ts restart

status:                 ## Show task status
	bun run src/cli/app.ts status

# ── Development ──────────────────────────────────────

dev-daemon:             ## Start backend shell in watch mode (allows incomplete setup)
	bun --watch src/cli/app.ts daemon

dev-web:                ## Start dashboard dev server
	cd dashboard && bun run dev

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
	bun run src/cli/app.ts task list

history:                ## Show task history
	bun run src/cli/app.ts task history

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

# ── Smoke Test ───────────────────────────────────────
#
# Three modes, one Docker image:
#   make smoke       Verify packaged tarball installs and runs (no secrets)
#   make smoke-full  Same + config validation with your real settings
#   make smoke-dev   Mount local source into clean Linux for interactive dev/E2E
#
# All targets build test/smoke/Dockerfile → reeve-smoke image (cached after first run).

SMOKE_IMAGE := reeve-smoke
SMOKE_BUILD = @docker build -t $(SMOKE_IMAGE) test/smoke/ -q

SMOKE_MOUNTS_AUTH = \
	-v "$$HOME/.reeve/settings.json:/root/.reeve/settings.json:ro" \
	-v "$$HOME/.config/gh:/root/.config/gh:ro"

smoke:                  ## Verify package in clean Linux (no secrets needed)
	@npm pack --quiet
	$(SMOKE_BUILD)
	@PKG=$$(ls -t reeve-ai-*.tgz | head -1); \
	docker run --rm -v "$$(pwd)/$$PKG:/pkg/reeve-ai.tgz:ro" \
		$(SMOKE_IMAGE) ./verify.sh; \
	rc=$$?; rm -f "$$PKG"; exit $$rc

smoke-full:             ## Verify package + config with real settings and gh auth
	@npm pack --quiet
	$(SMOKE_BUILD)
	@PKG=$$(ls -t reeve-ai-*.tgz | head -1); \
	docker run --rm -v "$$(pwd)/$$PKG:/pkg/reeve-ai.tgz:ro" \
		$(SMOKE_MOUNTS_AUTH) \
		$(SMOKE_IMAGE) ./verify.sh full; \
	rc=$$?; rm -f "$$PKG"; exit $$rc

smoke-dev:              ## Run local source in clean Linux (interactive, dashboard on :14500)
	$(SMOKE_BUILD)
	@docker run --rm -it -p 14500:14500 \
		-v "$$(pwd):/app" -w /app \
		$(SMOKE_MOUNTS_AUTH) \
		$(SMOKE_IMAGE)

# ── E2E Tests ────────────────────────────────────────
#
# Isolated E2E: REEVE_DIR=~/.reeve-test, dashboard on its own port.
# Daemon lifecycle managed here; e2e.sh is a pure fixture runner.
# Logs persist at ~/.reeve-test/test-logs/ (never auto-deleted).
#
#   make e2e              All fixtures
#   make e2e-happy        Happy-path only
#   make e2e-review       Review rejection loop
#   make e2e-one F=<path> Single fixture
#   make e2e-daemon       Start test daemon (for manual fixture runs)
#   make e2e-stop         Stop test daemon

E2E_REEVE_DIR  := $(HOME)/.reeve-test
E2E_CODEX_HOME := $(E2E_REEVE_DIR)/codex-home
E2E_ENV        := REEVE_DIR=$(E2E_REEVE_DIR) CODEX_HOME=$(E2E_CODEX_HOME)
E2E_PORT       := $(shell jq -r '.dashboard.port // 14501' $(E2E_REEVE_DIR)/settings.json 2>/dev/null || echo 14501)
E2E_PID_FILE   := $(E2E_REEVE_DIR)/daemon.pid

define e2e_start_daemon
	@if /usr/bin/curl -sf http://localhost:$(E2E_PORT)/api/status >/dev/null 2>&1; then \
		echo "Test daemon already running on :$(E2E_PORT)"; \
	else \
		rm -f $(E2E_REEVE_DIR)/state.json $(E2E_REEVE_DIR)/state.json.bak; \
		rm -rf $(E2E_REEVE_DIR)/tasks/; \
		WS_ROOT=$$(jq -r '.workspace.root // "~/.reeve/workspaces"' $(E2E_REEVE_DIR)/settings.json 2>/dev/null); \
		WS_ROOT=$$(eval echo "$$WS_ROOT"); \
		for repo in "$$WS_ROOT"/*/*; do [ -d "$$repo/.git" ] && git -C "$$repo" worktree prune 2>/dev/null; done; \
		mkdir -p $(E2E_CODEX_HOME)/skills; \
		cp -n test/smoke/codex-config.toml $(E2E_CODEX_HOME)/config.toml 2>/dev/null || true; \
		echo "Starting test daemon (REEVE_DIR=$(E2E_REEVE_DIR), CODEX_HOME=$(E2E_CODEX_HOME), port=$(E2E_PORT))..."; \
		$(E2E_ENV) bun run src/cli/app.ts run & echo $$! > $(E2E_PID_FILE); \
		sleep 5; \
		if ! /usr/bin/curl -sf http://localhost:$(E2E_PORT)/api/status >/dev/null 2>&1; then \
			echo "FATAL: daemon failed to start"; exit 1; \
		fi; \
		echo "Daemon running (pid=$$(cat $(E2E_PID_FILE)))"; \
	fi
endef

define e2e_stop_daemon
	@if [ -f $(E2E_PID_FILE) ]; then \
		pid=$$(cat $(E2E_PID_FILE)); \
		kill $$pid 2>/dev/null || true; \
		echo "Test daemon stopped (pid=$$pid)"; \
		rm -f $(E2E_PID_FILE); \
	fi
endef

e2e-daemon:             ## Start isolated test daemon
	$(e2e_start_daemon)

e2e-stop:               ## Stop isolated test daemon
	$(e2e_stop_daemon)

e2e: e2e-daemon         ## Run all E2E test fixtures
	@$(E2E_ENV) ./test/smoke/e2e.sh all; rc=$$?; $(MAKE) -s e2e-stop; exit $$rc

e2e-happy: e2e-daemon   ## Run happy-path fixtures only
	@$(E2E_ENV) ./test/smoke/e2e.sh happy; rc=$$?; $(MAKE) -s e2e-stop; exit $$rc

e2e-review: e2e-daemon  ## Run review rejection loop
	@$(E2E_ENV) ./test/smoke/e2e.sh review; rc=$$?; $(MAKE) -s e2e-stop; exit $$rc

e2e-one: e2e-daemon     ## Run single fixture: make e2e-one F=test/smoke/fixtures/happy-add-function.json
	@$(E2E_ENV) ./test/smoke/e2e.sh $(F); rc=$$?; $(MAKE) -s e2e-stop; exit $$rc

e2e-clean:              ## Remove all test state (state.json, tasks/, logs)
	$(e2e_stop_daemon)
	rm -f $(E2E_REEVE_DIR)/state.json $(E2E_REEVE_DIR)/state.json.bak $(E2E_PID_FILE)
	rm -rf $(E2E_REEVE_DIR)/tasks/
	@WS_ROOT=$$(jq -r '.workspace.root // "~/.reeve/workspaces"' $(E2E_REEVE_DIR)/settings.json 2>/dev/null); \
	WS_ROOT=$$(eval echo "$$WS_ROOT"); \
	for repo in "$$WS_ROOT"/*/*; do [ -d "$$repo/.git" ] && git -C "$$repo" worktree prune 2>/dev/null; done
	@echo "Cleaned $(E2E_REEVE_DIR) (logs preserved)"

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

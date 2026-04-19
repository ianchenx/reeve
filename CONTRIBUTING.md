# Contributing to Reeve

Thanks for your interest in contributing to Reeve.

## Getting Started

```bash
git clone https://github.com/ianchenx/reeve.git
cd reeve
make install   # install backend + dashboard deps
make dev-daemon # backend watch
make dev-web    # dashboard dev server
```

## Development Workflow

```bash
make test       # run all tests
make check      # typecheck + tests
make typecheck  # typecheck only (backend + dashboard)
make smoke      # verify npm package in clean Docker
make e2e        # end-to-end tests (requires Linear sandbox, see AGENTS.md)
```

Before submitting a PR:

1. Run `make check` and make sure everything passes
2. Add tests for new functionality

## Code Conventions

- Runtime: **Bun** (not Node.js)
- All new code must be TypeScript with explicit return types on exports
- Import without file extensions (`moduleResolution: "bundler"`)
- Use `Bun.spawn` instead of `child_process`
- Log with bracketed module prefix: `[kernel]`, `[runner]`, `[server]`
- Commit format: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`

## Architecture

See [AGENTS.md](AGENTS.md) for the full architecture guide. The key principle:

> The kernel is a declarative reconciliation loop. Do not add imperative workflow logic to it.

## Reporting Issues

Open a GitHub issue. Include:

- What you expected vs. what happened
- Steps to reproduce
- Output of `reeve doctor`
- Reeve version (`reeve --version`)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

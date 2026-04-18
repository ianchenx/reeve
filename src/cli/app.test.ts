import { describe, expect, test } from "bun:test"

import { createCliApp } from "./app"

const baseArgv = ["bun", "/usr/local/lib/reeve"]

describe("cli parser regression", () => {
  test("import command with team, review agent, and json", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [
        ...baseArgv,
        "import",
        "ianchenx/reeve",
        "--team",
        "ENG",
        "--review",
        "codex",
        "--json",
      ],
      { run: false },
    )

    expect(parsed.args).toEqual(["ianchenx/reeve"])
    expect(parsed.options.team).toBe("ENG")
    expect(parsed.options.review).toBe("codex")
    expect(parsed.options.json).toBe(true)
    expect(cli.matchedCommandName).toBe("import")
  })

  test("review command supports agent option", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "review", "--agent", "codex"],
      { run: false },
    )

    expect(parsed.args).toEqual([])
    expect(parsed.options.agent).toBe("codex")
    expect(cli.matchedCommandName).toBe("review")
  })

  test("logs command accepts follow and line count", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "logs", "-n", "15", "-f"],
      { run: false },
    )

    expect(parsed.args).toEqual([])
    expect(parsed.options.n).toBe(15)
    expect(Array.isArray(parsed.options.n)).toBe(false)
    expect(parsed.options.follow).toBe(true)
    expect(Array.isArray(parsed.options.follow)).toBe(false)
    expect(cli.matchedCommandName).toBe("logs")
  })

  test("remove command parses slug positional", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "remove", "my-project"],
      { run: false },
    )

    expect(parsed.args).toEqual(["my-project"])
    expect(cli.matchedCommandName).toBe("remove")
  })

  test("clean --all --force --purge", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "clean", "--all", "--force", "--purge"],
      { run: false },
    )

    expect(parsed.options.all).toBe(true)
    expect(parsed.options.force).toBe(true)
    expect(parsed.options.purge).toBe(true)
    expect(cli.matchedCommandName).toBe("clean")
  })

  test("history with identifier", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "history", "TES-7"],
      { run: false },
    )

    expect(parsed.args).toEqual(["TES-7"])
    expect(cli.matchedCommandName).toBe("history")
  })

  test("log with identifier and options", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "log", "TES-13", "-n", "50", "-f"],
      { run: false },
    )

    expect(parsed.args).toEqual(["TES-13"])
    expect(parsed.options.n).toBe(50)
    expect(parsed.options.follow).toBe(true)
    expect(cli.matchedCommandName).toBe("log")
  })

  test("daemon command parses", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "daemon"],
      { run: false },
    )

    expect(parsed.args).toEqual([])
    expect(cli.matchedCommandName).toBe("daemon")
  })

  test("global --json propagates to any command", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "tasks", "--json"],
      { run: false },
    )

    expect(parsed.options.json).toBe(true)
    expect(cli.matchedCommandName).toBe("tasks")
  })

  test("edit with multiple options", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "edit", "my-proj", "--agent", "codex", "--setup", "bun install", "--review", "off"],
      { run: false },
    )

    expect(parsed.args).toEqual(["my-proj"])
    expect(parsed.options.agent).toBe("codex")
    expect(parsed.options.setup).toBe("bun install")
    expect(parsed.options.review).toBe("off")
    expect(cli.matchedCommandName).toBe("edit")
  })

  test("review with identifier and all options", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "review", "TES-5", "--worktree", "/tmp/wt", "--pr-url", "https://github.com/x/y/pull/1", "--agent", "claude"],
      { run: false },
    )

    expect(parsed.args).toEqual(["TES-5"])
    expect(parsed.options.worktree).toBe("/tmp/wt")
    expect(parsed.options.prUrl).toBe("https://github.com/x/y/pull/1")
    expect(parsed.options.agent).toBe("claude")
    expect(cli.matchedCommandName).toBe("review")
  })
})

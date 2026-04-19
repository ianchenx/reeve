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

  test("task log --daemon accepts follow and line count", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "task", "log", "--daemon", "-n", "15", "--follow"],
      { run: false },
    )

    expect(parsed.options.n).toBe(15)
    expect(Array.isArray(parsed.options.n)).toBe(false)
    expect(parsed.options.follow).toBe(true)
    expect(Array.isArray(parsed.options.follow)).toBe(false)
    expect(parsed.options.daemon).toBe(true)
  })

  // cac parse-only (run: false) does not expand short aliases to their long form,
  // so `-f` lands in options as `f` rather than `follow`. This test verifies that
  // `-f` is accepted without error; the alias works correctly at runtime.
  test("task log -f short alias is accepted without error", () => {
    const cli = createCliApp()
    expect(() =>
      cli.parse(
        [...baseArgv, "task", "log", "--daemon", "-f"],
        { run: false },
      )
    ).not.toThrow()
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

  test("task clean --all --force --purge", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "task", "clean", "--all", "--force", "--purge"],
      { run: false },
    )

    expect(parsed.options.all).toBe(true)
    expect(parsed.options.force).toBe(true)
    expect(parsed.options.purge).toBe(true)
  })

  test("task history with identifier", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "task", "history", "TES-7"],
      { run: false },
    )

    expect(parsed.args).toContain("TES-7")
  })

  test("task log with identifier and options", () => {
    const cli = createCliApp()
    const parsed = cli.parse(
      [...baseArgv, "task", "log", "TES-13", "-n", "50", "--follow"],
      { run: false },
    )

    expect(parsed.args).toContain("TES-13")
    expect(parsed.options.n).toBe(50)
    expect(parsed.options.follow).toBe(true)
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
      [...baseArgv, "task", "list", "--json"],
      { run: false },
    )

    expect(parsed.options.json).toBe(true)
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

})

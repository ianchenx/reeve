import { describe, it, expect } from "bun:test"
import { cac } from "cac"
import { registerTaskCommands } from "./tasks"

describe("registerTaskCommands", () => {
  it("registers exactly the expected task subcommands", () => {
    const cli = cac("reeve")
    registerTaskCommands(cli)

    // cac stores rawName (with args) for subcommands
    const rawNames = cli.commands.map((c) => c.rawName).sort()
    expect(rawNames).toContain("status")
    expect(rawNames).toContain("task list")
    expect(rawNames).toContain("task show <identifier>")
    expect(rawNames).toContain("task log [identifier]")
    expect(rawNames).toContain("task cancel <identifier>")
    expect(rawNames).toContain("task history [identifier]")
    expect(rawNames).toContain("task clean [identifier]")
  })

  it("does not register legacy top-level task aliases", () => {
    const cli = cac("reeve")
    registerTaskCommands(cli)

    const rawNames = cli.commands.map((c) => c.rawName)
    expect(rawNames).not.toContain("tasks")
    expect(rawNames).not.toContain("task <identifier>")
    expect(rawNames).not.toContain("log [identifier]")
    expect(rawNames).not.toContain("logs")
    expect(rawNames).not.toContain("cancel <identifier>")
    expect(rawNames).not.toContain("history [identifier]")
    expect(rawNames).not.toContain("clean [identifier]")
  })
})

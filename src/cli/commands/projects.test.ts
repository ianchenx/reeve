import { describe, it, expect } from "bun:test"
import { cac } from "cac"
import { registerProjectCommands } from "./projects"

describe("registerProjectCommands", () => {
  it("registers exactly the expected project subcommands", () => {
    const cli = cac("reeve")
    registerProjectCommands(cli)

    // c.name strips angle/square args; c.rawName preserves the full signature (e.g. "project add <repo>")
    const rawNames = cli.commands.map((c) => c.rawName).sort()
    expect(rawNames).toContain("project add <repo>")
    expect(rawNames).toContain("project edit <slug>")
    expect(rawNames).toContain("project remove <slug>")
  })

  it("does not register legacy top-level project aliases", () => {
    const cli = cac("reeve")
    registerProjectCommands(cli)

    const rawNames = cli.commands.map((c) => c.rawName)
    expect(rawNames).not.toContain("import <repo>")
    expect(rawNames).not.toContain("remove <slug>")
    expect(rawNames).not.toContain("edit <slug>")
    expect(rawNames).not.toContain("repos")
  })
})

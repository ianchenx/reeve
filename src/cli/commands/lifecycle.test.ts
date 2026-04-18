import { describe, expect, it } from "bun:test"
import { buildRunNotReadyMessage } from "./lifecycle"

describe("buildRunNotReadyMessage", () => {
  it("lists all preflight issues and suggests fixes", () => {
    const msg = buildRunNotReadyMessage([
      "No Linear API key configured",
      "No projects configured",
    ])
    expect(msg).toContain("✗")
    expect(msg).toContain("No Linear API key configured")
    expect(msg).toContain("No projects configured")
    expect(msg).toContain("reeve init")
    expect(msg).toContain("reeve start")
  })

  it("handles single issue without a bulleted list fallback", () => {
    const msg = buildRunNotReadyMessage(["Codex CLI not installed"])
    expect(msg).toContain("Codex CLI not installed")
    expect(msg).toContain("reeve init")
  })
})

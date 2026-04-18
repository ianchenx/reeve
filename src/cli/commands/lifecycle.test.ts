import { describe, expect, it } from "bun:test"
import { buildRunNotReadyMessage, buildDaemonStartedBanner } from "./lifecycle"

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

describe("buildDaemonStartedBanner", () => {
  it("shows 3 actionable lines in start-friendly format", () => {
    const out = buildDaemonStartedBanner({ pid: 1234, port: 14500, logPath: "/tmp/reeve.log" })
    const lines = out.split("\n").filter(l => l.trim().length > 0)
    expect(lines.length).toBe(3)
    expect(lines[0]).toContain("http://localhost:14500")
    expect(out).toContain("/tmp/reeve.log")
    expect(out).toContain("reeve stop")
  })
})

import { describe, expect, test } from "bun:test"
import { ghInstallHint } from "./platform-hints"

describe("ghInstallHint", () => {
  test("darwin suggests brew", () => {
    const hint = ghInstallHint("darwin")
    expect(hint.join(" ")).toContain("brew install gh")
  })

  test("linux suggests apt/dnf with manual fallback link", () => {
    const hint = ghInstallHint("linux")
    const joined = hint.join(" ")
    expect(joined).toMatch(/apt|dnf|pacman/)
    expect(joined).toContain("https://cli.github.com")
  })

  test("win32 suggests winget", () => {
    const hint = ghInstallHint("win32")
    expect(hint.join(" ")).toContain("winget")
  })

  test("unknown platform falls back to upstream install docs", () => {
    // Cast: testing a platform value outside the known set
    const hint = ghInstallHint("freebsd" as NodeJS.Platform)
    expect(hint.join(" ")).toContain("https://cli.github.com")
  })

  test("never returns an empty array (doctor always has something to render)", () => {
    for (const p of ["darwin", "linux", "win32"] as const) {
      expect(ghInstallHint(p).length).toBeGreaterThan(0)
    }
  })
})

describe("ghInstallHint defaults", () => {
  test("defaults to current process.platform when no platform passed", () => {
    const hint = ghInstallHint()
    expect(hint.length).toBeGreaterThan(0)
    expect(hint[0]).toMatch(/brew|apt|winget|https/)
  })
})

import { describe, it, expect } from "bun:test"
import { detectInstallSourceFromPath, upgradeCommandFor } from "./install-source"

describe("detectInstallSourceFromPath", () => {
  it("identifies homebrew cellar path", () => {
    expect(detectInstallSourceFromPath("/usr/local/Cellar/reeve-ai/0.0.5/bin/reeve")).toBe("homebrew")
    expect(detectInstallSourceFromPath("/opt/homebrew/Cellar/reeve-ai/0.0.5/bin/reeve")).toBe("homebrew")
  })

  it("identifies bun global install", () => {
    expect(detectInstallSourceFromPath("/Users/foo/.bun/install/global/node_modules/reeve-ai/dist/cli.js")).toBe("bun-global")
  })

  it("identifies npm global install including homebrew's npm prefix", () => {
    expect(detectInstallSourceFromPath("/usr/local/lib/node_modules/reeve-ai/dist/cli.js")).toBe("npm-global")
    expect(detectInstallSourceFromPath("/opt/homebrew/lib/node_modules/reeve-ai/dist/cli.js")).toBe("npm-global")
  })

  it("identifies dev checkout by .ts extension", () => {
    expect(detectInstallSourceFromPath("/Users/foo/workspace/reeve/src/cli/app.ts")).toBe("dev")
  })

  it("falls back to unknown for unrecognized paths", () => {
    expect(detectInstallSourceFromPath("/tmp/random/reeve")).toBe("unknown")
  })
})

describe("upgradeCommandFor", () => {
  it("returns brew upgrade for homebrew", () => {
    expect(upgradeCommandFor("homebrew")).toEqual(["brew", "upgrade", "reeve-ai"])
  })

  it("returns bun add for bun-global", () => {
    expect(upgradeCommandFor("bun-global")).toEqual(["bun", "add", "-g", "reeve-ai@latest"])
  })

  it("returns npm install for npm-global", () => {
    expect(upgradeCommandFor("npm-global")).toEqual(["npm", "install", "-g", "reeve-ai@latest"])
  })

  it("returns curl install.sh for unknown", () => {
    expect(upgradeCommandFor("unknown")).toEqual([
      "sh",
      "-c",
      "curl -fsSL https://reeve.run/install.sh | bash",
    ])
  })

  it("returns null for dev (manual git pull)", () => {
    expect(upgradeCommandFor("dev")).toBeNull()
  })
})

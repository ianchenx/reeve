import { afterAll, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { cleanupTestTmp, testTmpDir } from "./test-helpers"

const INSTALL_SCRIPT = join(process.cwd(), "install.sh")
const decoder = new TextDecoder()

type Scenario = {
  alreadyConfigured: boolean
  bunMode?: "broken" | "working"
  pathHasBunDir: boolean
}

type RunResult = {
  bunBin: string
  exitCode: number
  output: string
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content)
  chmodSync(path, 0o755)
}

function runInstaller({ alreadyConfigured, bunMode = "working", pathHasBunDir }: Scenario): RunResult {
  const root = testTmpDir("install-script-")
  const home = join(root, "home")
  const bunInstall = join(home, ".bun")
  const bunBin = join(bunInstall, "bin")
  const toolBin = join(root, "tools")
  const settingsPath = join(home, ".reeve", "settings.json")

  mkdirSync(home, { recursive: true })
  mkdirSync(toolBin, { recursive: true })

  if (pathHasBunDir) {
    mkdirSync(bunBin, { recursive: true })
  }

  if (alreadyConfigured) {
    mkdirSync(join(home, ".reeve"), { recursive: true })
    writeFileSync(settingsPath, "{}\n")
  }

  const bunStubPath = join(pathHasBunDir ? bunBin : toolBin, "bun")
  writeExecutable(bunStubPath, bunMode === "broken" ? `#!/usr/bin/env bash
set -euo pipefail
echo "broken bun" >&2
exit 127
` : `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "--version" ]]; then
  echo "1.3.12"
  exit 0
fi

if [[ "\${1:-}" == "add" && "\${2:-}" == "-g" ]]; then
  mkdir -p '${bunBin}'
  cat > '${join(bunBin, "reeve")}' <<'EOF'
#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  echo "reeve/0.0.2 test"
  exit 0
fi
echo "unexpected reeve args: $*" >&2
exit 1
EOF
  chmod +x '${join(bunBin, "reeve")}'
  exit 0
fi

echo "unexpected bun args: $*" >&2
exit 1
`)

  const proc = Bun.spawnSync(["bash", INSTALL_SCRIPT], {
    cwd: root,
    env: {
      ...process.env,
      BUN_INSTALL: bunInstall,
      HOME: home,
      // Pin REEVE_DIR to the sandboxed home so we aren't fooled by a
      // REEVE_DIR leaked from the outer environment (CI sets one globally).
      REEVE_DIR: join(home, ".reeve"),
      PATH: pathHasBunDir ? `${bunBin}:${toolBin}:/usr/bin:/bin` : `${toolBin}:/usr/bin:/bin`,
    },
    stderr: "pipe",
    stdout: "pipe",
  })

  return {
    bunBin,
    exitCode: proc.exitCode,
    output: decoder.decode(proc.stdout) + decoder.decode(proc.stderr),
  }
}

afterAll(() => {
  cleanupTestTmp()
})

describe("install.sh next-step guidance", () => {
  test("shows PATH fix and init guidance for a fresh install", () => {
    const result = runInstaller({ alreadyConfigured: false, pathHasBunDir: false })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Reeve installed.")
    expect(result.output).toContain(`${result.bunBin} is not on your PATH in new shells.`)
    expect(result.output).toContain("For this shell:")
    expect(result.output).toContain(`export PATH=\"${result.bunBin}:$PATH\"`)
    expect(result.output).toContain("To persist, append that line to ~/.zshrc, ~/.bashrc, or your shell's rc file.")
    expect(result.output).toContain("Next: run reeve init to configure Linear + pick an agent.")
    expect(result.output).toContain("reeve --help lists every command.")
    expect(result.output).toContain("Docs: https://github.com/ianchenx/reeve")
    expect(result.output).not.toContain("Existing config detected")
  })

  test("skips PATH warning and still points a fresh install to init when Bun bin is already on PATH", () => {
    const result = runInstaller({ alreadyConfigured: false, pathHasBunDir: true })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Reeve installed.")
    expect(result.output).not.toContain("is not on your PATH in new shells.")
    expect(result.output).not.toContain("For this shell:")
    expect(result.output).toContain("Next: run reeve init to configure Linear + pick an agent.")
    expect(result.output).not.toContain("Existing config detected")
  })

  test("shows PATH fix but avoids re-init guidance for an existing config", () => {
    const result = runInstaller({ alreadyConfigured: true, pathHasBunDir: false })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(`${result.bunBin} is not on your PATH in new shells.`)
    expect(result.output).toContain("Existing config detected at")
    expect(result.output).toContain("no re-init needed.")
    expect(result.output).toContain("Run reeve --help to see all commands, or reeve start to launch the daemon.")
    expect(result.output).not.toContain("Next: run reeve init")
  })

  test("shows the existing-config guidance only when PATH is already ready", () => {
    const result = runInstaller({ alreadyConfigured: true, pathHasBunDir: true })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Existing config detected at")
    expect(result.output).toContain("Run reeve --help to see all commands, or reeve start to launch the daemon.")
    expect(result.output).not.toContain("is not on your PATH in new shells.")
    expect(result.output).not.toContain("Next: run reeve init")
  })

  test("fails early when Bun is present on PATH but cannot run", () => {
    const result = runInstaller({ alreadyConfigured: false, bunMode: "broken", pathHasBunDir: true })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("error: Bun is installed but failed to run:")
    expect(result.output).toContain("broken bun")
    expect(result.output).not.toContain("Installing reeve-ai globally with bun")
  })
})

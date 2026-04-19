export type SpawnResult =
  | { kind: "ok"; exitCode: number; stdout: Buffer | undefined; stderr: Buffer | undefined }
  | { kind: "not-installed"; cmd: string }
  | { kind: "error"; cmd: string; error: Error }

export function trySpawnSync(
  cmd: string[],
  options?: Parameters<typeof Bun.spawnSync>[1],
  spawn: typeof Bun.spawnSync = Bun.spawnSync,
): SpawnResult {
  const name = cmd[0] ?? ""
  try {
    const proc = spawn(cmd, options)
    return { kind: "ok", exitCode: proc.exitCode, stdout: proc.stdout, stderr: proc.stderr }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { kind: "not-installed", cmd: name }
    }
    return { kind: "error", cmd: name, error: err as Error }
  }
}

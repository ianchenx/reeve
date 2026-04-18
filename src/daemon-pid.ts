// daemon-pid.ts — Shared PID file helpers for the background daemon.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { getSettingsPath } from './config'

export function getPidPath(): string {
  return resolve(getSettingsPath(), '..', 'reeve.pid')
}

export function readPid(): number | null {
  const pidPath = getPidPath()
  if (!existsSync(pidPath)) return null
  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim())
  if (isNaN(pid)) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch {
    try { unlinkSync(pidPath) } catch {}
    return null
  }
}

export function writePid(pid: number): void {
  writeFileSync(getPidPath(), String(pid))
}

export function removePid(): void {
  try { unlinkSync(getPidPath()) } catch {}
}

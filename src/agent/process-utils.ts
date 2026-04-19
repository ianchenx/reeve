// agent/process-utils.ts — Shared process management helpers for backends.

import type { RunnerLogger } from './types';
import { trySpawnSync } from '../utils/spawn';

export async function collectStderr(
  stream: ReadableStream<Uint8Array>,
  buffer: { text: string },
  identifier: string,
  label: string,
  log: RunnerLogger,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text.trim()) {
        log.error({ identifier, stderr: text.trim() }, `${label} stderr`);
        buffer.text += text;
        if (buffer.text.length > 10_240) buffer.text = buffer.text.slice(-10_240);
      }
    }
  } catch {}
}

export function findChildPids(parentPid: number, execSync?: typeof Bun.spawnSync): number[] {
  const result = trySpawnSync(['pgrep', '-P', String(parentPid)], undefined, execSync);
  if (result.kind !== 'ok' || result.exitCode !== 0) return [];
  const stdout = result.stdout?.toString().trim() ?? '';
  if (!stdout) return [];
  return stdout.split('\n').map(Number).filter(Boolean);
}

/**
 * Recursively kill a process and all its descendants (bottom-up).
 * Uses pgrep to find children; if pgrep is missing, still SIGTERM the parent.
 */
export function killProcessTree(pid: number): void {
  for (const childPid of findChildPids(pid)) {
    killProcessTree(childPid);
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

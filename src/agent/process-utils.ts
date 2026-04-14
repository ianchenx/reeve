// agent/process-utils.ts — Shared process management helpers for backends.

import type { RunnerLogger } from './types';

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

/**
 * Recursively kill a process and all its descendants (bottom-up).
 * Uses pgrep to find children, recurses, then kills the parent with SIGTERM.
 */
export function killProcessTree(pid: number): void {
  try {
    const result = Bun.spawnSync(['pgrep', '-P', String(pid)]);
    const stdout = result.stdout.toString().trim();
    if (stdout) {
      for (const childPid of stdout.split('\n').map(Number).filter(Boolean)) {
        killProcessTree(childPid);
      }
    }
  } catch {}
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

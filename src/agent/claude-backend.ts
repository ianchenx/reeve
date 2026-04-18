// agent/claude-backend.ts — Native Claude Code CLI adapter.
//
// Spawns `claude --print --output-format stream-json --verbose
// --permission-mode bypassPermissions` with either --session-id (first spawn)
// or --resume (continuation). Reads NDJSON from stdout and emits ACPEvents
// via claude-parser.

import { appendFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { ReeveDaemonConfig } from '../config';
import type { AgentBackend, SpawnOptions } from './backend';
import { prepareClaudeSandbox } from './claude-sandbox';
import { parseClaudeLine } from './claude-parser';
import { collectStderr, killProcessTree } from './process-utils';
import { noopLogger } from './types';
import { spawnPath } from '../utils/path';
import type {
  ACPEvent,
  AgentEventHandler,
  AgentTask,
  RunnerLogger,
  SpawnResult,
} from './types';

async function parseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: AgentEventHandler,
  identifier: string,
  log: RunnerLogger,
  sessionLogPath: string,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const raw = JSON.parse(line);
      try {
        appendFileSync(sessionLogPath, `${line}\n`);
      } catch (err) {
        log.warn({ err, identifier }, 'Failed to append claude session log');
      }
      for (const event of parseClaudeLine(raw)) {
        onEvent(event);
      }
    } catch {
      // Non-JSON line — ignore. Claude should not emit these in stream-json
      // mode, but log a sample for diagnostics.
      log.info({ identifier, line: line.slice(0, 120) }, 'non-json claude stdout');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) flushLine(line);
    }
    if (buffer.trim()) flushLine(buffer);
  } catch (err) {
    log.error({ err, identifier }, 'claude stdout stream error');
  }
}

export const claudeBackend: AgentBackend = {
  name: 'claude',
  prepareSandbox: prepareClaudeSandbox,

  async spawn(
    task: AgentTask,
    workDir: string,
    prompt: string,
    _config: ReeveDaemonConfig,
    onEvent: AgentEventHandler,
    options: SpawnOptions,
  ): Promise<SpawnResult> {
    const log = noopLogger;
    const stderrBuffer = { text: '' };

    // First spawn: generate a fresh UUID. Continuation: reuse existing.
    const isResume = Boolean(options.sessionId);
    const sessionId = options.sessionId ?? crypto.randomUUID();

    const args = [
      ...(options.sandbox?.extraArgs ?? []),
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
      isResume ? '--resume' : '--session-id',
      sessionId,
      '-p',
      prompt,
    ];

    log.info({ sessionId, isResume, pid: 'pending' }, 'Spawning claude');

    const sessionLogPath = resolve(options.logDir, 'session.ndjson');
    writeFileSync(sessionLogPath, '');

    const proc = Bun.spawn(['claude', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: workDir,
      env: {
        ...process.env,
        ...(options.sandbox?.env ?? {}),
        PATH: spawnPath(),
      },
    });

    let latestUsage: ACPEvent['usage'] | undefined;

    parseStream(
      proc.stdout,
      (event) => {
        if (event.type === 'usage' && event.usage) latestUsage = event.usage;
        onEvent(event);
      },
      task.identifier,
      log,
      sessionLogPath,
    );

    collectStderr(proc.stderr, stderrBuffer, task.identifier, 'claude', log);

    const done = proc.exited.then((code) => {
      log.info(
        { sessionId, pid: proc.pid, exitCode: code, contextUsed: latestUsage?.contextUsed },
        'claude exited',
      );
      try {
        appendFileSync(
          sessionLogPath,
          JSON.stringify({ _type: 'exit', code, at: new Date().toISOString(), usage: latestUsage }) +
            '\n',
        );
      } catch {}
      return code;
    });

    return {
      pid: proc.pid,
      agent: 'claude',
      sessionId,
      done,
      stderrBuffer,
    };
  },
};

export { killProcessTree };

// agent/codex-backend.ts — Native Codex app-server adapter.
//
// Each task spawns one `codex app-server --listen stdio://` subprocess.
// Lifecycle:
//   1. spawn subprocess in worktree
//   2. client.request('initialize', { clientInfo })
//   3. thread/start { cwd, sandbox, approvalPolicy:"never" } (or thread/resume on continuation)
//   4. kick off background IIFE:
//        a. turn/start { threadId, input }
//        b. await turn/completed notification
//        c. shutdown client → killProcessTree → resolve done with exit code
//   5. return SpawnResult with resolvedThreadId populated
//
// Approval policy is set to "never" on thread/start so codex does not ask.
// The onServerRequest handler exists as a defensive fallback for any
// approval that still arrives (mcp elicitations, etc.).

import { appendFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { ReeveDaemonConfig } from '../config';
import type { AgentBackend, SpawnOptions } from './backend';
import {
  CodexClient,
  type JsonRpcNotification,
  type WritableStream,
} from './codex-client';
import { mapCodexNotification } from './codex-mapper';
import { prepareCodexSandbox } from './codex-sandbox';
import { collectStderr, killProcessTree } from './process-utils';
import { noopLogger } from './types';
import type {
  AgentEventHandler,
  AgentTask,
  RunnerLogger,
  SpawnResult,
} from './types';
import type { TokenUsageSnapshot } from '../persistence';

/**
 * Default auto-approval reply. Response shapes differ between APIs:
 *   execCommandApproval / applyPatchApproval         → { decision: "approved" }
 *   item/commandExecution|fileChange/requestApproval → { decision: "accept" }
 *   item/permissions/requestApproval                 → { permissions: {}, scope: "session" }
 * Anything else gets an empty object which codex treats as "no override".
 */
function defaultApprovalReply(method: string): unknown {
  if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
    return { decision: 'approved' };
  }
  if (method.endsWith('/requestApproval')) {
    if (method.includes('permissions')) {
      return { permissions: {}, scope: 'session' };
    }
    return { decision: 'accept' };
  }
  return {};
}

async function pumpStdout(
  stream: ReadableStream<Uint8Array>,
  client: CodexClient,
  sessionLogPath: string,
  identifier: string,
  log: RunnerLogger,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    try {
      appendFileSync(sessionLogPath, `${line}\n`);
    } catch (err) {
      log.warn({ err, identifier }, 'Failed to append codex session log');
    }
    client.handleLine(line);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    }
    if (buffer.trim()) handleLine(buffer);
  } catch (err) {
    log.error({ err, identifier }, 'codex stdout stream error');
  }
}

export const codexBackend: AgentBackend = {
  name: 'codex',
  prepareSandbox: prepareCodexSandbox,

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

    const sessionLogPath = resolve(options.logDir, 'session.ndjson');
    writeFileSync(sessionLogPath, '');

    log.info(
      { identifier: task.identifier, hasThread: !!options.threadId },
      'Spawning codex',
    );

    const extraArgs = options.sandbox?.extraArgs ?? [];
    const proc = Bun.spawn(['codex', ...extraArgs, 'app-server', '--listen', 'stdio://'], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
      cwd: workDir,
      env: {
        ...process.env,
        ...(options.sandbox?.env ?? {}),
        PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
      },
    });

    const stdin: WritableStream = {
      write(chunk: string) {
        proc.stdin.write(chunk);
      },
    };

    let resolvedThreadId: string | undefined;
    let latestUsage: TokenUsageSnapshot | undefined;
    let turnCompletedResolve!: () => void;
    const turnCompleted = new Promise<void>((r) => {
      turnCompletedResolve = r;
    });

    const onNotification = (msg: JsonRpcNotification) => {
      const result = mapCodexNotification(msg.method, msg.params);
      if (!result) return;
      if (result.threadId) resolvedThreadId = result.threadId;
      if (result.event) {
        if (result.event.type === 'usage' && result.event.usage) {
          latestUsage = result.event.usage;
        }
        onEvent(result.event);
      }
      if (result.turnCompleted) turnCompletedResolve();
    };

    const client = new CodexClient(
      stdin,
      onNotification,
      (method) => defaultApprovalReply(method),
    );

    pumpStdout(proc.stdout, client, sessionLogPath, task.identifier, log);
    collectStderr(proc.stderr, stderrBuffer, task.identifier, 'codex', log);

    // ── Phase 1: synchronous handshake (must complete before return) ──
    try {
      await client.request('initialize', {
        clientInfo: { name: 'reeve', version: '0.1.0' },
      });

      if (options.threadId) {
        await client.request('thread/resume', { threadId: options.threadId });
        resolvedThreadId = options.threadId;
      } else {
        const started = (await client.request('thread/start', {
          cwd: workDir,
          sandbox: 'danger-full-access',
          approvalPolicy: 'never',
        })) as { thread?: { id?: string } };
        resolvedThreadId = started?.thread?.id ?? resolvedThreadId;
      }

      if (!resolvedThreadId) {
        throw new Error('codex: thread/start did not return a thread id');
      }
    } catch (err) {
      client.shutdown('handshake failed');
      killProcessTree(proc.pid);
      throw err;
    }

    // ── Phase 2: background turn execution feeds `done` ──
    const done = (async () => {
      try {
        await client.request('turn/start', {
          threadId: resolvedThreadId,
          input: [{ type: 'text', text: prompt }],
        });
        await turnCompleted;
        client.shutdown('turn completed');
        killProcessTree(proc.pid);
        return (await proc.exited) ?? 0;
      } catch (err) {
        log.error({ err, identifier: task.identifier }, 'codex turn failed');
        client.shutdown('turn error');
        killProcessTree(proc.pid);
        const exitCode = await proc.exited;
        return exitCode || 1;
      } finally {
        try {
          appendFileSync(
            sessionLogPath,
            JSON.stringify({
              _type: 'exit',
              threadId: resolvedThreadId,
              at: new Date().toISOString(),
              usage: latestUsage,
            }) + '\n',
          );
        } catch {}
      }
    })();

    return {
      pid: proc.pid,
      agent: 'codex',
      threadId: resolvedThreadId,
      done,
      stderrBuffer,
    };
  },
};

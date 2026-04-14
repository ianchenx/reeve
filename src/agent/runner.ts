// agent/runner.ts — Facade that routes to native CLI backends.
//
// Responsibilities:
//   1. Resolve which backend to use (claude / codex) based on agent name.
//   2. Set up the shared log directory, archive prior attempt, write meta.json.
//   3. Delegate spawn to the backend and return its SpawnResult unchanged.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { resolve } from 'path';

import type { ReeveDaemonConfig } from '../config';
import { writeJsonFileAtomic } from '../persistence';

import type { AgentBackend } from './backend';
import { claudeBackend } from './claude-backend';
import { codexBackend } from './codex-backend';
import { isProcessAlive, killProcessTree } from './process-utils';
import type {
  AgentEventHandler,
  AgentTask,
  RunnerLogger,
  SpawnLogMetadata,
  SpawnResult,
} from './types';

export type {
  ACPEvent,
  AgentEventHandler,
  AgentTask,
  AgentType,
  ProcessStage,
  SpawnLogMetadata,
  SpawnResult,
} from './types';

function archiveCurrentAttemptLogs(
  baseLogDir: string,
  nextAttempt: number,
  log: RunnerLogger = console,
): void {
  const metaPath = resolve(baseLogDir, 'meta.json');
  if (!existsSync(metaPath)) return;

  let previousAttempt = Math.max(nextAttempt - 1, 1);
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    if (typeof meta.attempt === 'number' && Number.isFinite(meta.attempt)) {
      previousAttempt = meta.attempt;
    }
  } catch {}

  const archiveDir = resolve(baseLogDir, `attempt-${previousAttempt}`);
  mkdirSync(archiveDir, { recursive: true });

  for (const filename of ['prompt.txt', 'meta.json', 'session.ndjson'] as const) {
    const sourcePath = resolve(baseLogDir, filename);
    if (!existsSync(sourcePath)) continue;
    const destinationPath = resolve(archiveDir, filename);
    try {
      renameSync(sourcePath, destinationPath);
    } catch (err) {
      log.warn({ err, filename, baseLogDir }, 'Failed to archive attempt log file');
    }
  }
}

function resolveBackend(agentName: string): AgentBackend {
  if (agentName === 'codex') return codexBackend;
  if (agentName === 'claude') return claudeBackend;
  throw new Error(`Unsupported agent: ${agentName}`);
}

/**
 * Spawn a coding agent via the appropriate native backend.
 *
 * Responsibilities split:
 *   - This function: resolve backend + write meta.json + archive prior attempt.
 *   - Backend (claude/codex): subprocess lifecycle + stream parsing + session state.
 */
export async function spawnAgent(
  task: AgentTask,
  workDir: string,
  prompt: string,
  config: ReeveDaemonConfig,
  onEvent: AgentEventHandler,
  attempt = 1,
  agent: string,
  logDir?: string,
  logMetadata?: SpawnLogMetadata,
  sessionId?: string,
  threadId?: string,
): Promise<SpawnResult> {
  const log: RunnerLogger = console as RunnerLogger;
  const agentName = agent;

  const resolvedLogDir = logDir ?? workDir;
  if (attempt > 1) {
    archiveCurrentAttemptLogs(resolvedLogDir, attempt, log);
  }
  mkdirSync(resolvedLogDir, { recursive: true });

  writeFileSync(resolve(resolvedLogDir, 'prompt.txt'), prompt);
  writeJsonFileAtomic(resolve(resolvedLogDir, 'meta.json'), {
    issueId: task.id,
    identifier: task.identifier,
    title: task.title,
    agent: agentName,
    attempt,
    repo: task.repo,
    worktree: workDir,
    startedAt: new Date().toISOString(),
    integrity: 'complete',
    ...(logMetadata?.stage ? { stage: logMetadata.stage } : {}),
    ...(typeof logMetadata?.hookReviewRound === 'number'
      ? { hookReviewRound: logMetadata.hookReviewRound }
      : {}),
  });

  const backend = resolveBackend(agentName);
  const sandbox = backend.prepareSandbox
    ? await backend.prepareSandbox(workDir, config)
    : {};
  const result = await backend.spawn(task, workDir, prompt, config, onEvent, {
    attempt,
    sessionId,
    threadId,
    logDir: resolvedLogDir,
    logMetadata,
    sandbox,
  });

  log.info({ agentName, pid: result.pid, attempt }, 'Spawned native agent');

  // Update meta.json with final outcome on exit (backend-agnostic).
  // This is the fallback writer — enrichMeta() writes richer data for main agent exits.
  // Guard: only write if endedAt is not already set (enrichMeta ran first).
  result.done.then((exitCode) => {
    try {
      const metaPath = resolve(resolvedLogDir, 'meta.json');
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<
          string,
          unknown
        >;
        if (!meta.endedAt) {
          meta.endedAt = new Date().toISOString();
          meta.exitCode = exitCode;
          meta.outcome = exitCode === 0 ? 'completed' : 'failed';
          writeJsonFileAtomic(metaPath, meta);
        }
      }
    } catch (err) {
      log.warn({ err, identifier: task.identifier }, 'Failed to update meta.json');
    }
  });

  return result;
}

// ── Process management re-exports (kept for kernel consumers) ──

export function killAgent(pid: number): boolean {
  try {
    killProcessTree(pid);
    return true;
  } catch {
    return false;
  }
}

export function isAgentAlive(pid: number): boolean {
  return isProcessAlive(pid);
}

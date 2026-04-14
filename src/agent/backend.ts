// agent/backend.ts — Abstraction over native CLI runners.
//
// A backend owns everything between "spawn a subprocess" and "close it", and
// emits normalized ACPEvents to the caller. The router in runner.ts picks a
// backend based on the resolved agent name.

import type { ReeveDaemonConfig } from '../config';
import type {
  AgentEventHandler,
  AgentTask,
  SpawnLogMetadata,
  SpawnResult,
} from './types';

export interface SandboxHandle {
  env?: Record<string, string>;
  extraArgs?: string[];
}

export interface SpawnOptions {
  /** 1-indexed retry attempt for logging / meta.json. */
  attempt: number;
  /** Claude CLI: passed to `--resume` on continuation spawns. */
  sessionId?: string;
  /** Codex app-server: passed to `thread/resume` on continuation spawns. */
  threadId?: string;
  /** Absolute directory where prompt.txt, meta.json, session.ndjson live. */
  logDir: string;
  /** Extra metadata persisted into meta.json. */
  logMetadata?: SpawnLogMetadata;
  /** Backend-specific runtime config prepared before spawn. */
  sandbox?: SandboxHandle;
}

export interface AgentBackend {
  /** Name the router matches against (e.g. "claude", "codex"). */
  readonly name: string;

  prepareSandbox?(
    workDir: string,
    config: ReeveDaemonConfig,
  ): Promise<SandboxHandle>;

  spawn(
    task: AgentTask,
    workDir: string,
    prompt: string,
    config: ReeveDaemonConfig,
    onEvent: AgentEventHandler,
    options: SpawnOptions,
  ): Promise<SpawnResult>;
}

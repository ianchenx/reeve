// agent/types.ts — Shared types for agent runners and backends.
//
// These types were previously defined inline in runner.ts. They are extracted
// here so individual backends (claude-backend, codex-backend) can import them
// without depending on runner.ts.

import type { TokenUsageSnapshot } from '../persistence';

/** Minimal task shape for agent spawning — no dependency on kernel types. */
export interface AgentTask {
  id: string;
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  priority: number | null;
  state: string;
  repo: string;
  comments?: Array<{ body: string; author: string; createdAt: string }>;
}

export type ProcessStage = 'implement' | 'review';

export type AgentType = 'codex' | 'claude' | 'auto';

/**
 * Normalized agent event surfaced to the kernel. Backend adapters translate
 * their native event streams into this shape.
 *
 * `callId` lets consumers (dashboard, kernel) pair a `tool_call` with its
 * eventual `tool_result`. Claude's stream-json provides this via `tool_use.id`
 * and `tool_result.tool_use_id`; Codex provides it via `item.id` on both
 * `item/started` and `item/completed` envelopes.
 */
export interface ACPEvent {
  type:
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'usage'
    | 'approval_request'
    | 'session_ready'
    | 'other';
  /** text body — assistant text, thinking text, or tool_result output. */
  content?: string;
  /** Tool name for tool_call / tool_result; human title otherwise. */
  title?: string;
  /** "running" | "completed" | "failed". */
  status?: string;
  /** Correlates a tool_call with its tool_result. Undefined for non-tool events. */
  callId?: string;
  /** Input arguments passed to the tool on tool_call (Bash command, file path, etc.). */
  toolInput?: Record<string, unknown>;
  tokensUsed?: number;
  usage?: TokenUsageSnapshot;
  cost?: number;
  rawMethod?: string;
}

export type AgentEventHandler = (event: ACPEvent) => void;

export interface SpawnResult {
  pid: number;
  agent: string;
  /** Session handle returned by Claude CLI for `--resume` on next spawn. Populated by claude-backend (Task 4). */
  sessionId?: string;
  /** Thread handle returned by Codex app-server for `thread/resume` on next spawn. Populated by codex-backend (Task 7). */
  threadId?: string;
  /** Resolves with the agent's exit code when the subprocess terminates. */
  done: Promise<number>;
  /** Shared buffer backends append stderr text into for failure analysis. */
  stderrBuffer: { text: string };
}

export interface SpawnLogMetadata {
  stage?: ProcessStage;
  hookReviewRound?: number;
}

export type RunnerLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export const noopLogger: RunnerLogger = {
  info() {},
  warn() {},
  error() {},
};

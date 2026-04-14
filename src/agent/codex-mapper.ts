// agent/codex-mapper.ts — Translator from codex app-server notifications to ACPEvents.
//
// Codex wraps most events under a unified "item" envelope with a `type`
// discriminator (command_execution, file_change, agent_message, etc.).
// Deltas (`item/agentMessage/delta`) stream partial content during a turn.
// Thread and turn lifecycle notifications are surfaced only to drive the
// backend state machine (e.g. resolve the `done` promise on turn/completed).

import type { ACPEvent } from './types';
import type { TokenUsageSnapshot } from '../persistence';

export interface CodexMapResult {
  /** ACPEvent to forward to the kernel, if any. */
  event?: ACPEvent;
  /** Non-null on thread/started — carries the thread id to persist. */
  threadId?: string;
  /** True on turn/completed — backend should resolve the done promise. */
  turnCompleted?: boolean;
}

function extractUsage(params: unknown): TokenUsageSnapshot | null {
  const p = params as Record<string, unknown> | undefined;
  const usage = (p?.usage ?? p) as Record<string, unknown> | undefined;
  if (!usage) return null;
  const input = Number(usage.input_tokens ?? 0) || 0;
  const output = Number(usage.output_tokens ?? 0) || 0;
  const cached = Number(usage.cached_input_tokens ?? 0) || 0;
  const total = Number(usage.total_tokens ?? input + output) || input + output;
  return {
    input,
    output,
    total,
    contextUsed: input + cached,
    contextSize: undefined,
  };
}

function mapItemStarted(item: Record<string, unknown>): ACPEvent | null {
  const type = item.type as string | undefined;
  const callId = item.id as string | undefined;
  switch (type) {
    case 'commandExecution':
    case 'command_execution': {
      const command = String(item.command ?? '');
      return {
        type: 'tool_call',
        title: 'bash',
        status: 'running',
        content: command,
        callId,
        toolInput: { command },
        rawMethod: 'item/started:commandExecution',
      };
    }
    case 'fileChange':
    case 'file_change': {
      const changes = item.changes as Array<{ path?: string }> | undefined;
      const path = changes?.[0]?.path ?? String(item.path ?? '');
      return {
        type: 'tool_call',
        title: 'edit',
        status: 'running',
        content: path,
        callId,
        toolInput: { path },
        rawMethod: 'item/started:fileChange',
      };
    }
    default:
      return null;
  }
}

function mapItemCompleted(item: Record<string, unknown>): ACPEvent | null {
  const type = item.type as string | undefined;
  const callId = item.id as string | undefined;
  switch (type) {
    case 'commandExecution':
    case 'command_execution': {
      const exitCode = Number(item.exitCode ?? item.exit_code ?? 0);
      return {
        type: 'tool_result',
        title: 'bash',
        status: exitCode === 0 ? 'completed' : 'failed',
        callId,
        rawMethod: 'item/completed:commandExecution',
      };
    }
    case 'fileChange':
    case 'file_change':
      return {
        type: 'tool_result',
        title: 'edit',
        status: 'completed',
        callId,
        rawMethod: 'item/completed:fileChange',
      };
    case 'agentMessage':
    case 'agent_message': {
      const text = String(item.text ?? '');
      return {
        type: 'thinking',
        content: text.slice(0, 300),
        callId,
        rawMethod: 'item/completed:agentMessage',
      };
    }
    default:
      return null;
  }
}

export function mapCodexNotification(
  method: string,
  params: unknown,
): CodexMapResult | null {
  const p = params as Record<string, unknown> | undefined;

  switch (method) {
    case 'thread/started': {
      const thread = p?.thread as Record<string, unknown> | undefined;
      const threadId = thread?.id as string | undefined;
      return {
        threadId,
        event: {
          type: 'session_ready',
          content: threadId,
          rawMethod: method,
        },
      };
    }

    case 'turn/started':
      return {}; // internal — consumed but nothing surfaced

    case 'turn/completed': {
      const usage = extractUsage(p);
      return {
        turnCompleted: true,
        event: usage
          ? {
              type: 'usage',
              tokensUsed: usage.total,
              usage,
              rawMethod: method,
            }
          : undefined,
      };
    }

    case 'item/started': {
      const item = p?.item as Record<string, unknown> | undefined;
      if (!item) return null;
      const event = mapItemStarted(item);
      return event ? { event } : null;
    }

    case 'item/completed': {
      const item = p?.item as Record<string, unknown> | undefined;
      if (!item) return null;
      const event = mapItemCompleted(item);
      return event ? { event } : null;
    }

    case 'item/agentMessage/delta': {
      const delta = p?.delta as string | undefined;
      if (!delta) return null;
      return {
        event: {
          type: 'thinking',
          content: delta.slice(0, 300),
          rawMethod: method,
        },
      };
    }

    case 'thread/tokenUsage/updated': {
      const usage = extractUsage(p);
      if (!usage) return null;
      return {
        event: {
          type: 'usage',
          tokensUsed: usage.total,
          usage,
          rawMethod: method,
        },
      };
    }

    default:
      return null;
  }
}

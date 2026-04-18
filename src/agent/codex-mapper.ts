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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readNumber(record: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function hasUsageFields(record: Record<string, unknown> | undefined): boolean {
  return !!record && [
    'inputTokens',
    'input_tokens',
    'outputTokens',
    'output_tokens',
    'totalTokens',
    'total_tokens',
    'cachedInputTokens',
    'cached_input_tokens',
    'total',
  ].some(key => key in record);
}

function extractUsage(params: unknown): TokenUsageSnapshot | null {
  const p = asRecord(params);
  if (!p) return null;

  const tokenUsage = asRecord(p.tokenUsage);
  const totalBucket = asRecord(tokenUsage?.total);
  const lastBucket = asRecord(tokenUsage?.last);
  const directUsage = asRecord(p.usage);
  const usage = totalBucket ?? directUsage ?? (hasUsageFields(p) ? p : undefined);

  if (!hasUsageFields(usage)) return null;

  const input = readNumber(usage, 'inputTokens', 'input_tokens', 'input') ?? 0;
  const output = readNumber(usage, 'outputTokens', 'output_tokens', 'output') ?? 0;
  const cacheRead = readNumber(usage, 'cachedInputTokens', 'cached_input_tokens', 'cacheRead') ?? 0;
  const total = readNumber(usage, 'totalTokens', 'total_tokens', 'total') ?? (input + output);
  const contextSize = readNumber(tokenUsage, 'modelContextWindow', 'model_context_window')
    ?? readNumber(usage, 'modelContextWindow', 'model_context_window');

  const contextInput = lastBucket
    ? (readNumber(lastBucket, 'inputTokens', 'input_tokens', 'input') ?? 0)
    : totalBucket
      ? undefined
      : input;
  const contextCacheRead = lastBucket
    ? (readNumber(lastBucket, 'cachedInputTokens', 'cached_input_tokens', 'cacheRead') ?? 0)
    : totalBucket
      ? undefined
      : cacheRead;
  const contextUsed = contextInput !== undefined && contextCacheRead !== undefined
    ? contextInput + contextCacheRead
    : undefined;

  return {
    input,
    output,
    total,
    cacheRead: cacheRead || undefined,
    contextUsed,
    contextSize,
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

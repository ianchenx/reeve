// agent/claude-parser.ts — Pure translator from Claude stream-json lines to ACPEvents.
//
// Claude CLI emits NDJSON with a handful of top-level types:
//   { type: "system", subtype: "init", session_id, tools }
//   { type: "assistant", message: { content: [{type:"text"|"thinking"|"tool_use"}], usage } }
//   { type: "user", message: { content: [{type:"tool_result", content, is_error}] } }
//   { type: "result", subtype, usage, total_cost_usd, ... }
//
// A single assistant line often carries BOTH content blocks and a usage
// roll-up, so the parser returns an ACPEvent array rather than a single event.
//
// Usage semantics differ between event kinds:
//   - assistant.message.usage  → per-turn delta (what that one turn consumed).
//                                We surface contextUsed = input + cacheRead + cacheCreate.
//   - result.usage             → authoritative cumulative totals for the session.
//                                We surface costUsd from result.total_cost_usd.
// Consumers must MERGE successive usage events (not overwrite), so the final
// result snapshot supplies the cumulative totals while earlier assistant
// snapshots preserve the last observed contextUsed.
//
// tool_result blocks are wrapped in USER messages, not assistant messages —
// the CLI echoes the tool output back to the model via a synthetic user turn.

import type { ACPEvent } from './types';
import type { TokenUsageSnapshot } from '../persistence';

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;               // tool_use block id, used as callId
  tool_use_id?: string;      // tool_result back-reference to tool_use.id
  input?: Record<string, unknown>;
  content?: string | Array<{ type?: string; text?: string }>;
  is_error?: boolean;
}

function extractToolResultText(content: ContentBlock['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => typeof c?.text === 'string')
      .map((c) => c.text as string)
      .join('');
  }
  return '';
}

interface RawUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

function readRawUsage(usage: Record<string, unknown>): RawUsage {
  return {
    input: Number(usage.input_tokens ?? 0) || 0,
    output: Number(usage.output_tokens ?? 0) || 0,
    cacheRead: Number(usage.cache_read_input_tokens ?? 0) || 0,
    cacheCreate: Number(usage.cache_creation_input_tokens ?? 0) || 0,
  };
}

// Assistant lines carry per-turn deltas; contextUsed reflects the tokens the
// model saw on THIS turn (prompt + cache hits + cache writes).
function extractAssistantUsage(message: Record<string, unknown>): TokenUsageSnapshot | null {
  const usage = message.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const { input, output, cacheRead, cacheCreate } = readRawUsage(usage);
  const snap: TokenUsageSnapshot = {
    input,
    output,
    total: input + output,
    contextUsed: input + cacheRead + cacheCreate,
  };
  if (cacheRead > 0) snap.cacheRead = cacheRead;
  return snap;
}

// Result lines carry session-wide cumulative totals and final cost. No
// contextUsed: the cumulative cacheRead is not a context-window measure.
function extractResultUsage(raw: Record<string, unknown>): TokenUsageSnapshot | null {
  const usage = raw.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const { input, output, cacheRead } = readRawUsage(usage);
  const snap: TokenUsageSnapshot = {
    input,
    output,
    total: input + output,
  };
  if (cacheRead > 0) snap.cacheRead = cacheRead;
  const cost = Number(raw.total_cost_usd);
  if (Number.isFinite(cost) && cost > 0) snap.costUsd = cost;
  return snap;
}

function eventFromContentBlock(block: ContentBlock): ACPEvent | null {
  switch (block.type) {
    case 'text': {
      if (!block.text) return null;
      return {
        type: 'thinking',
        content: block.text,
        rawMethod: 'assistant.text',
      };
    }
    case 'thinking': {
      const text = block.thinking ?? '';
      return {
        type: 'thinking',
        content: text.slice(0, 300),
        rawMethod: 'assistant.thinking',
      };
    }
    case 'tool_use': {
      return {
        type: 'tool_call',
        title: block.name,
        status: 'running',
        callId: block.id,
        toolInput: block.input,
        rawMethod: 'assistant.tool_use',
      };
    }
    default:
      return null;
  }
}

/**
 * Translate a single parsed NDJSON line from Claude stream-json into an
 * array of normalized ACPEvents. Returns [] for lines we don't surface.
 */
export function parseClaudeLine(raw: unknown): ACPEvent[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const type = r.type as string | undefined;

  // ── system.init ────────────────────────────────────────────
  if (type === 'system' && r.subtype === 'init') {
    const sessionId = r.session_id as string | undefined;
    return [
      {
        type: 'session_ready',
        content: sessionId,
        rawMethod: 'system.init',
      },
    ];
  }

  // ── assistant ──────────────────────────────────────────────
  if (type === 'assistant') {
    const message = r.message as Record<string, unknown> | undefined;
    if (!message) return [];
    const events: ACPEvent[] = [];

    // 1. Content events (text / thinking / tool_use)
    const content = message.content as ContentBlock[] | undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        const ev = eventFromContentBlock(block);
        if (ev) events.push(ev);
      }
    }

    // 2. Usage roll-up (co-emitted on the same line). Per-turn delta; consumers
    //    must merge these so the trailing `result` event supplies authoritative totals.
    if (message.usage) {
      const usage = extractAssistantUsage(message);
      if (usage) {
        events.push({
          type: 'usage',
          tokensUsed: usage.total,
          usage,
          rawMethod: 'assistant.usage',
        });
      }
    }

    return events;
  }

  // ── user (tool_result) ─────────────────────────────────────
  if (type === 'user') {
    const message = r.message as Record<string, unknown> | undefined;
    if (!message) return [];
    const content = message.content as ContentBlock[] | undefined;
    if (!Array.isArray(content) || content.length === 0) return [];
    const block = content[0];
    if (block.type !== 'tool_result') return [];
    return [
      {
        type: 'tool_result',
        title: 'tool_result',
        status: block.is_error ? 'failed' : 'completed',
        content: extractToolResultText(block.content),
        callId: block.tool_use_id,
        rawMethod: 'user.tool_result',
      },
    ];
  }

  // ── result (final usage + cost) ────────────────────────────
  if (type === 'result') {
    const usage = extractResultUsage(r);
    if (!usage) return [];
    return [
      {
        type: 'usage',
        tokensUsed: usage.total,
        usage,
        cost: usage.costUsd,
        rawMethod: 'result.usage',
      },
    ];
  }

  return [];
}

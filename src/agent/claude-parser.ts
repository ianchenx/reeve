// agent/claude-parser.ts — Pure translator from Claude stream-json lines to ACPEvents.
//
// Claude CLI emits NDJSON with a handful of top-level types:
//   { type: "system", subtype: "init", session_id, tools }
//   { type: "assistant", message: { content: [{type:"text"|"thinking"|"tool_use"}], usage } }
//   { type: "user", message: { content: [{type:"tool_result", content, is_error}] } }
//   { type: "result", ... }  ← not surfaced (cost/final usage captured elsewhere)
//
// A single assistant line often carries BOTH content blocks and a usage
// roll-up, so the parser returns an ACPEvent array rather than a single event.
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

function extractUsage(message: Record<string, unknown>): TokenUsageSnapshot | null {
  const usage = message.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const input = Number(usage.input_tokens ?? 0) || 0;
  const output = Number(usage.output_tokens ?? 0) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0) || 0;
  const cacheCreate = Number(usage.cache_creation_input_tokens ?? 0) || 0;
  const total = input + output;
  return {
    input,
    output,
    total,
    contextUsed: input + cacheRead + cacheCreate,
    contextSize: undefined,
  };
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

    // 2. Usage roll-up (co-emitted on the same line)
    if (message.usage) {
      const usage = extractUsage(message);
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

  // ── result / anything else ─────────────────────────────────
  return [];
}

// agent/claude-parser.test.ts
import { describe, expect, test } from 'bun:test';
import { parseClaudeLine } from './claude-parser';

describe('parseClaudeLine', () => {
  test('system.init → [session_ready] with session id', () => {
    const raw = {
      type: 'system',
      subtype: 'init',
      session_id: '645f6120-541e-4539-884d-ea4918d310f6',
      tools: ['Bash', 'Read'],
    };
    const events = parseClaudeLine(raw);
    expect(events).toEqual([
      {
        type: 'session_ready',
        content: '645f6120-541e-4539-884d-ea4918d310f6',
        rawMethod: 'system.init',
      },
    ]);
  });

  test('assistant text block → [thinking]', () => {
    const raw = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Looking at the file structure.' }],
      },
    };
    const events = parseClaudeLine(raw);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('thinking');
    expect(events[0]!.content).toBe('Looking at the file structure.');
  });

  test('assistant thinking block → [thinking] truncated to 300 chars', () => {
    const big = 'x'.repeat(400);
    const raw = {
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: big }] },
    };
    const events = parseClaudeLine(raw);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('thinking');
    expect(events[0]!.content?.length).toBe(300);
  });

  test('assistant tool_use block → [tool_call running] with callId + toolInput', () => {
    const raw = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    };
    const events = parseClaudeLine(raw);
    expect(events).toEqual([
      {
        type: 'tool_call',
        title: 'Bash',
        status: 'running',
        callId: 'toolu_1',
        toolInput: { command: 'ls' },
        rawMethod: 'assistant.tool_use',
      },
    ]);
  });

  test('assistant tool_use + usage on same line → [tool_call, usage]', () => {
    const raw = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 0,
        },
      },
    };
    const events = parseClaudeLine(raw);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('tool_call');
    expect(events[0]!.callId).toBe('toolu_1');
    expect(events[1]!.type).toBe('usage');
    expect(events[1]!.usage?.input).toBe(100);
  });

  test('user tool_result block → [tool_result completed] with callId', () => {
    const raw = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'hello123\n',
            is_error: false,
          },
        ],
      },
    };
    const events = parseClaudeLine(raw);
    expect(events).toEqual([
      {
        type: 'tool_result',
        title: 'tool_result',
        status: 'completed',
        content: 'hello123\n',
        callId: 'toolu_1',
        rawMethod: 'user.tool_result',
      },
    ]);
  });

  test('user tool_result with is_error=true → failed', () => {
    const raw = {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'boom', is_error: true },
        ],
      },
    };
    const events = parseClaudeLine(raw);
    expect(events[0]!.status).toBe('failed');
  });

  test('assistant with only usage (empty content) → [usage]', () => {
    const raw = {
      type: 'assistant',
      message: {
        content: [],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    };
    const events = parseClaudeLine(raw);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('usage');
    expect(events[0]!.usage?.total).toBe(120);
  });

  test('result message → [usage] with cumulative totals and costUsd', () => {
    const raw = {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 1.1647355,
      usage: {
        input_tokens: 47,
        output_tokens: 11236,
        cache_creation_input_tokens: 40664,
        cache_read_input_tokens: 1258901,
      },
    };
    const events = parseClaudeLine(raw);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('usage');
    expect(events[0]!.rawMethod).toBe('result.usage');
    expect(events[0]!.usage).toEqual({
      input: 47,
      output: 11236,
      total: 11283,
      cacheRead: 1258901,
      costUsd: 1.1647355,
    });
    // contextUsed must NOT be surfaced — cumulative cacheRead is not a
    // context-window measure.
    expect(events[0]!.usage?.contextUsed).toBeUndefined();
  });

  test('result with no usage → []', () => {
    expect(parseClaudeLine({ type: 'result', subtype: 'success' })).toEqual([]);
  });

  test('result with zero cost → no costUsd field', () => {
    const raw = {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const events = parseClaudeLine(raw);
    expect(events[0]!.usage?.costUsd).toBeUndefined();
  });

  test('non-object input → []', () => {
    expect(parseClaudeLine(null)).toEqual([]);
    expect(parseClaudeLine('string')).toEqual([]);
  });

  // Regression: assistant per-turn deltas + trailing result totals must merge
  // into a snapshot with cumulative input/output/cacheRead/costUsd AND the last
  // observed contextUsed. Previously the per-turn assistant usage overwrote
  // itself to ~3 output tokens on completion.
  test('assistant delta + result final → merged snapshot preserves contextUsed', () => {
    const assistantLine = {
      type: 'assistant',
      message: {
        content: [],
        usage: {
          input_tokens: 1,
          output_tokens: 3,
          cache_read_input_tokens: 44759,
          cache_creation_input_tokens: 408,
        },
      },
    };
    const resultLine = {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 1.1647355,
      usage: {
        input_tokens: 47,
        output_tokens: 11236,
        cache_creation_input_tokens: 40664,
        cache_read_input_tokens: 1258901,
      },
    };

    const assistantEvents = parseClaudeLine(assistantLine);
    const resultEvents = parseClaudeLine(resultLine);
    const merged = {
      ...assistantEvents[0]!.usage,
      ...resultEvents[0]!.usage,
    };

    expect(merged.input).toBe(47);
    expect(merged.output).toBe(11236);
    expect(merged.total).toBe(11283);
    expect(merged.cacheRead).toBe(1258901);
    expect(merged.costUsd).toBe(1.1647355);
    // contextUsed from the assistant delta survives the merge.
    expect(merged.contextUsed).toBe(1 + 44759 + 408);
  });
});

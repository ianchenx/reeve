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

  test('result message → [] (not surfaced)', () => {
    const raw = {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0.002,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    expect(parseClaudeLine(raw)).toEqual([]);
  });

  test('non-object input → []', () => {
    expect(parseClaudeLine(null)).toEqual([]);
    expect(parseClaudeLine('string')).toEqual([]);
  });
});

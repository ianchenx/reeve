// agent/codex-mapper.test.ts
import { describe, expect, test } from 'bun:test';
import { mapCodexNotification, type CodexMapResult } from './codex-mapper';

describe('mapCodexNotification', () => {
  test('thread/started → session_ready with thread id', () => {
    const result = mapCodexNotification('thread/started', {
      thread: { id: 'th_abc123', cwd: '/tmp' },
    });
    expect(result?.event?.type).toBe('session_ready');
    expect(result?.event?.content).toBe('th_abc123');
    expect(result?.threadId).toBe('th_abc123');
  });

  test('item/started with command_execution → tool_call bash + callId + toolInput', () => {
    const result = mapCodexNotification('item/started', {
      item: {
        id: 'item_42',
        type: 'command_execution',
        command: 'ls -la',
      },
    });
    expect(result?.event).toEqual({
      type: 'tool_call',
      title: 'bash',
      status: 'running',
      content: 'ls -la',
      callId: 'item_42',
      toolInput: { command: 'ls -la' },
      rawMethod: 'item/started:commandExecution',
    });
  });

  test('item/completed with command_execution + exit_code 0 → tool_result completed + callId', () => {
    const result = mapCodexNotification('item/completed', {
      item: { id: 'item_42', type: 'command_execution', command: 'ls', exit_code: 0 },
    });
    expect(result?.event?.type).toBe('tool_result');
    expect(result?.event?.status).toBe('completed');
    expect(result?.event?.callId).toBe('item_42');
  });

  test('item/completed with command_execution + exit_code 1 → tool_result failed', () => {
    const result = mapCodexNotification('item/completed', {
      item: { id: 'item_43', type: 'command_execution', command: 'false', exit_code: 1 },
    });
    expect(result?.event?.status).toBe('failed');
    expect(result?.event?.callId).toBe('item_43');
  });

  test('item/started with file_change → tool_call edit + callId + toolInput', () => {
    const result = mapCodexNotification('item/started', {
      item: { id: 'item_51', type: 'file_change', path: 'src/foo.ts' },
    });
    expect(result?.event?.type).toBe('tool_call');
    expect(result?.event?.title).toBe('edit');
    expect(result?.event?.content).toBe('src/foo.ts');
    expect(result?.event?.callId).toBe('item_51');
    expect(result?.event?.toolInput).toEqual({ path: 'src/foo.ts' });
  });

  test('item/started with fileChange changes array → tool_call edit with first path', () => {
    const result = mapCodexNotification('item/started', {
      item: {
        id: 'item_52',
        type: 'fileChange',
        changes: [{ path: 'src/bar.ts' }],
      },
    });
    expect(result?.event?.type).toBe('tool_call');
    expect(result?.event?.content).toBe('src/bar.ts');
    expect(result?.event?.toolInput).toEqual({ path: 'src/bar.ts' });
  });

  test('item/completed with agent_message → thinking', () => {
    const result = mapCodexNotification('item/completed', {
      item: { type: 'agent_message', text: 'I examined the file structure.' },
    });
    expect(result?.event?.type).toBe('thinking');
    expect(result?.event?.content).toBe('I examined the file structure.');
  });

  test('item/completed with agentMessage → thinking', () => {
    const result = mapCodexNotification('item/completed', {
      item: { type: 'agentMessage', text: 'I examined the file structure.' },
    });
    expect(result?.event?.type).toBe('thinking');
    expect(result?.event?.content).toBe('I examined the file structure.');
  });

  test('item/agentMessage/delta → thinking (short)', () => {
    const result = mapCodexNotification('item/agentMessage/delta', { delta: 'Hello ' });
    expect(result?.event?.type).toBe('thinking');
    expect(result?.event?.content).toBe('Hello ');
  });

  test('thread/tokenUsage/updated → usage event', () => {
    const result = mapCodexNotification('thread/tokenUsage/updated', {
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cached_input_tokens: 50,
        total_tokens: 1200,
      },
    });
    expect(result?.event?.type).toBe('usage');
    expect(result?.event?.usage?.input).toBe(1000);
    expect(result?.event?.usage?.output).toBe(200);
    expect(result?.event?.usage?.total).toBe(1200);
  });

  test('turn/completed → turnCompleted flag set, no event', () => {
    const result = mapCodexNotification('turn/completed', {
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    expect(result?.turnCompleted).toBe(true);
    // turn/completed rolls up usage; the event may still be a usage event
    expect(result?.event?.type).toBe('usage');
  });

  test('turn/started → null (internal)', () => {
    const result = mapCodexNotification('turn/started', {});
    expect(result?.event).toBeUndefined();
    expect(result?.turnCompleted).toBeUndefined();
  });

  test('unknown method → null', () => {
    const result = mapCodexNotification('random/method', {});
    expect(result).toBeNull();
  });
});

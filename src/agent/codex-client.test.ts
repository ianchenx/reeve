// agent/codex-client.test.ts
import { describe, expect, test } from 'bun:test';
import { CodexClient, type JsonRpcMessage, type JsonRpcNotification } from './codex-client';

/** In-memory pipe pair that mimics a subprocess's stdin + stdout. */
function createPipe() {
  const received: string[] = [];
  const writable = {
    write(chunk: string) {
      received.push(chunk);
    },
    end() {},
  };
  let onLine: ((line: string) => void) | null = null;
  const readable = {
    onLine(handler: (line: string) => void) {
      onLine = handler;
    },
    push(msg: JsonRpcMessage) {
      onLine?.(JSON.stringify(msg));
    },
  };
  return { writable, readable, received };
}

describe('CodexClient', () => {
  test('request → response correlates by id', async () => {
    const { writable, readable, received } = createPipe();
    const client = new CodexClient(writable, () => {}, () => ({}));
    readable.onLine((line) => client.handleLine(line));

    const responsePromise = client.request('initialize', { clientInfo: { name: 'reeve', version: '0' } });

    // Verify outgoing
    expect(received.length).toBe(1);
    const sent = JSON.parse(received[0]!);
    expect(sent.method).toBe('initialize');
    expect(sent.id).toBe(1);

    // Server responds
    readable.push({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'codex' } } });
    await expect(responsePromise).resolves.toEqual({ serverInfo: { name: 'codex' } });
  });

  test('notification invokes handler and does not return a response', () => {
    const notifications: JsonRpcNotification[] = [];
    const { writable, readable, received } = createPipe();
    const client = new CodexClient(
      writable,
      (msg) => notifications.push(msg),
      () => ({}),
    );
    readable.onLine((line) => client.handleLine(line));

    readable.push({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: 'th_1' } } });

    expect(notifications.length).toBe(1);
    expect(notifications[0]!.method).toBe('thread/started');
    expect(received.length).toBe(0); // no outgoing response
  });

  test('server request triggers onServerRequest and writes back a response', () => {
    const { writable, readable, received } = createPipe();
    const client = new CodexClient(
      writable,
      () => {},
      (method) => (method.includes('Approval') || method.endsWith('/requestApproval')
        ? { decision: 'accept' }
        : {}),
    );
    readable.onLine((line) => client.handleLine(line));

    readable.push({
      jsonrpc: '2.0',
      id: 42,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'ls' },
    });

    expect(received.length).toBe(1);
    const reply = JSON.parse(received[0]!);
    expect(reply.id).toBe(42);
    expect(reply.result).toEqual({ decision: 'accept' });
  });

  test('error response rejects the pending promise', async () => {
    const { writable, readable } = createPipe();
    const client = new CodexClient(writable, () => {}, () => ({}));
    readable.onLine((line) => client.handleLine(line));

    const p = client.request('thread/start', { cwd: '/tmp' });
    readable.push({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'boom' } });

    await expect(p).rejects.toThrow(/boom/);
  });
});

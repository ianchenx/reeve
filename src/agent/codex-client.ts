// agent/codex-client.ts — Minimal JSON-RPC 2.0 client for codex app-server.
//
// The client only does framing, id correlation, and message routing. It is
// agnostic to message content — the codex-backend owns the protocol flow and
// decides how to interpret notifications and server→client requests.
//
// Three kinds of incoming messages:
//   1. Response to our request:      { id, result } or { id, error }
//   2. Server-initiated request:     { id, method, params }  (we must respond)
//   3. Notification:                 { method, params }       (no response)

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface WritableStream {
  write(chunk: string): void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class CodexClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private readonly stdin: WritableStream,
    private readonly onNotification: (msg: JsonRpcNotification) => void,
    /**
     * Handle a server-initiated request. Return the result object to send
     * back to the server. For approvals, return e.g. { decision: 'accept' }.
     */
    private readonly onServerRequest: (method: string, params: unknown) => unknown,
  ) {}

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    this.stdin.write(JSON.stringify(msg) + '\n');
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
    });
  }

  respond(id: number | string, result: unknown): void {
    const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result };
    this.stdin.write(JSON.stringify(msg) + '\n');
  }

  /** Feed one stdout line. Caller is responsible for line framing. */
  handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return; // ignore non-JSON (should not happen with app-server)
    }

    if ('id' in msg && msg.id !== undefined && !('method' in msg)) {
      // Response to our request
      const pending = this.pending.get(msg.id as number);
      if (!pending) return;
      this.pending.delete(msg.id as number);
      if ('error' in msg && msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve((msg as JsonRpcResponse).result);
      }
      return;
    }

    if ('id' in msg && msg.id !== undefined && 'method' in msg) {
      // Server-initiated request — we must respond
      const req = msg as JsonRpcRequest;
      const result = this.onServerRequest(req.method, req.params);
      this.respond(req.id, result);
      return;
    }

    if ('method' in msg) {
      // Notification
      this.onNotification(msg as JsonRpcNotification);
    }
  }

  /** Reject any still-pending requests on shutdown. */
  shutdown(reason = 'client shutdown'): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

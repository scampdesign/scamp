/**
 * JSON-RPC 2.0 envelope handling for the MCP server.
 *
 * Split from `protocol.ts` so the wire format and the MCP semantics are
 * testable apart: this file knows nothing about tools or handshakes, only
 * about ids, methods, and error codes.
 * see docs/plans/mcp-server-plan.md, docs/notes/mcp-protocol.md
 */

/** JSON-RPC permits a string or number id. MCP only ever sends these two. */
export type JsonRpcId = string | number;

export type JsonRpcMessage = {
  jsonrpc: string;
  /** Absent on notifications — that is the ONLY thing distinguishing them. */
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcFailure = {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/** The subset of the standard codes this server can actually emit. */
export const RPC = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export const success = (id: JsonRpcId, result: unknown): JsonRpcSuccess => ({
  jsonrpc: '2.0',
  id,
  result,
});

export const failure = (
  id: JsonRpcId | null,
  code: number,
  message: string
): JsonRpcFailure => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A message is a notification when it carries no `id` at all.
 *
 * Checked with `in` rather than truthiness on purpose: `id: 0` and `id: ''`
 * are legal request ids, and treating either as a notification would drop a
 * real response on the floor.
 */
export const isNotification = (msg: JsonRpcMessage): boolean =>
  msg.id === undefined;

export type ParsedPayload =
  | { kind: 'single'; message: JsonRpcMessage }
  | { kind: 'batch'; messages: JsonRpcMessage[] }
  | { kind: 'error'; response: JsonRpcFailure };

const validateMessage = (value: unknown): JsonRpcMessage | null => {
  if (!isRecord(value)) return null;
  if (typeof value['method'] !== 'string') return null;
  const rawId = value['id'];
  if (rawId !== undefined && typeof rawId !== 'string' && typeof rawId !== 'number') {
    return null;
  }
  const msg: JsonRpcMessage = {
    jsonrpc: typeof value['jsonrpc'] === 'string' ? value['jsonrpc'] : '2.0',
    method: value['method'],
    params: value['params'],
  };
  // Only attach `id` when present — `isNotification` reads its absence, so a
  // spurious `id: undefined` key would still be a notification but muddies
  // equality checks in tests and logs.
  if (rawId !== undefined) msg.id = rawId;
  return msg;
};

/**
 * Parse a request body into something dispatchable.
 *
 * Batches are accepted even though MCP's current revision dropped them: a
 * one-line `.map` is cheaper than a client hitting an unexplained failure,
 * and Phase 0 showed clients can be newer than the spec we coded against.
 */
export const MAX_BATCH = 50;

export const parsePayload = (raw: string): ParsedPayload => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: 'error', response: failure(null, RPC.ParseError, 'Parse error') };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        kind: 'error',
        response: failure(null, RPC.InvalidRequest, 'Invalid Request: empty batch'),
      };
    }
    // Calls run one at a time and each can wait seconds on the canvas, so
    // an unbounded batch could tie up the main process for hours.
    if (value.length > MAX_BATCH) {
      return {
        kind: 'error',
        response: failure(null, RPC.InvalidRequest, `Invalid Request: a batch holds at most ${MAX_BATCH} messages`),
      };
    }
    const messages: JsonRpcMessage[] = [];
    for (const entry of value) {
      const msg = validateMessage(entry);
      if (msg === null) {
        return {
          kind: 'error',
          response: failure(null, RPC.InvalidRequest, 'Invalid Request'),
        };
      }
      messages.push(msg);
    }
    return { kind: 'batch', messages };
  }

  const msg = validateMessage(value);
  if (msg === null) {
    return {
      kind: 'error',
      response: failure(null, RPC.InvalidRequest, 'Invalid Request'),
    };
  }
  return { kind: 'single', message: msg };
};

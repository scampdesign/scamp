/**
 * JSON-RPC 2.0 envelope handling for the MCP server.
 *
 * Split from `protocol.ts` so the wire format and the MCP semantics are
 * testable apart: this file knows nothing about tools or handshakes, only
 * about ids, methods, and error codes.
 * see docs/archive/2026-08-06-mcp-server-plan.md, docs/notes/mcp-protocol.md
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
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
};
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;
/** The subset of the standard codes this server can actually emit. */
export declare const RPC: {
    readonly ParseError: -32700;
    readonly InvalidRequest: -32600;
    readonly MethodNotFound: -32601;
    readonly InvalidParams: -32602;
    readonly InternalError: -32603;
};
export declare const success: (id: JsonRpcId, result: unknown) => JsonRpcSuccess;
export declare const failure: (id: JsonRpcId | null, code: number, message: string) => JsonRpcFailure;
/**
 * A message is a notification when it carries no `id` at all.
 *
 * Checked with `in` rather than truthiness on purpose: `id: 0` and `id: ''`
 * are legal request ids, and treating either as a notification would drop a
 * real response on the floor.
 */
export declare const isNotification: (msg: JsonRpcMessage) => boolean;
export type ParsedPayload = {
    kind: 'single';
    message: JsonRpcMessage;
} | {
    kind: 'batch';
    messages: JsonRpcMessage[];
} | {
    kind: 'error';
    response: JsonRpcFailure;
};
/**
 * Parse a request body into something dispatchable.
 *
 * Batches are accepted even though MCP's current revision dropped them: a
 * one-line `.map` is cheaper than a client hitting an unexplained failure,
 * and Phase 0 showed clients can be newer than the spec we coded against.
 */
export declare const MAX_BATCH = 50;
export declare const parsePayload: (raw: string) => ParsedPayload;

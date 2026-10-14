import { type JsonRpcMessage, type JsonRpcResponse } from './jsonRpc';
/**
 * MCP semantics over the JSON-RPC envelope: the handshake, tool discovery,
 * and tool invocation.
 *
 * Transport-free on purpose — it takes a parsed message and returns a
 * response, so the whole protocol is testable without binding a port. The
 * HTTP layer (Phase 4) only decides status codes.
 * see docs/archive/2026-08-06-mcp-server-plan.md, docs/notes/mcp-protocol.md
 */
/**
 * Revisions we've actually read and implemented, newest first.
 *
 * Phase 0 found real Claude Code (2.1.222) asking for `2025-11-25` — newer
 * than anything here — accepting our `2025-06-18` answer and connecting
 * normally. So this list going stale degrades to "we answer with ours and
 * the client decides", not to a broken server. Do NOT add a version here
 * without implementing whatever it changed; the point of the list is that
 * every entry is one we can honour.
 */
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly ["2025-06-18", "2025-03-26", "2024-11-05"];
export declare const LATEST_PROTOCOL_VERSION: "2025-06-18";
export declare const SERVER_INFO: {
    readonly name: "scamp";
    readonly version: "1.0.0";
};
/**
 * Sent back on `initialize`. Clients surface this to the model, so it
 * reaches an agent that never read `agent.md`. It carries the one fact
 * that gets missed most — reusable UI belongs in `components/`, not on
 * a page — and points at where the full rules live.
 */
export declare const SERVER_INSTRUCTIONS: string;
export type ToolDescriptor = {
    name: string;
    description: string;
    /** JSON Schema. Typed loosely because it is data, not a contract we call. */
    inputSchema: Record<string, unknown>;
};
/** MCP's tool-result shape. `isError` reports a TOOL failure, never a
 *  protocol one — see `callTool` below. */
export type ToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
};
export type ToolInvoker = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
export type ProtocolDeps = {
    tools: ReadonlyArray<ToolDescriptor>;
    invoke: ToolInvoker;
};
export declare const textResult: (text: string) => ToolResult;
export declare const errorResult: (text: string) => ToolResult;
/**
 * Answer the client's requested version if we implement it, else our latest.
 *
 * The spec allows the client to walk away when it doesn't like our answer,
 * and Phase 0 confirmed real clients instead accept an older version and
 * carry on. Either way the correct behaviour is to state what we support
 * rather than to fail the handshake.
 */
export declare const negotiateVersion: (asked: unknown) => string;
/**
 * Dispatch one message. Returns `null` for notifications — they get no
 * response at all, which the HTTP layer turns into a 202.
 */
export declare const dispatch: (msg: JsonRpcMessage, deps: ProtocolDeps) => Promise<JsonRpcResponse | null>;
export type HandledPayload = {
    /** Null when there is nothing to send — every message was a notification. */
    response: JsonRpcResponse | JsonRpcResponse[] | null;
};
/**
 * Parse and dispatch a raw request body.
 *
 * The single entry point the HTTP layer needs: it decides only the status
 * code (202 when `response` is null, else 200).
 */
export declare const handlePayload: (raw: string, deps: ProtocolDeps) => Promise<HandledPayload>;

/**
 * JSON-RPC 2.0 envelope handling for the MCP server.
 *
 * Split from `protocol.ts` so the wire format and the MCP semantics are
 * testable apart: this file knows nothing about tools or handshakes, only
 * about ids, methods, and error codes.
 * see docs/archive/2026-08-06-mcp-server-plan.md, docs/notes/mcp-protocol.md
 */
/** The subset of the standard codes this server can actually emit. */
export const RPC = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
};
export const success = (id, result) => ({
    jsonrpc: '2.0',
    id,
    result,
});
export const failure = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/**
 * A message is a notification when it carries no `id` at all.
 *
 * Checked with `in` rather than truthiness on purpose: `id: 0` and `id: ''`
 * are legal request ids, and treating either as a notification would drop a
 * real response on the floor.
 */
export const isNotification = (msg) => msg.id === undefined;
const validateMessage = (value) => {
    if (!isRecord(value))
        return null;
    if (typeof value['method'] !== 'string')
        return null;
    const rawId = value['id'];
    if (rawId !== undefined && typeof rawId !== 'string' && typeof rawId !== 'number') {
        return null;
    }
    const msg = {
        jsonrpc: typeof value['jsonrpc'] === 'string' ? value['jsonrpc'] : '2.0',
        method: value['method'],
        params: value['params'],
    };
    // Only attach `id` when present — `isNotification` reads its absence, so a
    // spurious `id: undefined` key would still be a notification but muddies
    // equality checks in tests and logs.
    if (rawId !== undefined)
        msg.id = rawId;
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
export const parsePayload = (raw) => {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
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
        const messages = [];
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

import type { McpQueryArgs, McpQueryResultArgs } from '@shared/types';
/**
 * The pull-through half of the MCP server: main asks the renderer for live
 * canvas state and waits for a correlated reply.
 *
 * A cached snapshot in main would be simpler, but it would answer an agent's
 * "what is selected" with whatever the last debounce captured — wrong right
 * after the user clicks, which is exactly when they ask. A visible timeout
 * beats a silently stale answer.
 *
 * Electron-free on purpose: `send` is injected, so the whole correlation and
 * timeout story is testable without a BrowserWindow.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */
/**
 * How long to wait for the renderer before giving up.
 *
 * Generous relative to the real cost (an IPC round trip is sub-millisecond);
 * sized for the renderer being mid-drag or blocked on a large re-render, not
 * for the happy path.
 */
export declare const QUERY_TIMEOUT_MS = 2000;
export type QueryRegistry = {
    /** Ask the renderer. Rejects on timeout or when the renderer reports failure. */
    query: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
    /** Feed a renderer reply back in. Unknown ids are ignored. */
    resolve: (result: McpQueryResultArgs) => void;
    /** Fail everything in flight — window closed, project closed, app quitting. */
    rejectAll: (reason: string) => void;
    /** In-flight count. Exposed for tests and teardown assertions. */
    pending: () => number;
};
export type QueryRegistryOptions = {
    send: (payload: McpQueryArgs) => void;
    timeoutMs?: number;
    /** Injected so tests get deterministic ids instead of real UUIDs. */
    makeRequestId?: () => string;
};
export declare const createQueryRegistry: (options: QueryRegistryOptions) => QueryRegistry;

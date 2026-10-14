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
export const QUERY_TIMEOUT_MS = 2000;
const defaultRequestId = () => `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export const createQueryRegistry = (options) => {
    const { send, timeoutMs = QUERY_TIMEOUT_MS, makeRequestId = defaultRequestId, } = options;
    const inFlight = new Map();
    const settle = (requestId) => {
        const entry = inFlight.get(requestId);
        if (entry === undefined)
            return undefined;
        clearTimeout(entry.timer);
        inFlight.delete(requestId);
        return entry;
    };
    return {
        query: (tool, args) => new Promise((resolve, reject) => {
            const requestId = makeRequestId();
            const timer = setTimeout(() => {
                inFlight.delete(requestId);
                reject(new Error('The Scamp canvas did not respond in time. It may be busy — try again.'));
            }, timeoutMs);
            // `unref` where available so a pending query can never hold the
            // process open during quit. Electron's main process runs Node, but
            // guard anyway — the browser timer type has no unref.
            timer.unref?.();
            inFlight.set(requestId, { resolve, reject, timer });
            try {
                send({ requestId, tool, args });
            }
            catch (err) {
                // The window can go away between our check and the send.
                settle(requestId);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        }),
        resolve: (result) => {
            // A late reply — one that arrives after its timeout — finds no entry
            // and is dropped. That is correct: its promise already rejected, and
            // resolving twice would be a silent contract break.
            const entry = settle(result.requestId);
            if (entry === undefined)
                return;
            if (result.ok)
                entry.resolve(result.data);
            else
                entry.reject(new Error(result.error));
        },
        rejectAll: (reason) => {
            for (const [requestId] of [...inFlight]) {
                settle(requestId)?.reject(new Error(reason));
            }
        },
        pending: () => inFlight.size,
    };
};

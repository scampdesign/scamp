import { type IncomingMessage, type ServerResponse } from 'http';
import { type ProtocolDeps } from './protocol';
/**
 * The MCP HTTP endpoint. Node's built-in `http`, no framework.
 *
 * Deliberately Electron-free so an integration test can start a real server
 * on a real port — the only level that catches a transport-shape mistake.
 * see docs/archive/2026-08-06-mcp-server-plan.md, docs/notes/mcp-protocol.md
 */
/**
 * The advertised default. Fixed rather than ephemeral because the URL ends
 * up in the agent's config FILE, which is not re-read at runtime — a moving
 * port would invalidate every registration on every restart.
 */
export declare const DEFAULT_MCP_PORT = 39841;
/** How many ports past the default to try before giving up. */
export declare const PORT_SCAN_RANGE = 10;
export type McpServerOptions = {
    deps: ProtocolDeps;
    token: string;
    /** Fires on every request that passed the token check — the signal
     *  that an agent is actually talking to us, not just that we're up. */
    onAuthenticatedRequest?: () => void;
    /** Defaults to `DEFAULT_MCP_PORT`; the scan starts here. */
    port?: number;
    host?: string;
};
export type RunningMcpServer = {
    port: number;
    url: string;
    close: () => Promise<void>;
};
export declare const createRequestHandler: (options: McpServerOptions) => (req: IncomingMessage, res: ServerResponse) => Promise<void>;
/**
 * Start on the default port, scanning forward if it's taken.
 *
 * Verifies it actually bound rather than assuming — with a fixed default,
 * "something else is on 39841" is a real scenario, and the failure mode is an
 * agent talking to the wrong process.
 */
export declare const startMcpServer: (options: McpServerOptions) => Promise<RunningMcpServer>;

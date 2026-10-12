import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';

import { handlePayload, type ProtocolDeps } from './protocol';

/**
 * The MCP HTTP endpoint. Node's built-in `http`, no framework.
 *
 * Deliberately Electron-free so an integration test can start a real server
 * on a real port — the only level that catches a transport-shape mistake.
 * see docs/plans/mcp-server-plan.md, docs/notes/mcp-protocol.md
 */

/**
 * The advertised default. Fixed rather than ephemeral because the URL ends
 * up in the agent's config FILE, which is not re-read at runtime — a moving
 * port would invalidate every registration on every restart.
 */
export const DEFAULT_MCP_PORT = 39841;

/** How many ports past the default to try before giving up. */
export const PORT_SCAN_RANGE = 10;

/** Bodies larger than this are refused outright — a tool call is ~200 bytes. */
const MAX_BODY_BYTES = 1_000_000;

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

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    // No agent should cache a live-state answer.
    'cache-control': 'no-store',
  });
  res.end(payload);
};

const sendEmpty = (res: ServerResponse, status: number): void => {
  res.writeHead(status, { 'content-length': '0' });
  res.end();
};

/**
 * Reject requests that carry a browser `Origin`.
 *
 * Any page the user has open can `fetch()` a localhost port, and DNS
 * rebinding defeats naive host checks — the MCP spec requires local servers
 * to validate this. Phase 0 confirmed real Claude Code sends no `Origin` at
 * all, so this costs legitimate clients nothing.
 */
const hasBrowserOrigin = (req: IncomingMessage): boolean => {
  const origin = req.headers.origin;
  return typeof origin === 'string' && origin.length > 0;
};

const tokenOf = (req: IncomingMessage): string | null => {
  const header = req.headers['x-scamp-token'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header)) return header[0] ?? null;
  return null;
};

const readBody = (req: IncomingMessage): Promise<string | null> =>
  new Promise((resolve) => {
    // Decoded once at the end: a chunk can end mid-character, and decoding
    // each on its own turned that character into U+FFFD.
    const chunks: Buffer[] = [];
    let bytes = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', () => {
      if (!aborted) {
        aborted = true;
        resolve(null);
      }
    });
  });

export const createRequestHandler =
  (options: McpServerOptions) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (hasBrowserOrigin(req)) {
      sendJson(res, 403, { error: 'origin not allowed' });
      return;
    }
    if (tokenOf(req) !== options.token) {
      sendJson(res, 401, { error: 'missing or invalid token' });
      return;
    }
    options.onAuthenticatedRequest?.();

    // We offer no server-initiated stream. Phase 0 watched real Claude Code
    // issue this GET, take the 405, and carry on — 404 would be wrong.
    if (req.method === 'GET' || req.method === 'DELETE') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }

    const raw = await readBody(req);
    if (raw === null) {
      sendJson(res, 413, { error: 'request body too large' });
      return;
    }

    const { response } = await handlePayload(raw, options.deps);
    // A notification gets no response body at all.
    if (response === null) {
      sendEmpty(res, 202);
      return;
    }
    sendJson(res, 200, response);
  };

/** Bind one port, resolving false when it's taken. */
const tryListen = (
  server: Server,
  port: number,
  host: string
): Promise<boolean> =>
  new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      // Anything other than "taken" is a real failure worth surfacing, but
      // callers only need to know whether to try the next port.
      resolve(err.code !== 'EADDRINUSE' ? false : false);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

/**
 * Start on the default port, scanning forward if it's taken.
 *
 * Verifies it actually bound rather than assuming — with a fixed default,
 * "something else is on 39841" is a real scenario, and the failure mode is an
 * agent talking to the wrong process.
 */
export const startMcpServer = async (
  options: McpServerOptions
): Promise<RunningMcpServer> => {
  const host = options.host ?? '127.0.0.1';
  const first = options.port ?? DEFAULT_MCP_PORT;
  const handler = createRequestHandler(options);

  for (let offset = 0; offset <= PORT_SCAN_RANGE; offset += 1) {
    const port = first + offset;
    const server = createServer((req, res) => {
      void handler(req, res).catch(() => {
        // A handler that throws must still answer — an agent waiting on a
        // dead socket has no way to recover.
        if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
        else res.end();
      });
    });
    if (await tryListen(server, port, host)) {
      return {
        port,
        url: `http://${host}:${port}/mcp`,
        close: () =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            // Sockets an agent is holding open would otherwise delay quit.
            server.closeAllConnections?.();
          }),
      };
    }
    server.close();
  }

  throw new Error(
    `No free port for the Scamp MCP server between ${first} and ${first + PORT_SCAN_RANGE}.`
  );
};

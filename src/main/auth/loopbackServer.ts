import { createServer, type Server } from 'http';

import { LOOPBACK_PORT } from './desktopAuthFlow';

/**
 * The loopback listener the browser redirects back to.
 *
 * Chosen over the `scamp://` scheme as the primary mechanism: no OS
 * protocol registration, one entry point instead of three, and no other
 * application can claim it — we hold the socket. See decision 5 in
 * docs/archive/2026-08-28-electron-sign-in-plan.md.
 *
 * The port is fixed because the backend's redirect allowlist is exact
 * match with no wildcard, so a random port would be refused. That makes
 * "port already in use" a real outcome the caller has to handle rather
 * than an edge case, and it is why `start` reports it distinctly: it is
 * the signal to fall back to the custom scheme.
 */

export type LoopbackResult =
  /** A request arrived at /callback. The raw URL, for `readCallback`. */
  | { status: 'callback'; url: string }
  /** Nothing arrived before the deadline. */
  | { status: 'timeout' }
  /** The caller gave up — a cancelled sign-in. */
  | { status: 'cancelled' };

export type StartResult =
  | { status: 'listening'; waitForCallback: () => Promise<LoopbackResult>; close: () => Promise<void> }
  /** Something else holds the port; fall back to the custom scheme. */
  | { status: 'port-unavailable' }
  | { status: 'failed'; message: string };

/** What the browser tab shows once the code has been handed over. */
const DONE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signed in</title>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center;
         min-height: 100vh; margin: 0; background: #101014; color: #e8e8ea; }
  p { font-size: 15px; }
</style></head>
<body><p>Signed in. You can close this tab and return to Scamp.</p></body></html>
`;

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Not found</title></head>
<body></body></html>
`;

// `connection: close` is load-bearing — this listener serves one request
// and shuts down. see docs/notes/loopback-close-hang.md
const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  connection: 'close',
} as const;

export type StartOptions = {
  port?: number;
  /** How long to wait for the browser before giving up. */
  timeoutMs?: number;
};

/** Fifteen minutes: long enough to sign up, create a password, get a 2FA code. */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Bind the loopback listener.
 *
 * Started BEFORE the browser is opened, so a fast redirect cannot arrive
 * at a socket that isn't listening yet.
 */
export const startLoopbackServer = async ({
  port = LOOPBACK_PORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: StartOptions = {}): Promise<StartResult> => {
  // The outcome is recorded whether or not anyone is waiting yet. A fast
  // redirect can land before `waitForCallback` has been called — the test
  // browser does it every time, and a real one on localhost easily could —
  // and dropping the result there would hang the sign-in forever.
  let resolveResult: ((r: LoopbackResult) => void) | null = null;
  let settledResult: LoopbackResult | null = null;
  const settle = (result: LoopbackResult): void => {
    if (settledResult !== null) return;
    settledResult = result;
    resolveResult?.(result);
  };

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/callback') {
      res.writeHead(404, HTML_HEADERS);
      res.end(NOT_FOUND_PAGE);
      return;
    }
    // Answer the browser first so the tab settles, then hand the URL on —
    // but only once the response has flushed, because the sign-in that
    // follows ends by destroying this very connection.
    // see docs/notes/loopback-close-hang.md
    res.writeHead(200, HTML_HEADERS);
    res.end(DONE_PAGE, () => {
      // Absolute URL so `readCallback` can parse it with `new URL`.
      settle({ status: 'callback', url: `http://localhost:${port}${req.url ?? ''}` });
    });
  });

  const listening = await new Promise<StartResult | null>((resolve) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      resolve(
        err.code === 'EADDRINUSE'
          ? { status: 'port-unavailable' }
          : { status: 'failed', message: err.message }
      );
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve(null);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    // Loopback only — never expose this to the network.
    server.listen(port, '127.0.0.1');
  });
  if (listening !== null) return listening;

  // closeAllConnections first, or this never returns: a browser leaves a
  // preconnected socket that `server.close` waits on forever.
  // see docs/notes/loopback-close-hang.md
  const close = async (): Promise<void> => {
    settle({ status: 'cancelled' });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  const waitForCallback = (): Promise<LoopbackResult> =>
    new Promise<LoopbackResult>((resolve) => {
      if (settledResult !== null) {
        resolve(settledResult);
        return;
      }
      resolveResult = resolve;
      const timer = setTimeout(() => settle({ status: 'timeout' }), timeoutMs);
      // Don't hold the process open on this timer.
      timer.unref?.();
    });

  return { status: 'listening', waitForCallback, close };
};

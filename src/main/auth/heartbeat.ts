import type { FetchLike } from './tokenExchange';

/**
 * Telling the backend the app is open.
 *
 * `POST /api/desktop/heartbeat` with the bearer token, no body, 204 back.
 *
 * It exists because until cloud sync ships the app talks to the API at
 * sign-in and then essentially never again — so someone using Scamp every
 * day for a month registered as a single active day. Authenticated calls
 * are recorded as activity now, but the app barely makes any; the
 * heartbeat measures the thing that is actually meant, which is that the
 * app was open.
 *
 * Two rules shape everything here:
 *
 * A signed-out app must cost nothing. No token, no request — the same
 * rule that keeps `getStatus` off the network on launch.
 *
 * And activity reporting must never be the reason something breaks. Every
 * failure is swallowed; the one thing a response can do is a 401, which
 * means the session is genuinely gone and the UI would otherwise keep
 * claiming the user is signed in.
 *
 * see docs/notes/desktop-heartbeat.md
 */

/** Once on launch, then every four hours. The server throttles writes to
 *  five minutes, so anything more frequent buys nothing. */
export const HEARTBEAT_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Floor between two sends from this process. Launch and an immediate
 * sign-in would otherwise fire twice within seconds — harmless, since the
 * server throttles, but there is no reason to make the request at all.
 */
export const MIN_SEND_GAP_MS = 60 * 1000;

export type HeartbeatResult =
  /** Sent and accepted. */
  | 'sent'
  /** Nothing to send — signed out, or too soon after the last one. */
  | 'skipped'
  /** The session is gone. The caller signs the user out locally. */
  | 'unauthorized'
  /** Anything else: offline, server down, unexpected status. Ignored. */
  | 'failed';

export type HeartbeatDeps = {
  baseUrl: string;
  fetchImpl: FetchLike;
  /** The current bearer token, or null when signed out. */
  token: () => string | null;
  /** Called on a 401 so the app stops claiming to be signed in. */
  onUnauthorized: () => void | Promise<void>;
  /** Called after an accepted beat, for anything that refreshes on the same cadence. */
  afterBeat?: () => void;
  now?: () => number;
};

let lastSentAt: number | null = null;

/** Test seam: forget the send-gap floor between cases. */
export const __resetHeartbeatState = (): void => {
  lastSentAt = null;
};

export const sendHeartbeat = async (
  deps: HeartbeatDeps
): Promise<HeartbeatResult> => {
  const token = deps.token();
  if (token === null || token.length === 0) return 'skipped';

  const now = (deps.now ?? Date.now)();
  if (lastSentAt !== null && now - lastSentAt < MIN_SEND_GAP_MS) {
    return 'skipped';
  }

  let response;
  try {
    response = await deps.fetchImpl(
      new URL('/api/desktop/heartbeat', deps.baseUrl).toString(),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          // Same reason as the token exchange: a main-process fetch sends
          // no Origin, and the backend checks it.
          origin: new URL(deps.baseUrl).origin,
        },
      }
    );
  } catch {
    // Offline, DNS, server down. Not worth a log line every four hours.
    return 'failed';
  }

  if (response.status === 401) {
    // The session expired or was revoked. This is the first real API call
    // the app makes, so it is where that surfaces — exactly as the sign-in
    // plan anticipated, just sooner than expected.
    await deps.onUnauthorized();
    return 'unauthorized';
  }
  if (!response.ok) return 'failed';

  lastSentAt = now;
  deps.afterBeat?.();
  return 'sent';
};

/**
 * Start the launch beat and the four-hourly repeat.
 *
 * Returns a stop function. The interval is `unref`ed so it never holds the
 * process open at quit.
 *
 * Note the timer counts elapsed time while the process runs, so a laptop
 * that sleeps for six hours sends its next beat on wake rather than on a
 * wall-clock schedule. That is the right shape for "the app was open".
 */
export const startHeartbeat = (
  deps: HeartbeatDeps,
  intervalMs: number = HEARTBEAT_INTERVAL_MS
): (() => void) => {
  void sendHeartbeat(deps);
  const timer = setInterval(() => {
    void sendHeartbeat(deps);
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
};

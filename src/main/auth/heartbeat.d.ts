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
export declare const HEARTBEAT_INTERVAL_MS: number;
/**
 * Floor between two sends from this process. Launch and an immediate
 * sign-in would otherwise fire twice within seconds — harmless, since the
 * server throttles, but there is no reason to make the request at all.
 */
export declare const MIN_SEND_GAP_MS: number;
export type HeartbeatResult = 
/** Sent and accepted. */
'sent'
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
/** Test seam: forget the send-gap floor between cases. */
export declare const __resetHeartbeatState: () => void;
export declare const sendHeartbeat: (deps: HeartbeatDeps) => Promise<HeartbeatResult>;
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
export declare const startHeartbeat: (deps: HeartbeatDeps, intervalMs?: number) => (() => void);

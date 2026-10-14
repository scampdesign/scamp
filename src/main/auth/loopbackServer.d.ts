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
{
    status: 'callback';
    url: string;
}
/** Nothing arrived before the deadline. */
 | {
    status: 'timeout';
}
/** The caller gave up — a cancelled sign-in. */
 | {
    status: 'cancelled';
};
export type StartResult = {
    status: 'listening';
    waitForCallback: () => Promise<LoopbackResult>;
    close: () => Promise<void>;
}
/** Something else holds the port; fall back to the custom scheme. */
 | {
    status: 'port-unavailable';
} | {
    status: 'failed';
    message: string;
};
export type StartOptions = {
    port?: number;
    /** How long to wait for the browser before giving up. */
    timeoutMs?: number;
};
/**
 * Bind the loopback listener.
 *
 * Started BEFORE the browser is opened, so a fast redirect cannot arrive
 * at a socket that isn't listening yet.
 */
export declare const startLoopbackServer: ({ port, timeoutMs, }?: StartOptions) => Promise<StartResult>;

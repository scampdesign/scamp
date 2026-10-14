/**
 * Redeeming the callback code for a session token.
 *
 * `POST /api/desktop/token { code, codeVerifier }` → `{ token, user }`.
 * This is the only place the verifier is used, and the only place it
 * leaves memory — over TLS to the backend, never to the browser.
 *
 * The token that comes back is an opaque Better Auth session token, not a
 * JWT: 30 days, refreshed on use, no refresh token. So there is no
 * lifecycle to manage here — a later `401` means sign in again, not
 * refresh. see docs/archive/2026-08-28-electron-sign-in-plan.md
 *
 * `fetch` is injected so the failure paths can be tested without a
 * network or a running backend.
 */
export type DesktopUser = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
};
export type ExchangeResult = {
    status: 'ok';
    token: string;
    user: DesktopUser;
}
/** The code was rejected — expired, already used, or a wrong verifier. */
 | {
    status: 'rejected';
    message: string;
}
/** Reached the server, but the answer was not the shape we expect. */
 | {
    status: 'malformed';
}
/** Never reached the server. */
 | {
    status: 'unreachable';
    message: string;
};
export type FetchLike = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    /** Absent for requests that carry none — the heartbeat, notably. */
    body?: string;
}) => Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
}>;
export type ExchangeArgs = {
    baseUrl: string;
    code: string;
    codeVerifier: string;
    fetchImpl: FetchLike;
};
export declare const exchangeCodeForToken: ({ baseUrl, code, codeVerifier, fetchImpl, }: ExchangeArgs) => Promise<ExchangeResult>;

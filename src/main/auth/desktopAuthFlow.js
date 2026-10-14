import { createHash, randomBytes } from 'crypto';
/**
 * The pure half of desktop sign-in: PKCE, the sign-in URL, and reading the
 * callback. No network, no Electron, no disk — so the security properties
 * can be tested directly.
 *
 * The shape is PKCE (RFC 7636). The callback carries a short-lived CODE,
 * never a token, and the code is only redeemable with a verifier that
 * never leaves this process. That matters because a custom scheme is
 * claimable by any application on the machine — an interceptor that reads
 * the callback URL gets something it cannot spend.
 *
 * `state` is generated and checked too, but it is not the defence. It
 * proves a callback belongs to a request we made; it does not prove only
 * we can use it.
 *
 * see docs/archive/2026-08-28-electron-sign-in-plan.md
 */
/** Default sign-in host. Overridden by SCAMP_AUTH_BASE_URL for local dev. */
export const DEFAULT_AUTH_BASE_URL = 'https://www.scamp.club';
/**
 * Loopback port the browser redirects back to. Fixed, not chosen at
 * runtime: the backend's redirect allowlist is exact-match with no
 * wildcard, so a random port would simply be refused.
 */
export const LOOPBACK_PORT = 8976;
/** Redirect URIs the backend accepts, verbatim. */
export const LOOPBACK_REDIRECT_URI = `http://localhost:${LOOPBACK_PORT}/callback`;
export const SCHEME_REDIRECT_URI = 'scamp://auth/callback';
/** Backend requires 8–256 characters; 32 bytes of base64url is 43. */
const STATE_BYTES = 32;
/** RFC 7636 allows 43–128 characters; 64 bytes of base64url is 86. */
const VERIFIER_BYTES = 64;
const base64Url = (buf) => buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
/** A fresh PKCE code verifier. Never leaves the process, never stored. */
export const generateVerifier = () => base64Url(randomBytes(VERIFIER_BYTES));
/** A fresh `state`. Ties a callback to the request that started it. */
export const generateState = () => base64Url(randomBytes(STATE_BYTES));
/**
 * The S256 challenge for a verifier: base64url(sha256(verifier)).
 *
 * Sent to the browser; the verifier is not. The server stores the
 * challenge and only accepts a redemption whose verifier hashes to it.
 */
export const challengeFor = (verifier) => base64Url(createHash('sha256').update(verifier).digest());
/** Build the URL opened in the user's browser. */
export const buildSignInUrl = ({ baseUrl = DEFAULT_AUTH_BASE_URL, redirectUri, state, challenge, intent = 'sign-in', }) => {
    const url = new URL(`/${intent}`, baseUrl);
    url.searchParams.set('desktop', '1');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
};
/**
 * Read a callback URL against the state we are expecting.
 *
 * `expectedState` is null when no sign-in is in flight, which is itself a
 * rejection: a callback arriving unprompted is either stale or hostile,
 * and either way there is no verifier to redeem it with.
 *
 * Comparison is length-checked before value-checked so a caller cannot
 * learn anything from timing — thin protection given the code is
 * single-use, but free.
 */
export const readCallback = (rawUrl, expectedState) => {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        return { ok: false, reason: 'malformed' };
    }
    if (url.searchParams.get('error') !== null) {
        return { ok: false, reason: 'provider-error' };
    }
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (expectedState === null)
        return { ok: false, reason: 'unexpected' };
    if (state === null)
        return { ok: false, reason: 'missing-state' };
    if (!statesMatch(state, expectedState)) {
        return { ok: false, reason: 'state-mismatch' };
    }
    if (code === null || code.length === 0) {
        return { ok: false, reason: 'missing-code' };
    }
    return { ok: true, code };
};
const statesMatch = (a, b) => {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
};
/** Where a development build signs in, when nothing says otherwise. */
export const DEV_AUTH_BASE_URL = 'http://localhost:3000';
/**
 * The base URL to sign in against.
 *
 * A packaged build goes to production; an unpackaged one goes to
 * localhost. `SCAMP_AUTH_BASE_URL` overrides either.
 *
 * The first version defaulted everything to production on the reasoning
 * that a dev build must not reach prod by accident. The effect was the
 * reverse of the intent: running `npm run dev` opened the live site,
 * which does not serve the desktop endpoints, so sign-in hung with no
 * explanation. Keying off `isPackaged` gives the protection that was
 * actually wanted in both directions — a dev run cannot reach prod, and a
 * release cannot reach localhost.
 */
export const authBaseUrl = (env = process.env, isPackaged = true) => env['SCAMP_AUTH_BASE_URL'] ??
    (isPackaged ? DEFAULT_AUTH_BASE_URL : DEV_AUTH_BASE_URL);

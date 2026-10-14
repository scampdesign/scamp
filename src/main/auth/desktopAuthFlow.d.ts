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
export declare const DEFAULT_AUTH_BASE_URL = "https://www.scamp.club";
/**
 * Loopback port the browser redirects back to. Fixed, not chosen at
 * runtime: the backend's redirect allowlist is exact-match with no
 * wildcard, so a random port would simply be refused.
 */
export declare const LOOPBACK_PORT = 8976;
/** Redirect URIs the backend accepts, verbatim. */
export declare const LOOPBACK_REDIRECT_URI = "http://localhost:8976/callback";
export declare const SCHEME_REDIRECT_URI = "scamp://auth/callback";
/** A fresh PKCE code verifier. Never leaves the process, never stored. */
export declare const generateVerifier: () => string;
/** A fresh `state`. Ties a callback to the request that started it. */
export declare const generateState: () => string;
/**
 * The S256 challenge for a verifier: base64url(sha256(verifier)).
 *
 * Sent to the browser; the verifier is not. The server stores the
 * challenge and only accepts a redemption whose verifier hashes to it.
 */
export declare const challengeFor: (verifier: string) => string;
export type SignInUrlArgs = {
    baseUrl?: string;
    redirectUri: string;
    state: string;
    challenge: string;
    /** `/sign-up` takes the same parameters, so a new user completes in one pass. */
    intent?: 'sign-in' | 'sign-up';
};
/** Build the URL opened in the user's browser. */
export declare const buildSignInUrl: ({ baseUrl, redirectUri, state, challenge, intent, }: SignInUrlArgs) => string;
export type CallbackResult = {
    ok: true;
    code: string;
} | {
    ok: false;
    reason: CallbackFailure;
};
export type CallbackFailure = 
/** Not a URL we can parse at all. */
'malformed'
/** The provider reported a failure (user cancelled, bad request). */
 | 'provider-error'
/** No `code` parameter. */
 | 'missing-code'
/** No `state` parameter. */
 | 'missing-state'
/** `state` present but not the one we sent — a forged or stale callback. */
 | 'state-mismatch'
/** No sign-in is in flight, so nothing should be arriving. */
 | 'unexpected';
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
export declare const readCallback: (rawUrl: string, expectedState: string | null) => CallbackResult;
/** Where a development build signs in, when nothing says otherwise. */
export declare const DEV_AUTH_BASE_URL = "http://localhost:3000";
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
export declare const authBaseUrl: (env?: Record<string, string | undefined>, isPackaged?: boolean) => string;

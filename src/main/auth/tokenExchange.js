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
/**
 * The user object the backend returns alongside the token is DISPLAY DATA
 * only — enough to show who is signed in without a second call. It is
 * never treated as authority; the server re-checks every request.
 */
const readUser = (value) => {
    if (value === null || typeof value !== 'object')
        return null;
    const u = value;
    if (typeof u['id'] !== 'string' || u['id'].length === 0)
        return null;
    if (typeof u['email'] !== 'string')
        return null;
    return {
        id: u['id'],
        name: typeof u['name'] === 'string' ? u['name'] : '',
        email: u['email'],
        emailVerified: u['emailVerified'] === true,
    };
};
export const exchangeCodeForToken = async ({ baseUrl, code, codeVerifier, fetchImpl, }) => {
    let response;
    try {
        response = await fetchImpl(new URL('/api/desktop/token', baseUrl).toString(), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                // Better Auth checks the origin, and a request from the main
                // process has none — Node's fetch sends no Origin header, unlike a
                // browser. The backend's own reference client sets it explicitly
                // for the same reason; without it the exchange is refused.
                origin: new URL(baseUrl).origin,
            },
            body: JSON.stringify({ code, codeVerifier }),
        });
    }
    catch (err) {
        return {
            status: 'unreachable',
            message: err instanceof Error ? err.message : 'Could not reach Scamp.',
        };
    }
    const raw = await response.text().catch(() => '');
    if (!response.ok) {
        // A rejection here is expected and not alarming: the code is
        // single-use and short-lived, so a retry or a stale callback lands
        // exactly here.
        return {
            status: 'rejected',
            message: readErrorMessage(raw) ?? `Sign-in was refused (${response.status}).`,
        };
    }
    let body;
    try {
        body = JSON.parse(raw);
    }
    catch {
        return { status: 'malformed' };
    }
    if (body === null || typeof body !== 'object')
        return { status: 'malformed' };
    const parsed = body;
    const token = parsed['token'];
    const user = readUser(parsed['user']);
    if (typeof token !== 'string' || token.length === 0 || user === null) {
        return { status: 'malformed' };
    }
    return { status: 'ok', token, user };
};
/** Surface the backend's own wording when it gives one. */
const readErrorMessage = (raw) => {
    try {
        const parsed = JSON.parse(raw);
        const message = parsed['message'] ?? parsed['error'];
        return typeof message === 'string' && message.length > 0 ? message : null;
    }
    catch {
        return null;
    }
};

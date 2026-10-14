import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { authBaseUrl, buildSignInUrl, challengeFor, DEFAULT_AUTH_BASE_URL, DEV_AUTH_BASE_URL, generateState, generateVerifier, LOOPBACK_REDIRECT_URI, readCallback, } from '../src/main/auth/desktopAuthFlow';
/**
 * These mirror the assertions the backend's own check script makes, from
 * the app's side of the flow. The properties that matter are about what an
 * interceptor can do with a callback it steals — see decision 3 of
 * docs/archive/2026-08-28-electron-sign-in-plan.md.
 */
describe('PKCE verifier and challenge', () => {
    it('generates a verifier inside the RFC 7636 length range', () => {
        const v = generateVerifier();
        expect(v.length).toBeGreaterThanOrEqual(43);
        expect(v.length).toBeLessThanOrEqual(128);
    });
    it('generates a verifier of only unreserved URL characters', () => {
        // base64url — anything else would need escaping and the server would
        // hash a different string than we sent.
        expect(generateVerifier()).toMatch(/^[A-Za-z0-9\-_]+$/);
    });
    it('never repeats a verifier', () => {
        const seen = new Set(Array.from({ length: 50 }, () => generateVerifier()));
        expect(seen.size).toBe(50);
    });
    it('derives the challenge as base64url(sha256(verifier))', () => {
        const verifier = 'a'.repeat(64);
        const expected = createHash('sha256')
            .update(verifier)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(challengeFor(verifier)).toBe(expected);
    });
    it('produces a challenge that is not the verifier', () => {
        // Replaying the challenge as the verifier is one of the attacks the
        // backend explicitly refuses; it must not be possible by accident.
        const v = generateVerifier();
        expect(challengeFor(v)).not.toBe(v);
    });
    it('is deterministic for a given verifier', () => {
        const v = generateVerifier();
        expect(challengeFor(v)).toBe(challengeFor(v));
    });
    it('changes completely for a one-character difference', () => {
        expect(challengeFor('verifier-a')).not.toBe(challengeFor('verifier-b'));
    });
});
describe('state', () => {
    it('is within the 8-256 characters the backend requires', () => {
        const s = generateState();
        expect(s.length).toBeGreaterThanOrEqual(8);
        expect(s.length).toBeLessThanOrEqual(256);
    });
    it('never repeats', () => {
        const seen = new Set(Array.from({ length: 50 }, () => generateState()));
        expect(seen.size).toBe(50);
    });
});
describe('buildSignInUrl', () => {
    const args = {
        redirectUri: LOOPBACK_REDIRECT_URI,
        state: 'the-state',
        challenge: 'the-challenge',
    };
    it('carries every parameter the backend expects', () => {
        const url = new URL(buildSignInUrl({ ...args, baseUrl: 'http://localhost:3000' }));
        expect(url.pathname).toBe('/sign-in');
        expect(url.searchParams.get('desktop')).toBe('1');
        expect(url.searchParams.get('redirect_uri')).toBe(LOOPBACK_REDIRECT_URI);
        expect(url.searchParams.get('state')).toBe('the-state');
        expect(url.searchParams.get('code_challenge')).toBe('the-challenge');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
    it('never puts the verifier on the URL', () => {
        // The whole point: the browser must not see it.
        const verifier = generateVerifier();
        const url = buildSignInUrl({ ...args, challenge: challengeFor(verifier) });
        expect(url).not.toContain(verifier);
    });
    it('targets sign-up when asked, so a new user completes in one pass', () => {
        expect(new URL(buildSignInUrl({ ...args, intent: 'sign-up' })).pathname).toBe('/sign-up');
    });
    it('defaults to production so a missing override cannot leak elsewhere', () => {
        expect(buildSignInUrl(args).startsWith(DEFAULT_AUTH_BASE_URL)).toBe(true);
    });
    it('escapes the redirect uri rather than emitting it raw', () => {
        const url = buildSignInUrl({ ...args, redirectUri: 'scamp://auth/callback' });
        expect(url).toContain('redirect_uri=scamp%3A%2F%2Fauth%2Fcallback');
    });
});
describe('readCallback', () => {
    const state = 'expected-state-value';
    const url = (params) => `http://localhost:8976/callback?${params}`;
    it('accepts a callback carrying the expected state', () => {
        expect(readCallback(url(`code=abc&state=${state}`), state)).toEqual({
            ok: true,
            code: 'abc',
        });
    });
    it('rejects a mismatched state — a forged or stale callback', () => {
        expect(readCallback(url('code=abc&state=other'), state)).toEqual({
            ok: false,
            reason: 'state-mismatch',
        });
    });
    it('rejects a callback with no state at all', () => {
        expect(readCallback(url('code=abc'), state)).toEqual({
            ok: false,
            reason: 'missing-state',
        });
    });
    it('rejects anything arriving when no sign-in is in flight', () => {
        // Nothing should reach us unprompted, and there would be no verifier
        // to redeem it with even if it did.
        expect(readCallback(url(`code=abc&state=${state}`), null)).toEqual({
            ok: false,
            reason: 'unexpected',
        });
    });
    it('rejects a valid state with no code', () => {
        expect(readCallback(url(`state=${state}`), state)).toEqual({
            ok: false,
            reason: 'missing-code',
        });
    });
    it('rejects an empty code', () => {
        expect(readCallback(url(`code=&state=${state}`), state)).toEqual({
            ok: false,
            reason: 'missing-code',
        });
    });
    it('reports a provider error ahead of anything else', () => {
        expect(readCallback(url(`error=access_denied&state=${state}`), state)).toEqual({ ok: false, reason: 'provider-error' });
    });
    it('rejects a malformed url rather than throwing', () => {
        expect(readCallback('not-a-url', state)).toEqual({
            ok: false,
            reason: 'malformed',
        });
    });
    it('accepts the custom-scheme callback shape too', () => {
        expect(readCallback(`scamp://auth/callback?code=abc&state=${state}`, state)).toEqual({ ok: true, code: 'abc' });
    });
    it('ignores extra parameters', () => {
        expect(readCallback(url(`code=abc&state=${state}&utm=x`), state)).toEqual({ ok: true, code: 'abc' });
    });
    it('does not match a state that is merely a prefix', () => {
        expect(readCallback(url(`code=abc&state=${state.slice(0, 5)}`), state)).toEqual({ ok: false, reason: 'state-mismatch' });
    });
});
describe('authBaseUrl', () => {
    it('sends a packaged build to production', () => {
        expect(authBaseUrl({}, true)).toBe(DEFAULT_AUTH_BASE_URL);
    });
    it('sends a dev run to localhost', () => {
        // Defaulting dev to production was the reverse of the intent: it
        // opened the live site, which does not serve the desktop endpoints, so
        // sign-in hung with no explanation.
        expect(authBaseUrl({}, false)).toBe(DEV_AUTH_BASE_URL);
    });
    it('honours an explicit override in either build', () => {
        const env = { SCAMP_AUTH_BASE_URL: 'https://staging.example.com' };
        expect(authBaseUrl(env, true)).toBe('https://staging.example.com');
        expect(authBaseUrl(env, false)).toBe('https://staging.example.com');
    });
});

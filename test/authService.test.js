import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { __resetAuthState, currentAuthToken, getStatus, signIn, signOut, } from '../src/main/auth/authService';
/**
 * The whole gesture, with the outside world injected. The failure paths
 * are the point — they are the ones hard to provoke against a real
 * backend. see docs/archive/2026-08-28-electron-sign-in-plan.md
 */
const user = { id: 'u1', name: 'Angie', email: 'a@e.com', emailVerified: true };
/**
 * Real safeStorage THROWS on a blob it did not write. A first version of
 * this double base64-decoded leniently and returned garbage instead, so
 * "signed out when the OS cannot decrypt" failed — the double was wrong,
 * not the code. The tag makes foreign input unmistakable.
 */
const safeStorage = (available = true) => ({
    isEncryptionAvailable: () => available,
    encryptString: (p) => Buffer.from(`enc:${Buffer.from(p, 'utf-8').toString('base64')}`, 'utf-8'),
    decryptString: (b) => {
        const raw = b.toString('utf-8');
        if (!raw.startsWith('enc:'))
            throw new Error('not ours');
        return Buffer.from(raw.slice(4), 'base64').toString('utf-8');
    },
});
let dir;
beforeEach(async () => {
    __resetAuthState();
    testPort = nextPort += 1;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-authsvc-'));
});
afterEach(async () => {
    __resetAuthState();
    await fs.rm(dir, { recursive: true, force: true });
});
/**
 * Drives the browser half: reads the state off the URL the app opened and
 * calls back with it, the way the real sign-in page would.
 */
/**
 * A fresh port per test, never 8976 (the live-backend test holds that).
 *
 * A single module-level constant was enough to make this file flaky:
 * vitest runs files in parallel, and `close` can resolve before the OS
 * has released the socket, so the next `listen` reports port-unavailable
 * — surfacing as a different test failing on each run. Same fix
 * `authLoopbackAndExchange.test.ts` already uses.
 */
let nextPort = 18990;
let testPort = nextPort;
const browserThatSignsIn = (code = 'the-code') => async (url) => {
    const state = new URL(url).searchParams.get('state') ?? '';
    await fetch(`http://127.0.0.1:${testPort}/callback?code=${code}&state=${state}`);
};
const okFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ token: 'session-token', user }),
});
const deps = (over = {}) => ({
    openExternal: browserThatSignsIn(),
    fetchImpl: okFetch,
    safeStorage: safeStorage(),
    userDataDir: dir,
    env: { SCAMP_AUTH_BASE_URL: 'http://localhost:3000' },
    loopbackPort: testPort,
    ...over,
});
describe('signing in', () => {
    it('completes the round trip and reports the user', async () => {
        const result = await signIn(deps());
        expect(result).toEqual({ status: 'signed-in', user, persisted: true });
    });
    it('keeps the token in the main process', async () => {
        await signIn(deps());
        expect(currentAuthToken()).toBe('session-token');
    });
    it('survives a restart once persisted', async () => {
        await signIn(deps());
        __resetAuthState();
        expect(await getStatus(deps())).toEqual({ signedIn: true });
    });
    it('signs in for the session only when the OS cannot encrypt', async () => {
        // Not an error: sign-in worked, it just will not outlive the process,
        // and the UI has to say so.
        const result = await signIn(deps({ safeStorage: safeStorage(false) }));
        expect(result).toEqual({ status: 'signed-in', user, persisted: false });
        expect(currentAuthToken()).toBe('session-token');
    });
    it('refuses a callback whose state does not match', async () => {
        const result = await signIn(deps({
            openExternal: async () => {
                await fetch(`http://127.0.0.1:${testPort}/callback?code=x&state=not-the-state`);
            },
        }));
        expect(result.status).toBe('failed');
        expect(currentAuthToken()).toBeNull();
    });
    it('surfaces the backend wording when the code is refused', async () => {
        const fetchImpl = async () => ({
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ message: 'code already used' }),
        });
        expect(await signIn(deps({ fetchImpl }))).toEqual({
            status: 'failed',
            message: 'code already used',
        });
    });
    it('explains an unreachable backend without leaking the raw error', async () => {
        const fetchImpl = async () => {
            throw new Error('ECONNREFUSED 127.0.0.1:3000');
        };
        const result = await signIn(deps({ fetchImpl }));
        expect(result.status).toBe('failed');
        if (result.status !== 'failed')
            throw new Error('expected failure');
        expect(result.message).toContain('Could not reach Scamp');
    });
    it('stores nothing when the exchange fails', async () => {
        const fetchImpl = async () => ({
            ok: false, status: 400, text: async () => '{}',
        });
        await signIn(deps({ fetchImpl }));
        expect(await fs.readdir(dir)).toEqual([]);
    });
    it('releases the port so a second attempt can run', async () => {
        // The listener must be closed whatever happened, or the fixed port is
        // held and every later sign-in reports port-unavailable.
        await signIn(deps({ fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{}' }) }));
        expect(await signIn(deps())).toEqual({ status: 'signed-in', user, persisted: true });
    });
});
describe('status', () => {
    it('is signed out with nothing stored', async () => {
        expect(await getStatus(deps())).toEqual({ signedIn: false });
    });
    it('is signed out when the OS cannot decrypt what is there', async () => {
        await fs.writeFile(path.join(dir, 'auth-token.bin'), 'another-identity');
        expect(await getStatus(deps())).toEqual({ signedIn: false });
    });
    it('makes no network call', async () => {
        // A signed-out launch must cost nothing; an expired token surfaces as
        // a 401 on the first real request instead.
        let called = false;
        const fetchImpl = async () => {
            called = true;
            return { ok: true, status: 200, text: async () => '{}' };
        };
        await signIn(deps());
        __resetAuthState();
        await getStatus(deps({ fetchImpl }));
        expect(called).toBe(false);
    });
});
describe('signing out', () => {
    it('clears the token from memory and disk', async () => {
        await signIn(deps());
        await signOut(deps());
        expect(currentAuthToken()).toBeNull();
        expect(await getStatus(deps())).toEqual({ signedIn: false });
    });
});

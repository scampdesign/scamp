import { describe, it, expect, beforeEach } from 'vitest';
import { __resetHeartbeatState, HEARTBEAT_INTERVAL_MS, MIN_SEND_GAP_MS, sendHeartbeat, startHeartbeat, } from '../src/main/auth/heartbeat';
let calls;
let unauthorizedCount;
let clock;
beforeEach(() => {
    calls = [];
    unauthorizedCount = 0;
    clock = 1_000_000;
    __resetHeartbeatState();
});
const responder = (status) => async (url, init) => {
    calls.push({ url, init });
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => '',
    };
};
const deps = (over = {}) => ({
    baseUrl: 'https://www.scamp.club',
    fetchImpl: responder(204),
    token: () => 'the-token',
    onUnauthorized: () => {
        unauthorizedCount += 1;
    },
    now: () => clock,
    ...over,
});
describe('sendHeartbeat', () => {
    it('posts to the desktop heartbeat endpoint', async () => {
        expect(await sendHeartbeat(deps())).toBe('sent');
        expect(calls[0]?.url).toBe('https://www.scamp.club/api/desktop/heartbeat');
        expect(calls[0]?.init.method).toBe('POST');
    });
    it('carries the token as a bearer credential', async () => {
        await sendHeartbeat(deps());
        expect(calls[0]?.init.headers['authorization']).toBe('Bearer the-token');
    });
    it('sends an origin header, which the backend requires', async () => {
        // A main-process fetch has none of its own — same reason the token
        // exchange sets it explicitly.
        await sendHeartbeat(deps());
        expect(calls[0]?.init.headers['origin']).toBe('https://www.scamp.club');
    });
    it('sends no body', async () => {
        // There is nothing to parse and nothing to get wrong.
        await sendHeartbeat(deps());
        expect(calls[0]?.init.body).toBeUndefined();
    });
    it('treats 204 as success', async () => {
        expect(await sendHeartbeat(deps({ fetchImpl: responder(204) }))).toBe('sent');
    });
    it('makes no request at all when signed out', async () => {
        // A signed-out app must cost nothing — the same rule that keeps
        // getStatus off the network on launch.
        expect(await sendHeartbeat(deps({ token: () => null }))).toBe('skipped');
        expect(calls).toEqual([]);
    });
    it('makes no request for an empty token', async () => {
        expect(await sendHeartbeat(deps({ token: () => '' }))).toBe('skipped');
        expect(calls).toEqual([]);
    });
    it('calls afterBeat once an accepted beat lands, and not otherwise', async () => {
        let after = 0;
        const count = () => {
            after += 1;
        };
        expect(await sendHeartbeat(deps({ afterBeat: count }))).toBe('sent');
        clock += MIN_SEND_GAP_MS + 1;
        expect(await sendHeartbeat(deps({ afterBeat: count, fetchImpl: responder(500) }))).toBe('failed');
        expect(await sendHeartbeat(deps({ afterBeat: count, token: () => null }))).toBe('skipped');
        expect(after).toBe(1);
    });
    it('signs the user out on a 401', async () => {
        // The session is genuinely gone; without this the UI keeps claiming
        // the user is signed in until they restart.
        expect(await sendHeartbeat(deps({ fetchImpl: responder(401) }))).toBe('unauthorized');
        expect(unauthorizedCount).toBe(1);
    });
    it('does NOT sign the user out when the request never lands', async () => {
        // Offline is not signed out. Clearing a valid token because a café
        // wifi portal ate the request would be a real bug.
        const offline = async () => {
            throw new Error('ENOTFOUND');
        };
        expect(await sendHeartbeat(deps({ fetchImpl: offline }))).toBe('failed');
        expect(unauthorizedCount).toBe(0);
    });
    it('does NOT sign the user out on a server error', async () => {
        expect(await sendHeartbeat(deps({ fetchImpl: responder(500) }))).toBe('failed');
        expect(unauthorizedCount).toBe(0);
    });
    it('reports failure rather than throwing when the server is down', async () => {
        const down = async () => {
            throw new Error('ECONNREFUSED');
        };
        await expect(sendHeartbeat(deps({ fetchImpl: down }))).resolves.toBe('failed');
    });
    it('skips a second send inside the minimum gap', async () => {
        // Launch and an immediate sign-in would otherwise fire twice within
        // seconds. The server throttles anyway; no reason to make the call.
        expect(await sendHeartbeat(deps())).toBe('sent');
        clock += MIN_SEND_GAP_MS - 1;
        expect(await sendHeartbeat(deps())).toBe('skipped');
        expect(calls).toHaveLength(1);
    });
    it('sends again once the gap has passed', async () => {
        expect(await sendHeartbeat(deps())).toBe('sent');
        clock += MIN_SEND_GAP_MS;
        expect(await sendHeartbeat(deps())).toBe('sent');
        expect(calls).toHaveLength(2);
    });
    it('does not start the gap clock on a failed send', async () => {
        // A failure must not suppress the retry that follows it.
        expect(await sendHeartbeat(deps({ fetchImpl: responder(500) }))).toBe('failed');
        expect(await sendHeartbeat(deps())).toBe('sent');
        expect(calls).toHaveLength(2);
    });
    it('builds the url correctly for a base with a trailing path', async () => {
        await sendHeartbeat(deps({ baseUrl: 'http://localhost:3000' }));
        expect(calls[0]?.url).toBe('http://localhost:3000/api/desktop/heartbeat');
    });
});
describe('startHeartbeat', () => {
    it('beats once immediately on launch', async () => {
        const stop = startHeartbeat(deps());
        await Promise.resolve();
        expect(calls).toHaveLength(1);
        stop();
    });
    it('sends nothing on launch when signed out', async () => {
        const stop = startHeartbeat(deps({ token: () => null }));
        await Promise.resolve();
        expect(calls).toEqual([]);
        stop();
    });
    it('repeats on the interval', async () => {
        const stop = startHeartbeat(deps(), 10);
        await Promise.resolve();
        // Move past the send gap so the repeat is not throttled.
        clock += MIN_SEND_GAP_MS;
        await new Promise((r) => setTimeout(r, 25));
        stop();
        expect(calls.length).toBeGreaterThan(1);
    });
    it('stops beating once stopped', async () => {
        const stop = startHeartbeat(deps(), 10);
        await Promise.resolve();
        stop();
        const after = calls.length;
        clock += MIN_SEND_GAP_MS;
        await new Promise((r) => setTimeout(r, 30));
        expect(calls).toHaveLength(after);
    });
    it('defaults to four hours', () => {
        expect(HEARTBEAT_INTERVAL_MS).toBe(4 * 60 * 60 * 1000);
    });
});

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearFeatures, currentFeatures, loadFeatures, parseFeatures, refreshFeatures } from '../src/main/auth/features';
/**
 * Flags from the website. What matters: a flag is on only when the server
 * said exactly `true`, an unreachable server leaves the last answer
 * standing, and signing out forgets it.
 */
let dir;
let calls;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-features-'));
    calls = [];
    await clearFeatures(dir);
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});
const responder = (status, body) => async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
};
const deps = (over = {}) => ({
    baseUrl: 'https://www.scamp.club',
    fetchImpl: responder(200, '{"embedded":true}'),
    token: () => 'the-token',
    userDataDir: dir,
    ...over,
});
describe('parseFeatures', () => {
    it('reads a flag that is exactly true', () => {
        expect(parseFeatures('{"embedded":true}')).toEqual({ embedded: true });
    });
    it('treats anything else as off', () => {
        expect(parseFeatures('{"embedded":"true"}')).toEqual({ embedded: false });
        expect(parseFeatures('{}')).toEqual({ embedded: false });
        expect(parseFeatures('null')).toEqual({ embedded: false });
        expect(parseFeatures('not json')).toEqual({ embedded: false });
    });
});
describe('refreshFeatures', () => {
    it('asks the desktop features endpoint with the bearer token and an origin', async () => {
        expect(await refreshFeatures(deps())).toEqual({ embedded: true });
        expect(calls[0]?.url).toBe('https://www.scamp.club/api/desktop/features');
        expect(calls[0]?.headers['authorization']).toBe('Bearer the-token');
        expect(calls[0]?.headers['origin']).toBe('https://www.scamp.club');
        expect(currentFeatures()).toEqual({ embedded: true });
    });
    it('keeps the last answer on disk, for a launch without a network', async () => {
        await refreshFeatures(deps());
        await clearFeatures(path.join(dir, 'elsewhere'));
        expect(currentFeatures()).toEqual({ embedded: false });
        expect(await loadFeatures(dir)).toEqual({ embedded: true });
    });
    it('leaves the cached flags standing when the server can’t be reached or errors', async () => {
        await refreshFeatures(deps());
        const offline = async () => {
            throw new Error('ENOTFOUND');
        };
        expect(await refreshFeatures(deps({ fetchImpl: offline }))).toBeNull();
        expect(await refreshFeatures(deps({ fetchImpl: responder(500, '') }))).toBeNull();
        expect(currentFeatures()).toEqual({ embedded: true });
    });
    it('makes no request when signed out', async () => {
        expect(await refreshFeatures(deps({ token: () => null }))).toBeNull();
        expect(calls).toHaveLength(0);
    });
    it('records a flag switched off', async () => {
        await refreshFeatures(deps());
        expect(await refreshFeatures(deps({ fetchImpl: responder(200, '{"embedded":false}') }))).toEqual({ embedded: false });
        expect(await loadFeatures(dir)).toEqual({ embedded: false });
    });
});
describe('clearFeatures', () => {
    it('forgets the flags in memory and on disk', async () => {
        await refreshFeatures(deps());
        await clearFeatures(dir);
        expect(currentFeatures()).toEqual({ embedded: false });
        expect(await loadFeatures(dir)).toEqual({ embedded: false });
    });
});

import { describe, expect, it } from 'vitest';
import { installIdForConsent, isValidInstallId, resolveInstallId, } from '../src/main/installId';
import { DEFAULT_SETTINGS } from '../src/main/ipc/settingsOps';
/**
 * The anonymous install id. The tests that matter are the privacy ones:
 * it must be random, and opting out must actually break the link rather
 * than pause it.
 * see docs/archive/2026-08-11-dau-tracking-plan.md
 */
const settings = (over = {}) => ({
    ...DEFAULT_SETTINGS,
    ...over,
});
describe('isValidInstallId', () => {
    it('accepts a v4 UUID', () => {
        expect(isValidInstallId('f81d4fae-7dec-41d0-9765-00a0c91e6bf6')).toBe(true);
    });
    it('rejects anything that is not one', () => {
        for (const bad of ['', 'not-a-uuid', null, undefined, 42, {}]) {
            expect(isValidInstallId(bad)).toBe(false);
        }
    });
    it('rejects a non-v4 UUID', () => {
        // A v1 UUID encodes a timestamp and MAC address — exactly what we
        // must never use as an identifier here.
        expect(isValidInstallId('f81d4fae-7dec-11d0-a765-00a0c91e6bf6')).toBe(false);
    });
});
describe('resolveInstallId', () => {
    it('generates one when none is stored, and says it created it', () => {
        const out = resolveInstallId(settings());
        expect(out.created).toBe(true);
        expect(isValidInstallId(out.installId)).toBe(true);
    });
    it('reuses a stored id, and says it did not create one', () => {
        const existing = 'f81d4fae-7dec-41d0-9765-00a0c91e6bf6';
        expect(resolveInstallId(settings({ installId: existing }))).toEqual({
            installId: existing,
            created: false,
        });
    });
    it('replaces a malformed stored id rather than sending it', () => {
        const out = resolveInstallId(settings({ installId: 'garbage' }));
        expect(out.created).toBe(true);
        expect(out.installId).not.toBe('garbage');
    });
    it('generates a DIFFERENT id each time', () => {
        // Randomness is the privacy property: two installs must never
        // collide onto the same identity.
        const ids = new Set(Array.from({ length: 50 }, () => resolveInstallId(settings()).installId));
        expect(ids.size).toBe(50);
    });
    it('never derives the id from anything in settings', () => {
        // Same settings twice must still give different ids — proof it isn't
        // a hash of machine or user state.
        const a = resolveInstallId(settings({ defaultProjectsFolder: '/home/x' }));
        const b = resolveInstallId(settings({ defaultProjectsFolder: '/home/x' }));
        expect(a.installId).not.toBe(b.installId);
    });
});
describe('installIdForConsent', () => {
    it('returns an id when the user opted in', () => {
        const out = installIdForConsent(settings(), true);
        expect(out).not.toBeNull();
        expect(isValidInstallId(out?.installId)).toBe(true);
    });
    it('returns null when the user has not opted in', () => {
        expect(installIdForConsent(settings(), false)).toBeNull();
    });
    it('returns null even when an id is already stored', () => {
        // Opting out must stop the id being used immediately, not just stop
        // new ones being minted.
        const stored = settings({ installId: 'f81d4fae-7dec-41d0-9765-00a0c91e6bf6' });
        expect(installIdForConsent(stored, false)).toBeNull();
    });
});

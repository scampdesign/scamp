import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, parseSettingsBlob } from '../src/main/ipc/settingsOps';
describe('parseSettingsBlob', () => {
    it('returns defaults for malformed JSON', () => {
        expect(() => parseSettingsBlob('{ not json')).toThrow();
    });
    it('returns defaults when the top-level value is not an object', () => {
        expect(parseSettingsBlob('"a string"')).toEqual(DEFAULT_SETTINGS);
        expect(parseSettingsBlob('42')).toEqual(DEFAULT_SETTINGS);
        expect(parseSettingsBlob('null')).toEqual(DEFAULT_SETTINGS);
    });
    it('fills missing keys with defaults', () => {
        expect(parseSettingsBlob('{}')).toEqual(DEFAULT_SETTINGS);
    });
    it('reads through valid values', () => {
        expect(parseSettingsBlob(JSON.stringify({
            defaultProjectsFolder: '/work',
            artboardBackground: '#fff',
            sentryOptIn: true,
            theme: 'light',
        }))).toEqual({
            defaultProjectsFolder: '/work',
            artboardBackground: '#fff',
            sentryOptIn: true,
            // Absent from the blob above, so they default — an opt-in recorded
            // without a version predates the usage-count wording and is treated
            // as undecided. See test/consent.test.ts.
            consentVersion: 0,
            installId: null,
            theme: 'light',
            onboarding: { offered: false, hidden: true, completed: [] },
        });
    });
    it('migrates the legacy canvasBackground key to artboardBackground', () => {
        expect(parseSettingsBlob(JSON.stringify({ canvasBackground: '#123456' }))
            .artboardBackground).toBe('#123456');
    });
    it('prefers artboardBackground over the legacy key when both are present', () => {
        expect(parseSettingsBlob(JSON.stringify({ artboardBackground: '#aaa', canvasBackground: '#bbb' })).artboardBackground).toBe('#aaa');
    });
    it('coerces wrong-typed values back to defaults', () => {
        const r = parseSettingsBlob(JSON.stringify({ defaultProjectsFolder: 5, sentryOptIn: 'yes' }));
        expect(r.defaultProjectsFolder).toBeNull();
        expect(r.sentryOptIn).toBeNull();
    });
    describe('onboarding', () => {
        it('reads a missing field as hidden and not offered, so an existing install never sees it unasked', () => {
            expect(parseSettingsBlob('{"defaultProjectsFolder":"/work"}').onboarding).toEqual({
                offered: false,
                hidden: true,
                completed: [],
            });
        });
        it('reads through progress, keeping order and dropping repeats and non-strings', () => {
            const blob = JSON.stringify({ onboarding: { offered: true, hidden: false, completed: ['draw', 7, 'layout', 'draw'] } });
            expect(parseSettingsBlob(blob).onboarding).toEqual({ offered: true, hidden: false, completed: ['draw', 'layout'] });
        });
        it('falls back to the default for a malformed field', () => {
            expect(parseSettingsBlob('{"onboarding":"yes"}').onboarding).toEqual(DEFAULT_SETTINGS.onboarding);
            expect(parseSettingsBlob('{"onboarding":{"hidden":"no","completed":"draw"}}').onboarding).toEqual({
                offered: false,
                hidden: true,
                completed: [],
            });
        });
    });
    it('defaults theme to dark when the key is missing', () => {
        expect(parseSettingsBlob('{}').theme).toBe('dark');
    });
    it('keeps an explicit light theme', () => {
        expect(parseSettingsBlob(JSON.stringify({ theme: 'light' })).theme).toBe('light');
    });
    it('falls back to dark for an unknown theme value', () => {
        expect(parseSettingsBlob(JSON.stringify({ theme: 'solarized' })).theme).toBe('dark');
        expect(parseSettingsBlob(JSON.stringify({ theme: 42 })).theme).toBe('dark');
    });
});

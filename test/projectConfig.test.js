import { describe, it, expect } from 'vitest';
import { parseClipByBreakpoint, parseProjectConfig, resolveClip, seedClipFromLegacy, serializeProjectConfig, } from '@shared/projectConfig';
import { DEFAULT_PROJECT_CONFIG } from '@shared/types';
describe('parseProjectConfig', () => {
    it('returns defaults for null input (file missing)', () => {
        expect(parseProjectConfig(null)).toEqual(DEFAULT_PROJECT_CONFIG);
    });
    it('returns defaults for empty string', () => {
        expect(parseProjectConfig('')).toEqual(DEFAULT_PROJECT_CONFIG);
    });
    it('returns defaults for malformed JSON', () => {
        expect(parseProjectConfig('{ not json')).toEqual(DEFAULT_PROJECT_CONFIG);
    });
    it('returns defaults when the top-level value is not an object', () => {
        expect(parseProjectConfig('"string"')).toEqual(DEFAULT_PROJECT_CONFIG);
        expect(parseProjectConfig('[1,2,3]')).toEqual(DEFAULT_PROJECT_CONFIG);
        expect(parseProjectConfig('null')).toEqual(DEFAULT_PROJECT_CONFIG);
    });
    it('falls back to defaults when the keys are missing', () => {
        expect(parseProjectConfig('{}')).toEqual(DEFAULT_PROJECT_CONFIG);
    });
    it('falls back to the default artboard colour when the value is the wrong type', () => {
        expect(parseProjectConfig('{"artboardBackground": 42}')).toEqual(DEFAULT_PROJECT_CONFIG);
        expect(parseProjectConfig('{"artboardBackground": null}')).toEqual(DEFAULT_PROJECT_CONFIG);
        expect(parseProjectConfig('{"artboardBackground": ""}')).toEqual(DEFAULT_PROJECT_CONFIG);
    });
    it('accepts a valid hex colour', () => {
        expect(parseProjectConfig('{"artboardBackground": "#123456"}')).toEqual({
            ...DEFAULT_PROJECT_CONFIG,
            artboardBackground: '#123456',
        });
    });
    it('accepts other CSS colour forms (rgb, named)', () => {
        expect(parseProjectConfig('{"artboardBackground": "rgb(10, 20, 30)"}')).toEqual({
            ...DEFAULT_PROJECT_CONFIG,
            artboardBackground: 'rgb(10, 20, 30)',
        });
        expect(parseProjectConfig('{"artboardBackground": "rebeccapurple"}')).toEqual({
            ...DEFAULT_PROJECT_CONFIG,
            artboardBackground: 'rebeccapurple',
        });
    });
    it('ignores unknown extra keys without mutating the result', () => {
        const parsed = parseProjectConfig('{"artboardBackground": "#222", "futureKey": 99}');
        expect(parsed).toEqual({ ...DEFAULT_PROJECT_CONFIG, artboardBackground: '#222' });
    });
    it('clamps canvasWidth into the supported range', () => {
        expect(parseProjectConfig('{"canvasWidth": 50}')).toMatchObject({
            canvasWidth: 100,
        });
        expect(parseProjectConfig('{"canvasWidth": 9999}')).toMatchObject({
            canvasWidth: 4000,
        });
        expect(parseProjectConfig('{"canvasWidth": 390}')).toMatchObject({
            canvasWidth: 390,
        });
    });
    it('falls back to the default canvasWidth when the value is the wrong type', () => {
        expect(parseProjectConfig('{"canvasWidth": "huge"}')).toMatchObject({
            canvasWidth: DEFAULT_PROJECT_CONFIG.canvasWidth,
        });
    });
    it('accepts canvasOverflowHidden as a boolean', () => {
        expect(parseProjectConfig('{"canvasOverflowHidden": true}')).toMatchObject({
            canvasOverflowHidden: true,
        });
        expect(parseProjectConfig('{"canvasOverflowHidden": false}')).toMatchObject({
            canvasOverflowHidden: false,
        });
    });
    it('rounds a fractional canvasWidth to the nearest integer', () => {
        expect(parseProjectConfig('{"canvasWidth": 768.4}')).toMatchObject({
            canvasWidth: 768,
        });
    });
    it('stores canvasMigrationAcknowledged only when strictly true', () => {
        expect(parseProjectConfig('{"canvasMigrationAcknowledged": true}')).toMatchObject({ canvasMigrationAcknowledged: true });
        // Missing, false, or a truthy non-boolean → field is absent.
        expect(parseProjectConfig('{}').canvasMigrationAcknowledged).toBeUndefined();
        expect(parseProjectConfig('{"canvasMigrationAcknowledged": false}')
            .canvasMigrationAcknowledged).toBeUndefined();
        expect(parseProjectConfig('{"canvasMigrationAcknowledged": "yes"}')
            .canvasMigrationAcknowledged).toBeUndefined();
    });
});
describe('parseProjectConfig — componentCanvas', () => {
    it('returns undefined componentCanvas when the field is absent', () => {
        const config = parseProjectConfig(JSON.stringify({ canvasWidth: 800 }));
        expect(config.componentCanvas).toBeUndefined();
    });
    it('parses a valid componentCanvas map', () => {
        const config = parseProjectConfig(JSON.stringify({
            componentCanvas: {
                Button: { width: 240, height: 60 },
                HeroCard: { width: 800, height: 600 },
            },
        }));
        expect(config.componentCanvas).toEqual({
            Button: { width: 240, height: 60 },
            HeroCard: { width: 800, height: 600 },
        });
    });
    it('clamps dimensions to MIN/MAX_COMPONENT_CANVAS_DIM', () => {
        const config = parseProjectConfig(JSON.stringify({
            componentCanvas: {
                Tiny: { width: 10, height: 5 },
                Huge: { width: 99999, height: 99999 },
            },
        }));
        // Floor: 20 (smaller than the page-canvas 100 floor because
        // components legitimately want sub-100 dimensions for things
        // like icon buttons).
        expect(config.componentCanvas?.Tiny).toEqual({ width: 20, height: 20 });
        expect(config.componentCanvas?.Huge).toEqual({
            width: 4000,
            height: 4000,
        });
    });
    it('drops malformed entries silently', () => {
        const config = parseProjectConfig(JSON.stringify({
            componentCanvas: {
                Good: { width: 240, height: 60 },
                NoHeight: { width: 240 },
                NotANumber: { width: 'wide', height: 60 },
                NotAnObject: 'foo',
            },
        }));
        expect(config.componentCanvas).toEqual({
            Good: { width: 240, height: 60 },
        });
    });
    it('returns undefined when every entry is invalid', () => {
        const config = parseProjectConfig(JSON.stringify({
            componentCanvas: { Bad: { width: 'x', height: 'y' } },
        }));
        expect(config.componentCanvas).toBeUndefined();
    });
    it('round-trips through serialize → parse', () => {
        const config = {
            ...DEFAULT_PROJECT_CONFIG,
            componentCanvas: {
                Button: { width: 240, height: 60 },
            },
        };
        expect(parseProjectConfig(serializeProjectConfig(config))).toEqual(config);
    });
});
describe('serializeProjectConfig', () => {
    it('round-trips through parse back to the original object', () => {
        const config = { ...DEFAULT_PROJECT_CONFIG, artboardBackground: '#abcdef' };
        expect(parseProjectConfig(serializeProjectConfig(config))).toEqual(config);
    });
    it('emits a trailing newline so the file is POSIX-friendly', () => {
        const serialized = serializeProjectConfig(DEFAULT_PROJECT_CONFIG);
        expect(serialized.endsWith('\n')).toBe(true);
    });
    it('formats with two-space indent', () => {
        const serialized = serializeProjectConfig(DEFAULT_PROJECT_CONFIG);
        // Every field appears on its own line with two-space indent.
        expect(serialized).toContain('\n  "artboardBackground":');
        expect(serialized).toContain('\n  "canvasWidth":');
        expect(serialized).toContain('\n  "canvasOverflowHidden":');
    });
});
describe('resolveClip', () => {
    it('returns false when no map is present', () => {
        expect(resolveClip({}, 'desktop')).toBe(false);
    });
    it('returns false for a breakpoint missing from the map', () => {
        expect(resolveClip({ canvasClipByBreakpoint: { mobile: true } }, 'desktop')).toBe(false);
    });
    it('returns true for a breakpoint set in the map', () => {
        expect(resolveClip({ canvasClipByBreakpoint: { mobile: true } }, 'mobile')).toBe(true);
    });
});
describe('seedClipFromLegacy', () => {
    it('seeds the desktop key from a legacy true', () => {
        expect(seedClipFromLegacy(true)).toEqual({ desktop: true });
    });
    it('returns undefined for a legacy false', () => {
        expect(seedClipFromLegacy(false)).toBeUndefined();
    });
});
describe('parseClipByBreakpoint', () => {
    it('keeps only truthy entries', () => {
        expect(parseClipByBreakpoint({ mobile: true, tablet: false, desktop: true })).toEqual({ mobile: true, desktop: true });
    });
    it('returns undefined for an empty or non-object input', () => {
        expect(parseClipByBreakpoint({})).toBeUndefined();
        expect(parseClipByBreakpoint({ mobile: false })).toBeUndefined();
        expect(parseClipByBreakpoint(null)).toBeUndefined();
        expect(parseClipByBreakpoint([1, 2])).toBeUndefined();
    });
});
describe('parseProjectConfig — overflow & height fields', () => {
    it('migrates a legacy canvasOverflowHidden:true into the desktop clip key', () => {
        const cfg = parseProjectConfig(JSON.stringify({ canvasOverflowHidden: true }));
        expect(cfg.canvasClipByBreakpoint).toEqual({ desktop: true });
    });
    it('prefers an explicit per-breakpoint map over the legacy flag', () => {
        const cfg = parseProjectConfig(JSON.stringify({
            canvasOverflowHidden: true,
            canvasClipByBreakpoint: { mobile: true },
        }));
        expect(cfg.canvasClipByBreakpoint).toEqual({ mobile: true });
    });
    it('omits the clip map entirely when nothing is set', () => {
        const cfg = parseProjectConfig(JSON.stringify({ canvasWidth: 1440 }));
        expect(cfg.canvasClipByBreakpoint).toBeUndefined();
    });
    it('parses and clamps a fixed canvas height', () => {
        const cfg = parseProjectConfig(JSON.stringify({ canvasFixedHeight: true, canvasHeight: 900 }));
        expect(cfg.canvasFixedHeight).toBe(true);
        expect(cfg.canvasHeight).toBe(900);
    });
    it('drops canvasFixedHeight when not explicitly true', () => {
        const cfg = parseProjectConfig(JSON.stringify({ canvasFixedHeight: false }));
        expect(cfg.canvasFixedHeight).toBeUndefined();
    });
});
describe('parseProjectConfig — card meta', () => {
    it('parses a valid card background color', () => {
        const cfg = parseProjectConfig(JSON.stringify({ cardBackground: '#3b82f6' }));
        expect(cfg.cardBackground).toBe('#3b82f6');
    });
    it('drops an invalid card background (non-string / control chars)', () => {
        expect(parseProjectConfig(JSON.stringify({ cardBackground: 42 })).cardBackground).toBeUndefined();
        expect(parseProjectConfig(JSON.stringify({ cardBackground: 'red\n' }))
            .cardBackground).toBeUndefined();
    });
    it('trims and length-caps the state string', () => {
        const cfg = parseProjectConfig(JSON.stringify({ state: '  ready to review  ' }));
        expect(cfg.state).toBe('ready to review');
        const long = parseProjectConfig(JSON.stringify({ state: 'x'.repeat(80) }));
        expect(long.state).toHaveLength(40);
    });
    it('omits state when empty or whitespace', () => {
        expect(parseProjectConfig(JSON.stringify({ state: '   ' })).state).toBeUndefined();
        expect(parseProjectConfig(JSON.stringify({ state: 5 })).state).toBeUndefined();
    });
    it('omits both fields when absent', () => {
        const cfg = parseProjectConfig(JSON.stringify({ canvasWidth: 1440 }));
        expect(cfg.cardBackground).toBeUndefined();
        expect(cfg.state).toBeUndefined();
    });
    it('round-trips card meta through serialize → parse', () => {
        const written = serializeProjectConfig(parseProjectConfig(JSON.stringify({ cardBackground: '#112233', state: 'in progress' })));
        const back = parseProjectConfig(written);
        expect(back.cardBackground).toBe('#112233');
        expect(back.state).toBe('in progress');
    });
});
describe('pageLayout', () => {
    it('round-trips groups and order through serialize → parse', () => {
        const config = {
            ...DEFAULT_PROJECT_CONFIG,
            pageLayout: [{ page: 'home' }, { group: 'Marketing', pages: ['about', 'pricing'] }, { group: 'Empty', pages: [] }],
        };
        expect(parseProjectConfig(serializeProjectConfig(config)).pageLayout).toEqual(config.pageLayout);
    });
    it('leaves a config without one unchanged, byte for byte', () => {
        const raw = serializeProjectConfig(DEFAULT_PROJECT_CONFIG);
        expect(serializeProjectConfig(parseProjectConfig(raw))).toBe(raw);
    });
    it('keeps the first of a repeated page or group, and drops malformed entries', () => {
        const raw = JSON.stringify({
            pageLayout: [
                { page: 'home' },
                { page: 'home' },
                { group: 'A', pages: ['home', 'about', 7] },
                { group: 'A', pages: ['x'] },
                { group: '  ', pages: [] },
                'nonsense',
                { page: '' },
            ],
        });
        expect(parseProjectConfig(raw).pageLayout).toEqual([{ page: 'home' }, { group: 'A', pages: ['about'] }]);
    });
    it('ignores a pageLayout that is not a list', () => {
        expect(parseProjectConfig(JSON.stringify({ pageLayout: { page: 'home' } })).pageLayout).toBeUndefined();
    });
});

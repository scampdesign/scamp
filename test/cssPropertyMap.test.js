import { describe, it, expect } from 'vitest';
import { cssToScampProperty, isMappedProperty } from '@lib/cssPropertyMap';
const apply = (prop, value) => {
    const fn = cssToScampProperty[prop];
    if (!fn)
        throw new Error(`No mapper for ${prop}`);
    return fn(value);
};
describe('cssToScampProperty', () => {
    describe('background', () => {
        it('maps `background` to backgroundColor', () => {
            expect(apply('background', '#f0f0f0')).toEqual({ backgroundColor: '#f0f0f0' });
        });
        it('maps `background-color` to backgroundColor', () => {
            expect(apply('background-color', 'red')).toEqual({ backgroundColor: 'red' });
        });
    });
    describe('border-radius', () => {
        it('parses px', () => {
            expect(apply('border-radius', '8px')).toEqual({ borderRadius: [8, 8, 8, 8] });
        });
        it('refuses an empty value (preserved via customProperties)', () => {
            expect(apply('border-radius', '')).toBeNull();
        });
        it('refuses a percent value (preserved via customProperties)', () => {
            expect(apply('border-radius', '50%')).toBeNull();
        });
        it('refuses elliptical-corner shorthand (preserved via customProperties)', () => {
            expect(apply('border-radius', '10px / 20px')).toBeNull();
        });
        it('accepts var()-based values into a token-form tuple', () => {
            expect(apply('border-radius', 'var(--radius-md)')).toEqual({
                borderRadius: [
                    { kind: 'token', ref: 'var(--radius-md)' },
                    { kind: 'token', ref: 'var(--radius-md)' },
                    { kind: 'token', ref: 'var(--radius-md)' },
                    { kind: 'token', ref: 'var(--radius-md)' },
                ],
            });
        });
    });
    describe('display', () => {
        it('maps flex', () => {
            expect(apply('display', 'flex')).toEqual({ display: 'flex' });
        });
        it('maps grid', () => {
            expect(apply('display', 'grid')).toEqual({ display: 'grid' });
        });
        it('maps display: none to visibilityMode', () => {
            expect(apply('display', 'none')).toEqual({ visibilityMode: 'none' });
        });
        it('maps `block` to the non-flex / non-grid sentinel, clearing any outer value', () => {
            expect(apply('display', 'block')).toEqual({ display: 'none', displayOuter: undefined });
            // Present-but-undefined, so a breakpoint override of `block` clears
            // an inline base instead of inheriting it.
            expect(Object.keys(apply('display', 'block') ?? {})).toContain('displayOuter');
        });
        it('maps the inline and box values onto display + displayOuter', () => {
            expect(apply('display', 'inline')).toEqual({ display: 'none', displayOuter: 'inline' });
            expect(apply('display', 'inline-block')).toEqual({ display: 'none', displayOuter: 'inline-block' });
            expect(apply('display', 'contents')).toEqual({ display: 'none', displayOuter: 'contents' });
            expect(apply('display', 'list-item')).toEqual({ display: 'none', displayOuter: 'list-item' });
            expect(apply('display', 'inline-flex')).toEqual({ display: 'flex', displayOuter: 'inline' });
            expect(apply('display', 'inline-grid')).toEqual({ display: 'grid', displayOuter: 'inline' });
        });
        it('refuses values the model can’t hold (preserved via customProperties)', () => {
            expect(apply('display', 'flow-root')).toBeNull();
            expect(apply('display', 'table-row')).toBeNull();
            expect(apply('display', 'inline-table')).toBeNull();
            expect(apply('display', 'ruby')).toBeNull();
        });
    });
    describe('flex-direction', () => {
        it('maps row', () => {
            expect(apply('flex-direction', 'row')).toEqual({ flexDirection: 'row' });
        });
        it('maps column', () => {
            expect(apply('flex-direction', 'column')).toEqual({ flexDirection: 'column' });
        });
        it('refuses unsupported directions (preserved via customProperties)', () => {
            expect(apply('flex-direction', 'diagonal')).toBeNull();
        });
    });
    describe('gap', () => {
        // Only `gap`. Populating the axis fields too broke the round trip for
        // flex elements, which have gap but no axis values — the grid case is
        // handled by the generator emitting `gap` from this same field.
        // see docs/notes/grid-gap-shorthand.md
        it('parses px', () => {
            expect(apply('gap', '16px')).toEqual({ gap: 16 });
        });
        it('accepts var()-based values as a token-form SpaceValue', () => {
            expect(apply('gap', 'var(--space-3)')).toEqual({
                gap: { kind: 'token', ref: 'var(--space-3)' },
            });
        });
        it('still refuses unsupported units (rem, %, etc.)', () => {
            expect(apply('gap', '1rem')).toBeNull();
            expect(apply('gap', '50%')).toBeNull();
        });
    });
    describe('align-items', () => {
        it('maps flex-start', () => {
            expect(apply('align-items', 'flex-start')).toEqual({ alignItems: 'flex-start' });
        });
        it('maps center', () => {
            expect(apply('align-items', 'center')).toEqual({ alignItems: 'center' });
        });
        it('refuses unsupported values', () => {
            expect(apply('align-items', 'middle')).toBeNull();
        });
    });
    describe('justify-content', () => {
        it('maps space-between', () => {
            expect(apply('justify-content', 'space-between')).toEqual({
                justifyContent: 'space-between',
            });
        });
        it('refuses unsupported values', () => {
            expect(apply('justify-content', 'left')).toBeNull();
        });
    });
    describe('min-height', () => {
        it('preserves a viewport-unit value as a string', () => {
            expect(apply('min-height', '100vh')).toEqual({ minHeight: '100vh' });
        });
        it('preserves a px value as a string', () => {
            expect(apply('min-height', '500px')).toEqual({ minHeight: '500px' });
        });
        it('preserves a var() reference', () => {
            expect(apply('min-height', 'var(--page-min-h)')).toEqual({
                minHeight: 'var(--page-min-h)',
            });
        });
        it('preserves a calc() expression', () => {
            expect(apply('min-height', 'calc(100vh - 64px)')).toEqual({
                minHeight: 'calc(100vh - 64px)',
            });
        });
        it('refuses an empty value', () => {
            expect(apply('min-height', '')).toBeNull();
        });
    });
    describe('width / height', () => {
        it('width 100% switches to stretch and clears widthCustom', () => {
            expect(apply('width', '100%')).toEqual({
                widthMode: 'stretch',
                widthCustom: undefined,
            });
        });
        it('width with px sets fixed mode and value, no custom', () => {
            expect(apply('width', '320px')).toEqual({
                widthMode: 'fixed',
                widthValue: 320,
                widthCustom: undefined,
            });
        });
        it('width with bare number is treated as px', () => {
            expect(apply('width', '320')).toEqual({
                widthMode: 'fixed',
                widthValue: 320,
                widthCustom: undefined,
            });
        });
        it('width fit-content switches to fit-content mode', () => {
            expect(apply('width', 'fit-content')).toEqual({
                widthMode: 'fit-content',
                widthCustom: undefined,
            });
        });
        it('width 100vh stays in fixed mode with verbatim widthCustom', () => {
            expect(apply('width', '100vh')).toEqual({
                widthMode: 'fixed',
                widthValue: 100,
                widthCustom: '100vh',
            });
        });
        it('width calc() preserves the verbatim string in widthCustom', () => {
            expect(apply('width', 'calc(100% - 20px)')).toEqual({
                widthMode: 'fixed',
                widthValue: 0,
                widthCustom: 'calc(100% - 20px)',
            });
        });
        it('width var() preserves the verbatim string in widthCustom', () => {
            expect(apply('width', 'var(--page-w)')).toEqual({
                widthMode: 'fixed',
                widthValue: 0,
                widthCustom: 'var(--page-w)',
            });
        });
        it('width 50% stays fixed (only literal 100% is stretch)', () => {
            expect(apply('width', '50%')).toEqual({
                widthMode: 'fixed',
                widthValue: 50,
                widthCustom: '50%',
            });
        });
        it('height 100% switches to stretch', () => {
            expect(apply('height', '100%')).toEqual({
                heightMode: 'stretch',
                heightCustom: undefined,
            });
        });
        it('height with px sets fixed mode and value', () => {
            expect(apply('height', '200px')).toEqual({
                heightMode: 'fixed',
                heightValue: 200,
                heightCustom: undefined,
            });
        });
        it('height 100vh preserves verbatim heightCustom', () => {
            expect(apply('height', '100vh')).toEqual({
                heightMode: 'fixed',
                heightValue: 100,
                heightCustom: '100vh',
            });
        });
        it('height fit-content switches to fit-content mode', () => {
            expect(apply('height', 'fit-content')).toEqual({
                heightMode: 'fit-content',
                heightCustom: undefined,
            });
        });
    });
    describe('border', () => {
        it('parses shorthand', () => {
            expect(apply('border', '2px dashed #000')).toEqual({
                borderWidth: [2, 2, 2, 2],
                borderStyle: 'dashed',
                borderColor: '#000',
            });
        });
        it('parses individual longhands', () => {
            expect(apply('border-width', '1px')).toEqual({ borderWidth: [1, 1, 1, 1] });
            expect(apply('border-style', 'dotted')).toEqual({ borderStyle: 'dotted' });
            expect(apply('border-color', 'red')).toEqual({ borderColor: 'red' });
        });
        it('refuses unsupported border-style values', () => {
            expect(apply('border-style', 'double')).toBeNull();
        });
        it('accepts var()-based border-width into a token-form tuple', () => {
            expect(apply('border-width', 'var(--border-thin)')).toEqual({
                borderWidth: [
                    { kind: 'token', ref: 'var(--border-thin)' },
                    { kind: 'token', ref: 'var(--border-thin)' },
                    { kind: 'token', ref: 'var(--border-thin)' },
                    { kind: 'token', ref: 'var(--border-thin)' },
                ],
            });
        });
    });
    describe('box-shadow', () => {
        it('parses a single shadow into the typed list', () => {
            expect(apply('box-shadow', '0 4px 8px 0 rgba(0, 0, 0, 0.15)')).toEqual({
                boxShadows: [
                    {
                        offsetX: 0,
                        offsetY: 4,
                        blur: 8,
                        spread: 0,
                        color: 'rgba(0, 0, 0, 0.15)',
                        inset: false,
                    },
                ],
            });
        });
        it('parses a multi-shadow comma-separated list in order', () => {
            expect(apply('box-shadow', '0 4px 8px 0 rgba(0, 0, 0, 0.15), inset 0 0 0 1px #ffffff')).toEqual({
                boxShadows: [
                    {
                        offsetX: 0,
                        offsetY: 4,
                        blur: 8,
                        spread: 0,
                        color: 'rgba(0, 0, 0, 0.15)',
                        inset: false,
                    },
                    {
                        offsetX: 0,
                        offsetY: 0,
                        blur: 0,
                        spread: 1,
                        color: '#ffffff',
                        inset: true,
                    },
                ],
            });
        });
        it('clears the field for none', () => {
            expect(apply('box-shadow', 'none')).toEqual({ boxShadows: [] });
        });
        it('refuses var()-based shadow values (preserved via customProperties)', () => {
            expect(apply('box-shadow', 'var(--shadow-md)')).toBeNull();
        });
        it('refuses inherit / initial / unset', () => {
            expect(apply('box-shadow', 'inherit')).toBeNull();
            expect(apply('box-shadow', 'initial')).toBeNull();
            expect(apply('box-shadow', 'unset')).toBeNull();
        });
        it('refuses partial-failure lists rather than dropping good shadows', () => {
            expect(apply('box-shadow', '0 4px 8px #000, var(--shadow-md)')).toBeNull();
        });
    });
    describe('mix-blend-mode', () => {
        it('routes a known keyword into the typed field', () => {
            expect(apply('mix-blend-mode', 'multiply')).toEqual({
                mixBlendMode: 'multiply',
            });
        });
        it('parses keywords case-insensitively', () => {
            expect(apply('mix-blend-mode', 'Color-Burn')).toEqual({
                mixBlendMode: 'color-burn',
            });
        });
        it('routes the default keyword into the typed field', () => {
            expect(apply('mix-blend-mode', 'normal')).toEqual({
                mixBlendMode: 'normal',
            });
        });
        it('refuses an unknown keyword (preserved via customProperties)', () => {
            expect(apply('mix-blend-mode', 'plus-darker')).toBeNull();
        });
        it('refuses inherit / initial / unset', () => {
            expect(apply('mix-blend-mode', 'inherit')).toBeNull();
            expect(apply('mix-blend-mode', 'initial')).toBeNull();
            expect(apply('mix-blend-mode', 'unset')).toBeNull();
        });
    });
    describe('background-blend-mode', () => {
        it('routes a known keyword into the typed field', () => {
            expect(apply('background-blend-mode', 'screen')).toEqual({
                backgroundBlendMode: 'screen',
            });
        });
        it('parses keywords case-insensitively', () => {
            expect(apply('background-blend-mode', 'HARD-LIGHT')).toEqual({
                backgroundBlendMode: 'hard-light',
            });
        });
        it('refuses multi-layer lists (single keyword only)', () => {
            expect(apply('background-blend-mode', 'multiply, screen')).toBeNull();
        });
        it('refuses an unknown keyword', () => {
            expect(apply('background-blend-mode', 'plus-lighter')).toBeNull();
        });
    });
    describe('filter', () => {
        it('routes a single function into the typed filters field', () => {
            expect(apply('filter', 'blur(4px)')).toEqual({
                filters: [{ kind: 'blur', value: 4 }],
            });
        });
        it('routes a multi-function list in order', () => {
            expect(apply('filter', 'blur(4px) brightness(120%) grayscale(50%)')).toEqual({
                filters: [
                    { kind: 'blur', value: 4 },
                    { kind: 'brightness', value: 120 },
                    { kind: 'grayscale', value: 50 },
                ],
            });
        });
        it('parses function names case-insensitively', () => {
            expect(apply('filter', 'BLUR(4px)')).toEqual({
                filters: [{ kind: 'blur', value: 4 }],
            });
        });
        it('clears to empty list for none', () => {
            expect(apply('filter', 'none')).toEqual({ filters: [] });
        });
        it('refuses unknown filter functions', () => {
            expect(apply('filter', 'drop-shadow(0 4px 8px #000)')).toBeNull();
        });
        it('refuses inherit / initial / unset / revert', () => {
            expect(apply('filter', 'inherit')).toBeNull();
            expect(apply('filter', 'initial')).toBeNull();
            expect(apply('filter', 'unset')).toBeNull();
            expect(apply('filter', 'revert')).toBeNull();
        });
        it('refuses if ANY function fails (no silent drops)', () => {
            expect(apply('filter', 'blur(4px) drop-shadow(0 0 0)')).toBeNull();
        });
        it('refuses unit-mismatched arguments', () => {
            expect(apply('filter', 'blur(50%)')).toBeNull();
            expect(apply('filter', 'brightness(2px)')).toBeNull();
        });
        it('refuses unitless decimal arguments for percent-typed kinds', () => {
            expect(apply('filter', 'brightness(1.2)')).toBeNull();
        });
    });
    describe('backdrop-filter', () => {
        it('routes a single function into the typed backdropFilters field', () => {
            expect(apply('backdrop-filter', 'blur(12px)')).toEqual({
                backdropFilters: [{ kind: 'blur', value: 12 }],
            });
        });
        it('routes a multi-function list', () => {
            expect(apply('backdrop-filter', 'blur(12px) saturate(150%)')).toEqual({
                backdropFilters: [
                    { kind: 'blur', value: 12 },
                    { kind: 'saturate', value: 150 },
                ],
            });
        });
        it('clears to empty list for none', () => {
            expect(apply('backdrop-filter', 'none')).toEqual({ backdropFilters: [] });
        });
        it('refuses unknown filter functions', () => {
            expect(apply('backdrop-filter', 'drop-shadow(0 0 0)')).toBeNull();
        });
    });
    describe('padding', () => {
        it('parses 1-value shorthand', () => {
            expect(apply('padding', '8px')).toEqual({ padding: [8, 8, 8, 8] });
        });
        it('parses 4-value shorthand', () => {
            expect(apply('padding', '1px 2px 3px 4px')).toEqual({ padding: [1, 2, 3, 4] });
        });
        it('accepts var()-based values into a token-form tuple', () => {
            const ref = (r) => ({ kind: 'token', ref: r });
            expect(apply('padding', 'var(--space-3)')).toEqual({
                padding: [
                    ref('var(--space-3)'),
                    ref('var(--space-3)'),
                    ref('var(--space-3)'),
                    ref('var(--space-3)'),
                ],
            });
            expect(apply('padding', 'var(--space-3) var(--space-5)')).toEqual({
                padding: [
                    ref('var(--space-3)'),
                    ref('var(--space-5)'),
                    ref('var(--space-3)'),
                    ref('var(--space-5)'),
                ],
            });
        });
        it('accepts mixed px + var() shorthand', () => {
            expect(apply('padding', '16px var(--inline-pad)')).toEqual({
                padding: [
                    16,
                    { kind: 'token', ref: 'var(--inline-pad)' },
                    16,
                    { kind: 'token', ref: 'var(--inline-pad)' },
                ],
            });
        });
        it('still refuses non-px non-var units (rem, %, auto)', () => {
            expect(apply('padding', '1rem')).toBeNull();
            expect(apply('padding', '50%')).toBeNull();
        });
    });
    describe('margin', () => {
        it('parses 1-value shorthand', () => {
            expect(apply('margin', '12px')).toEqual({ margin: [12, 12, 12, 12] });
        });
        it('parses 2-value shorthand', () => {
            expect(apply('margin', '4px 8px')).toEqual({ margin: [4, 8, 4, 8] });
        });
        it('parses 3-value shorthand', () => {
            expect(apply('margin', '1px 2px 3px')).toEqual({ margin: [1, 2, 3, 2] });
        });
        it('parses 4-value shorthand', () => {
            expect(apply('margin', '1px 2px 3px 4px')).toEqual({ margin: [1, 2, 3, 4] });
        });
        it('refuses empty input', () => {
            expect(apply('margin', '')).toBeNull();
        });
        it('accepts var()-based values into a token-form tuple', () => {
            expect(apply('margin', 'var(--space-2)')).toEqual({
                margin: [
                    { kind: 'token', ref: 'var(--space-2)' },
                    { kind: 'token', ref: 'var(--space-2)' },
                    { kind: 'token', ref: 'var(--space-2)' },
                    { kind: 'token', ref: 'var(--space-2)' },
                ],
            });
        });
    });
    describe('line-height', () => {
        it('preserves a unitless decimal as a string', () => {
            expect(apply('line-height', '1.5')).toEqual({ lineHeight: '1.5' });
        });
        it('preserves an integer multiplier as a string', () => {
            expect(apply('line-height', '2')).toEqual({ lineHeight: '2' });
        });
        it('preserves px form as a string (no longer rejected)', () => {
            expect(apply('line-height', '24px')).toEqual({ lineHeight: '24px' });
        });
        it('preserves var() refs', () => {
            expect(apply('line-height', 'var(--leading-tight)')).toEqual({
                lineHeight: 'var(--leading-tight)',
            });
        });
        it('refuses empty input', () => {
            expect(apply('line-height', '')).toBeNull();
        });
    });
    describe('letter-spacing', () => {
        it('preserves a px value as a string', () => {
            expect(apply('letter-spacing', '2px')).toEqual({ letterSpacing: '2px' });
        });
        it('preserves a negative px value', () => {
            expect(apply('letter-spacing', '-1px')).toEqual({ letterSpacing: '-1px' });
        });
        it('preserves rem / em forms', () => {
            expect(apply('letter-spacing', '0.05em')).toEqual({
                letterSpacing: '0.05em',
            });
        });
        it('refuses empty input', () => {
            expect(apply('letter-spacing', '')).toBeNull();
        });
    });
    describe('text properties', () => {
        it('maps font-size as a string', () => {
            expect(apply('font-size', '14px')).toEqual({ fontSize: '14px' });
        });
        it('preserves rem font-size', () => {
            expect(apply('font-size', '1.125rem')).toEqual({ fontSize: '1.125rem' });
        });
        it('preserves var() font-size', () => {
            expect(apply('font-size', 'var(--text-lg)')).toEqual({
                fontSize: 'var(--text-lg)',
            });
        });
        it('maps a standard font-weight', () => {
            expect(apply('font-weight', '600')).toEqual({ fontWeight: 600 });
        });
        it('maps the extreme named weights (100 Thin, 900 Black)', () => {
            expect(apply('font-weight', '100')).toEqual({ fontWeight: 100 });
            expect(apply('font-weight', '900')).toEqual({ fontWeight: 900 });
        });
        it('maps a non-multiple-of-100 variable-font weight', () => {
            expect(apply('font-weight', '350')).toEqual({ fontWeight: 350 });
        });
        it('refuses an out-of-range font-weight', () => {
            expect(apply('font-weight', '0')).toBeNull();
            expect(apply('font-weight', '1200')).toBeNull();
        });
        it('maps the absolute keyword weights to their numeric equivalents', () => {
            expect(apply('font-weight', 'bold')).toEqual({ fontWeight: 700 });
            expect(apply('font-weight', 'normal')).toEqual({ fontWeight: 400 });
            // Case / whitespace insensitive.
            expect(apply('font-weight', '  BOLD ')).toEqual({ fontWeight: 700 });
        });
        it('refuses relative keyword weights (routes to customProperties)', () => {
            // `lighter` / `bolder` are relative to the inherited weight and have
            // no fixed numeric equivalent, so they stay in customProperties.
            expect(apply('font-weight', 'lighter')).toBeNull();
            expect(apply('font-weight', 'bolder')).toBeNull();
        });
        it('maps color', () => {
            expect(apply('color', '#222222')).toEqual({ color: '#222222' });
        });
        it('maps text-align', () => {
            expect(apply('text-align', 'center')).toEqual({ textAlign: 'center' });
        });
        it('refuses unsupported text-align', () => {
            expect(apply('text-align', 'justify')).toBeNull();
        });
    });
    describe('visibility', () => {
        it('maps visibility: hidden', () => {
            expect(apply('visibility', 'hidden')).toEqual({
                visibilityMode: 'hidden',
            });
        });
        it('maps visibility: visible', () => {
            expect(apply('visibility', 'visible')).toEqual({
                visibilityMode: 'visible',
            });
        });
        it('refuses other visibility values', () => {
            expect(apply('visibility', 'collapse')).toBeNull();
        });
    });
    describe('opacity', () => {
        it('parses a decimal', () => {
            expect(apply('opacity', '0.5')).toEqual({ opacity: 0.5 });
        });
        it('parses an integer', () => {
            expect(apply('opacity', '1')).toEqual({ opacity: 1 });
            expect(apply('opacity', '0')).toEqual({ opacity: 0 });
        });
        it('clamps above 1', () => {
            expect(apply('opacity', '1.5')).toEqual({ opacity: 1 });
        });
        it('clamps below 0', () => {
            expect(apply('opacity', '-0.2')).toEqual({ opacity: 0 });
        });
        it('refuses non-numeric values', () => {
            expect(apply('opacity', 'auto')).toBeNull();
        });
    });
    describe('position', () => {
        it('maps each typed keyword', () => {
            expect(apply('position', 'static')).toEqual({ position: 'static' });
            expect(apply('position', 'relative')).toEqual({ position: 'relative' });
            expect(apply('position', 'absolute')).toEqual({ position: 'absolute' });
            expect(apply('position', 'fixed')).toEqual({ position: 'fixed' });
            expect(apply('position', 'sticky')).toEqual({ position: 'sticky' });
        });
        it('refuses unknown position values', () => {
            expect(apply('position', 'auto')).toBeNull();
            expect(apply('position', '-webkit-sticky')).toBeNull();
        });
    });
    describe('svg paint', () => {
        it('maps `fill` to the fill field', () => {
            expect(apply('fill', '#ff0000')).toEqual({ fill: '#ff0000' });
            expect(apply('fill', 'currentColor')).toEqual({ fill: 'currentColor' });
        });
        it('maps `stroke` to the stroke field', () => {
            expect(apply('stroke', 'var(--accent)')).toEqual({ stroke: 'var(--accent)' });
        });
        it('maps `stroke-width` px to a number', () => {
            expect(apply('stroke-width', '2px')).toEqual({ strokeWidth: 2 });
            expect(apply('stroke-width', '3')).toEqual({ strokeWidth: 3 });
        });
        it('refuses empty fill/stroke and non-px stroke-width', () => {
            expect(apply('fill', '   ')).toBeNull();
            expect(apply('stroke', '')).toBeNull();
            expect(apply('stroke-width', 'thin')).toBeNull();
        });
        it('maps the --svg-fill / --svg-stroke custom props back to fill/stroke', () => {
            expect(apply('--svg-fill', '#abcdef')).toEqual({ fill: '#abcdef' });
            expect(apply('--svg-stroke', 'red')).toEqual({ stroke: 'red' });
        });
    });
});
describe('isMappedProperty', () => {
    it('returns true for a known property', () => {
        expect(isMappedProperty('background')).toBe(true);
    });
    it('returns true for the new position mapping', () => {
        expect(isMappedProperty('position')).toBe(true);
    });
    it('returns true for box-shadow (now a typed field)', () => {
        expect(isMappedProperty('box-shadow')).toBe(true);
    });
    it('returns false for an unknown property', () => {
        expect(isMappedProperty('mask-image')).toBe(false);
    });
});
describe('flex container properties (flex-controls plan)', () => {
    const apply = (prop, value) => {
        const fn = cssToScampProperty[prop];
        if (!fn)
            throw new Error(`No mapper for ${prop}`);
        return fn(value);
    };
    it('accepts all four flex-direction values', () => {
        expect(apply('flex-direction', 'row-reverse')).toEqual({ flexDirection: 'row-reverse' });
        expect(apply('flex-direction', 'column-reverse')).toEqual({ flexDirection: 'column-reverse' });
        expect(apply('flex-direction', 'diagonal')).toBeNull();
    });
    it('maps flex-wrap and refuses anything else', () => {
        expect(apply('flex-wrap', 'wrap')).toEqual({ flexWrap: 'wrap' });
        expect(apply('flex-wrap', 'wrap-reverse')).toEqual({ flexWrap: 'wrap-reverse' });
        expect(apply('flex-wrap', 'nowrap')).toEqual({ flexWrap: 'nowrap' });
        expect(apply('flex-wrap', 'yes')).toBeNull();
    });
    it('accepts baseline and the start/end spellings on align-items', () => {
        // These used to silently degrade into customProperties.
        expect(apply('align-items', 'baseline')).toEqual({ alignItems: 'baseline' });
        expect(apply('align-items', 'start')).toEqual({ alignItems: 'flex-start' });
        expect(apply('align-items', 'end')).toEqual({ alignItems: 'flex-end' });
    });
    it('accepts space-evenly on justify-content', () => {
        expect(apply('justify-content', 'space-evenly')).toEqual({ justifyContent: 'space-evenly' });
        expect(apply('justify-content', 'end')).toEqual({ justifyContent: 'flex-end' });
        expect(apply('justify-content', 'left')).toBeNull();
    });
    it('maps every align-content value, normalising start/end', () => {
        expect(apply('align-content', 'space-between')).toEqual({ alignContent: 'space-between' });
        expect(apply('align-content', 'start')).toEqual({ alignContent: 'flex-start' });
        expect(apply('align-content', 'stretch')).toEqual({ alignContent: 'stretch' });
        expect(apply('align-content', 'normal')).toEqual({ alignContent: 'normal' });
        expect(apply('align-content', 'middle')).toBeNull();
    });
});
describe('flex item properties (flex-controls plan)', () => {
    const apply = (prop, value) => {
        const fn = cssToScampProperty[prop];
        if (!fn)
            throw new Error(`No mapper for ${prop}`);
        return fn(value);
    };
    it('accepts both spellings and the flex-only values on align-self', () => {
        expect(apply('align-self', 'flex-start')).toEqual({ alignSelf: 'start' });
        expect(apply('align-self', 'flex-end')).toEqual({ alignSelf: 'end' });
        expect(apply('align-self', 'start')).toEqual({ alignSelf: 'start' });
        expect(apply('align-self', 'auto')).toEqual({ alignSelf: 'auto' });
        expect(apply('align-self', 'baseline')).toEqual({ alignSelf: 'baseline' });
        expect(apply('align-self', 'stretch')).toEqual({ alignSelf: 'stretch' });
        expect(apply('align-self', 'left')).toBeNull();
    });
    it('reads flex-grow and flex-shrink as non-negative numbers', () => {
        expect(apply('flex-grow', '1')).toEqual({ flexGrow: 1 });
        expect(apply('flex-grow', '2.5')).toEqual({ flexGrow: 2.5 });
        expect(apply('flex-shrink', '0')).toEqual({ flexShrink: 0 });
        expect(apply('flex-grow', '-1')).toBeNull();
        expect(apply('flex-shrink', 'none')).toBeNull();
    });
    it('stores flex-basis verbatim, with auto as the empty default', () => {
        expect(apply('flex-basis', '200px')).toEqual({ flexBasis: '200px' });
        expect(apply('flex-basis', 'var(--card-w)')).toEqual({ flexBasis: 'var(--card-w)' });
        expect(apply('flex-basis', 'auto')).toEqual({ flexBasis: '' });
        expect(apply('flex-basis', '')).toBeNull();
    });
    it('expands the flex shorthand into all three longhands', () => {
        expect(apply('flex', '1 1 200px')).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: '200px' });
        expect(apply('flex', 'none')).toEqual({ flexGrow: 0, flexShrink: 0, flexBasis: '' });
        expect(apply('flex', '1 1 1 1')).toBeNull();
    });
    it('reads order as an integer, negative allowed', () => {
        expect(apply('order', '2')).toEqual({ order: 2 });
        expect(apply('order', '-1')).toEqual({ order: -1 });
        expect(apply('order', '1.5')).toBeNull();
    });
    it('advertises every new property as mapped', () => {
        for (const prop of ['flex-wrap', 'align-content', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'order']) {
            expect(isMappedProperty(prop), prop).toBe(true);
        }
    });
});
describe('transform (transform section)', () => {
    const apply = (prop, value) => {
        const fn = cssToScampProperty[prop];
        if (!fn)
            throw new Error(`No mapper for ${prop}`);
        return fn(value);
    };
    it('maps transform into the typed list and refuses what it cannot represent', () => {
        expect(apply('transform', 'rotate(45deg)')).toEqual({ transforms: [{ kind: 'rotate', angle: 45 }] });
        expect(apply('transform', 'matrix(1,0,0,1,0,0)')).toBeNull();
    });
    it('stores transform-origin verbatim and refuses an empty value', () => {
        expect(apply('transform-origin', ' top left ')).toEqual({ transformOrigin: 'top left' });
        expect(apply('transform-origin', '')).toBeNull();
    });
    it('advertises both as mapped', () => {
        expect(isMappedProperty('transform')).toBe(true);
        expect(isMappedProperty('transform-origin')).toBe(true);
    });
});

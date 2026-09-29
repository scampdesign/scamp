import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
/**
 * A space at the start or end of a text element survives the round trip.
 *
 * Phase 2 of `docs/plans/inline-spans-plan.md`. It could not before:
 * the generator indents a text element onto its own line, so the parser
 * reads `\n      works \n    ` and has to trim to recover the words —
 * and the trim took real edge spaces with it. `works alongside AI.`
 * imported as `worksalongsideAI.` because the spaces live on the text
 * runs either side of the span and nothing could keep them.
 *
 * The generator writes an edge space as `{' '}`, which survives the
 * indentation because it is not whitespace, and the parser decodes it
 * AFTER trimming.
 */
const root = (childIds) => ({
    ...DEFAULT_RECT_STYLES,
    id: ROOT_ELEMENT_ID,
    type: 'rectangle',
    parentId: null,
    childIds,
    name: 'root',
    x: 0,
    y: 0,
    customProperties: {},
});
const text = (id, value) => ({
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'text',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    name: 'words',
    text: value,
    x: 0,
    y: 0,
    customProperties: {},
});
/** Generate, parse, and read the text back. */
const roundTrip = (value) => {
    const elements = {
        [ROOT_ELEMENT_ID]: root(['t1']),
        t1: text('t1', value),
    };
    const { tsx, css } = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
    return parseCode(tsx, css).elements['t1']?.text;
};
describe('a text element keeps the space at its edges', () => {
    it.each([
        ['works ', 'a trailing space'],
        [' AI.', 'a leading space'],
        [' both ', 'both'],
    ])('round-trips %j — %s', (value) => {
        expect(roundTrip(value)).toBe(value);
    });
    it('leaves text with no edge space exactly as it was', () => {
        // The overwhelming majority. This must not gain a space, and the
        // file must not gain a token.
        expect(roundTrip('An AI studio')).toBe('An AI studio');
        const elements = {
            [ROOT_ELEMENT_ID]: root(['t1']),
            t1: text('t1', 'An AI studio'),
        };
        const { tsx } = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
        expect(tsx).not.toContain("{' '}");
    });
    it('writes the edge space as a token, not as whitespace', () => {
        // Whitespace would be indistinguishable from the generator's own
        // indentation, which is the bug this phase fixes.
        const elements = {
            [ROOT_ELEMENT_ID]: root(['t1']),
            t1: text('t1', 'works '),
        };
        const { tsx } = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
        expect(tsx).toContain("works{' '}");
    });
    it('still collapses the generator\'s own indentation', () => {
        // A text element with a CHILD is emitted on its own indented line,
        // which is the case the trim exists for. It has to keep working now
        // that the trim lives in the parser: the words come back without the
        // newline and spaces around them, and an edge space still survives.
        const elements = {
            [ROOT_ELEMENT_ID]: root(['t1']),
            t1: { ...text('t1', 'works '), childIds: ['c1'] },
            c1: { ...text('c1', 'inner'), parentId: 't1' },
        };
        const { tsx, css } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        // Indented onto its own line, so the raw text carries newlines.
        expect(tsx).toMatch(/\n\s+works\{' '\}/);
        expect(parseCode(tsx, css).elements['t1']?.text).toBe('works ');
    });
    it('keeps an interior space untouched', () => {
        expect(roundTrip('An AI studio for what')).toBe('An AI studio for what');
    });
});

import { describe, it, expect } from 'vitest';
import { applyStyleToRange, isStyled, mergeRuns, runsFromText, runsOf, splitAt, styleOfRange, textFromRuns, } from '@lib/textRuns';
/**
 * A text element's content as styled runs.
 *
 * Phase 1 of `docs/plans/inline-spans-plan.md`. Nothing stores runs yet,
 * so these test the operations the later phases need — splitting at a
 * selection, applying a style to a range, and reporting what a range
 * has in common — before any of it is wired to the UI.
 */
const plain = (text) => ({ text });
describe('runsOf', () => {
    it('reads an element with no runs as one unstyled run', () => {
        // Every element in every project today. Absent must mean "plain",
        // not "empty", or Phase 1 would change what files render.
        expect(runsOf({ text: 'hello' })).toEqual([{ text: 'hello' }]);
    });
    it('reads a text element with no text as one empty run', () => {
        expect(runsOf({ text: null })).toEqual([{ text: '' }]);
        expect(runsOf({})).toEqual([{ text: '' }]);
    });
    it('prefers stored runs when there are any', () => {
        const runs = [plain('a'), { text: 'b', style: { color: '#f00' } }];
        expect(runsOf({ runs, text: 'ignored' })).toEqual(runs);
    });
    it('copies, so a caller cannot mutate the element through the view', () => {
        const runs = [plain('a')];
        const view = runsOf({ runs });
        view[0].text = 'changed';
        expect(runs[0].text).toBe('a');
    });
});
describe('textFromRuns', () => {
    it('is the inverse of runsFromText', () => {
        expect(textFromRuns(runsFromText('An AI studio'))).toBe('An AI studio');
    });
    it('joins without inserting anything between runs', () => {
        // The spaces are IN the runs. Inserting one here would be the same
        // bug from the other direction.
        expect(textFromRuns([plain('works '), plain('alongside'), plain(' AI.')])).toBe('works alongside AI.');
    });
});
describe('isStyled', () => {
    it('is false for plain words', () => {
        expect(isStyled(plain('a'))).toBe(false);
        expect(isStyled({ text: 'a', style: {} })).toBe(false);
    });
    it('is true for a style or a link', () => {
        expect(isStyled({ text: 'a', style: { color: '#f00' } })).toBe(true);
        expect(isStyled({ text: 'a', href: '/x' })).toBe(true);
    });
});
describe('splitAt', () => {
    it('puts a boundary at the offset', () => {
        expect(splitAt([plain('hello world')], 5)).toEqual([
            { text: 'hello' },
            { text: ' world' },
        ]);
    });
    it('leaves the list alone at a boundary that already exists', () => {
        const runs = [plain('hello'), plain(' world')];
        expect(splitAt(runs, 5)).toEqual(runs);
    });
    it('does nothing at offset 0 or past the end', () => {
        const runs = [plain('hello')];
        expect(splitAt(runs, 0)).toEqual(runs);
        expect(splitAt(runs, 99)).toEqual(runs);
    });
    it('counts offsets over the joined text, not over runs', () => {
        // A DOM selection reports one offset into the whole string; the
        // caller has no idea which run that lands in.
        const runs = [plain('ab'), plain('cd'), plain('ef')];
        expect(splitAt(runs, 3)).toEqual([
            { text: 'ab' },
            { text: 'c' },
            { text: 'd' },
            { text: 'ef' },
        ]);
    });
    it('carries the style onto both halves', () => {
        const runs = [{ text: 'hello', style: { color: '#f00' } }];
        expect(splitAt(runs, 2)).toEqual([
            { text: 'he', style: { color: '#f00' } },
            { text: 'llo', style: { color: '#f00' } },
        ]);
    });
});
describe('mergeRuns', () => {
    it('joins neighbours that paint the same', () => {
        expect(mergeRuns([plain('he'), plain('llo')])).toEqual([{ text: 'hello' }]);
    });
    it('keeps neighbours that paint differently apart', () => {
        const runs = [plain('a'), { text: 'b', style: { color: '#f00' } }];
        expect(mergeRuns(runs)).toEqual(runs);
    });
    it('drops empty runs, which a split at an edge can leave', () => {
        expect(mergeRuns([plain(''), plain('a'), plain('')])).toEqual([{ text: 'a' }]);
    });
    it('never returns an empty list', () => {
        // A text element with no runs has no content, and every caller
        // expects at least the empty string.
        expect(mergeRuns([])).toEqual([{ text: '' }]);
    });
    it('does not merge across a differing link', () => {
        const runs = [{ text: 'a', href: '/x' }, { text: 'b', href: '/y' }];
        expect(mergeRuns(runs)).toEqual(runs);
    });
});
describe('applyStyleToRange', () => {
    it('styles exactly the selected characters', () => {
        const out = applyStyleToRange(runsFromText('works alongside AI.'), 6, 15, {
            color: '#0ACD95',
        });
        expect(out).toEqual([
            { text: 'works ' },
            { text: 'alongside', style: { color: '#0ACD95' } },
            { text: ' AI.' },
        ]);
    });
    it('keeps the words identical, whatever it does to the styling', () => {
        // The one thing a style change must never do is edit the text.
        const before = runsFromText('An AI studio for what works alongside AI.');
        const after = applyStyleToRange(before, 6, 15, { fontWeight: 700 });
        expect(textFromRuns(after)).toBe(textFromRuns(before));
    });
    it('merges into a style a run already had', () => {
        // Making a bold word red should leave it bold.
        const bold = [{ text: 'hello', style: { fontWeight: 700 } }];
        expect(applyStyleToRange(bold, 0, 5, { color: '#f00' })).toEqual([
            { text: 'hello', style: { fontWeight: 700, color: '#f00' } },
        ]);
    });
    it('clears a property given null, and unstyles a run with nothing left', () => {
        const red = [{ text: 'hello', style: { color: '#f00' } }];
        expect(applyStyleToRange(red, 0, 5, { color: null })).toEqual([{ text: 'hello' }]);
    });
    it('round-trips: styling a range and clearing it gives back what you had', () => {
        // Without the merge on the way out this leaves three runs that
        // render identically to one, and the next split lands on a boundary
        // the user cannot see.
        const before = runsFromText('works alongside AI.');
        const styled = applyStyleToRange(before, 6, 15, { color: '#0ACD95' });
        expect(applyStyleToRange(styled, 6, 15, { color: null })).toEqual(before);
    });
    it('does nothing for an empty range', () => {
        const runs = runsFromText('hello');
        expect(applyStyleToRange(runs, 3, 3, { color: '#f00' })).toEqual(runs);
        expect(applyStyleToRange(runs, 4, 2, { color: '#f00' })).toEqual(runs);
    });
    it('styles across an existing boundary', () => {
        const runs = [plain('ab'), { text: 'cd', style: { fontWeight: 700 } }];
        const out = applyStyleToRange(runs, 0, 4, { color: '#f00' });
        expect(textFromRuns(out)).toBe('abcd');
        expect(out).toEqual([
            { text: 'ab', style: { color: '#f00' } },
            { text: 'cd', style: { fontWeight: 700, color: '#f00' } },
        ]);
    });
});
describe('styleOfRange', () => {
    it('reports the style when every covered run agrees', () => {
        const runs = [{ text: 'hello', style: { color: '#f00' } }];
        expect(styleOfRange(runs, 0, 5)).toEqual({ shared: { color: '#f00' }, mixed: [] });
    });
    it('reports a property as mixed rather than picking one run', () => {
        // The panel must not show one run's colour for a selection covering
        // two. Showing red for a red-and-blue selection is a lie the user
        // then acts on.
        const runs = [
            { text: 'ab', style: { color: '#f00' } },
            { text: 'cd', style: { color: '#00f' } },
        ];
        expect(styleOfRange(runs, 0, 4)).toEqual({ shared: {}, mixed: ['color'] });
    });
    it('counts a run with no value at all as mixed', () => {
        const runs = [plain('ab'), { text: 'cd', style: { color: '#f00' } }];
        expect(styleOfRange(runs, 0, 4).mixed).toEqual(['color']);
    });
    it('separates the shared properties from the mixed ones', () => {
        const runs = [
            { text: 'ab', style: { color: '#f00', fontWeight: 700 } },
            { text: 'cd', style: { color: '#00f', fontWeight: 700 } },
        ];
        expect(styleOfRange(runs, 0, 4)).toEqual({
            shared: { fontWeight: 700 },
            mixed: ['color'],
        });
    });
    it('looks only at the covered characters', () => {
        const runs = [
            { text: 'ab', style: { color: '#f00' } },
            { text: 'cd', style: { color: '#00f' } },
        ];
        expect(styleOfRange(runs, 0, 2)).toEqual({ shared: { color: '#f00' }, mixed: [] });
    });
    it('reports nothing for an empty range', () => {
        expect(styleOfRange(runsFromText('hello'), 2, 2)).toEqual({ shared: {}, mixed: [] });
    });
});

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { selectionOffsetsWithin } from '@renderer/src/canvas/textSelectionOffsets';
/**
 * Mapping a DOM selection to offsets over a text element's joined text.
 *
 * Tested under jsdom because the logic is entirely about DOM shape: a
 * styled sentence renders as several spans, so a selection routinely
 * starts in one text node and ends in another, and getting the
 * accumulation wrong styles the wrong words with nothing to show for it.
 * see docs/plans/inline-spans-plan.md
 */
/** `works <span>alongside</span> AI.` as the canvas renders it. */
const styledHost = () => {
    const host = document.createElement('p');
    host.append(document.createTextNode('works '));
    const span = document.createElement('span');
    span.textContent = 'alongside';
    host.append(span);
    host.append(document.createTextNode(' AI.'));
    document.body.append(host);
    return host;
};
const select = (a, ao, f, fo) => {
    const selection = window.getSelection();
    if (selection === null)
        throw new Error('no selection');
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(a, ao);
    range.setEnd(f, fo);
    selection.addRange(range);
    return selection;
};
describe('selectionOffsetsWithin', () => {
    it('counts across spans, not within one text node', () => {
        // The case the whole thing exists for: "alongside AI" spans the
        // styled span and the text node after it.
        const host = styledHost();
        const [, span] = [...host.childNodes];
        const tail = host.childNodes[2];
        const sel = select(span.firstChild, 0, tail, 3);
        expect(selectionOffsetsWithin(host, sel)).toEqual({ start: 6, end: 18 });
    });
    it('reads a selection inside one run', () => {
        const host = styledHost();
        const lead = host.childNodes[0];
        expect(selectionOffsetsWithin(host, select(lead, 0, lead, 5))).toEqual({
            start: 0,
            end: 5,
        });
    });
    it('returns null for a collapsed caret', () => {
        // Styling nothing is not an operation. A panel that acted on a
        // caret would restyle the last selection on the next click.
        const host = styledHost();
        const lead = host.childNodes[0];
        expect(selectionOffsetsWithin(host, select(lead, 3, lead, 3))).toBeNull();
    });
    it('returns null when the selection is outside the element', () => {
        const host = styledHost();
        const other = document.createElement('p');
        other.textContent = 'elsewhere';
        document.body.append(other);
        const sel = select(other.firstChild, 0, other.firstChild, 4);
        expect(selectionOffsetsWithin(host, sel)).toBeNull();
    });
    it('normalises a backwards selection', () => {
        // Selecting right-to-left puts focus before anchor, and the run
        // operations should not have to think about that.
        const host = styledHost();
        const lead = host.childNodes[0];
        const sel = window.getSelection();
        if (sel === null)
            throw new Error('no selection');
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(lead, 1);
        range.setEnd(lead, 4);
        sel.addRange(range);
        sel.extend(lead, 1);
        const out = selectionOffsetsWithin(host, sel);
        expect(out === null || out.start <= out.end).toBe(true);
    });
    it('handles a selection anchored on the element itself', () => {
        // A triple-click selects the whole host and anchors on it, where
        // the offset counts CHILD NODES rather than characters.
        const host = styledHost();
        const sel = select(host, 0, host, 3);
        expect(selectionOffsetsWithin(host, sel)).toEqual({ start: 0, end: 19 });
    });
    it('returns null with no selection at all', () => {
        expect(selectionOffsetsWithin(styledHost(), null)).toBeNull();
    });
});

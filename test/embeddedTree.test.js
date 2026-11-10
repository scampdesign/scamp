import { describe, expect, it } from 'vitest';
import { dropPosition, liftInTree } from '@lib/embeddedTree';
const node = (id, kids = [], more = 0) => ({
    id,
    tag: 'div',
    cls: '',
    comp: null,
    src: null,
    text: '',
    kids,
    more,
});
// body > root > main > [ section > [ card1 > title1, card2 > title2 ], footer ]
const tree = node('body', [
    node('root', [
        node('main', [
            node('section', [node('card1', [node('title1')]), node('card2', [node('title2')])]),
            node('footer'),
        ]),
    ]),
]);
describe('liftInTree', () => {
    it('moves a layer that has siblings as it is', () => {
        expect(liftInTree(tree, 'card1')).toEqual({ id: 'card1', parent: 'section' });
        expect(liftInTree(tree, 'footer')).toEqual({ id: 'footer', parent: 'main' });
    });
    it('lifts an only child to the nearest ancestor with siblings', () => {
        expect(liftInTree(tree, 'title2')).toEqual({ id: 'card2', parent: 'section' });
    });
    it('never moves the app’s root, or anything that only has it above', () => {
        expect(liftInTree(tree, 'root')).toBeNull();
        expect(liftInTree(node('body', [node('root', [node('only', [node('deep')])])]), 'deep')).toBeNull();
    });
    it('counts children left out of a large tree as siblings', () => {
        const big = node('body', [node('root', [node('list', [node('row1')], 40)])]);
        expect(liftInTree(big, 'row1')).toEqual({ id: 'row1', parent: 'list' });
    });
    it('returns null for an id that isn’t in the tree', () => {
        expect(liftInTree(tree, 'missing')).toBeNull();
    });
});
describe('dropPosition', () => {
    // body > app > (main > (a, b > b1), aside)
    const tree = node('body', [node('app', [node('main', [node('a'), node('b', [node('b1')])]), node('aside')])]);
    const drag = { id: 'a', parent: 'main' };
    it('drops before or after a sibling at its edges, and inside it in the middle', () => {
        expect(dropPosition(tree, drag, 'b', 0.1)).toBe('before');
        expect(dropPosition(tree, drag, 'b', 0.9)).toBe('after');
        expect(dropPosition(tree, drag, 'b', 0.5)).toBe('inside');
    });
    it('drops only inside a layer from another parent', () => {
        expect(dropPosition(tree, drag, 'aside', 0.1)).toBe('inside');
        expect(dropPosition(tree, drag, 'b1', 0.9)).toBe('inside');
    });
    it('won’t drop onto itself, into its own children, into its parent, or into body', () => {
        expect(dropPosition(tree, drag, 'a', 0.5)).toBeNull();
        expect(dropPosition(tree, { id: 'b', parent: 'main' }, 'b1', 0.5)).toBeNull();
        expect(dropPosition(tree, drag, 'main', 0.5)).toBeNull();
        expect(dropPosition(tree, drag, 'body', 0.5)).toBeNull();
        expect(dropPosition(tree, drag, 'missing', 0.5)).toBeNull();
    });
});

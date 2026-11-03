import { describe, expect, it } from 'vitest';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { STAND_IN_ID, declarationMap, standInTree, styleChanges } from '@lib/embeddedStandIn';
const input = (patch = {}) => ({
    computed: {
        display: 'block',
        position: 'static',
        width: '320px',
        height: '48px',
        'padding-top': '16px',
        'padding-right': '16px',
        'padding-bottom': '16px',
        'padding-left': '16px',
        'background-color': 'rgb(255, 255, 255)',
        ...patch,
    },
    parentDisplay: 'block',
    textOnly: false,
    tag: 'section',
    text: '',
});
const edited = (tree, patch) => {
    const el = tree[STAND_IN_ID];
    if (el === undefined)
        throw new Error('no stand-in');
    return { ...tree, [STAND_IN_ID]: { ...el, ...patch } };
};
describe('standInTree', () => {
    it('builds a root and the selected element from the page’s computed styles', () => {
        const tree = standInTree(input());
        const el = tree[STAND_IN_ID];
        expect(tree[ROOT_ELEMENT_ID]?.childIds).toEqual([STAND_IN_ID]);
        expect(el?.tag).toBe('section');
        expect(el?.padding).toEqual([16, 16, 16, 16]);
        expect(el?.widthMode).toBe('fixed');
        expect(el?.widthValue).toBe(320);
        expect(el?.position).toBe('static');
    });
    it('makes a text-only element a text element, carrying its text', () => {
        const el = standInTree({ ...input(), textOnly: true, text: 'Hello' })[STAND_IN_ID];
        expect(el?.type).toBe('text');
        expect(el?.text).toBe('Hello');
    });
    it('gives the root the parent’s display, so a flex child reads as one', () => {
        expect(standInTree({ ...input(), parentDisplay: 'flex' })[ROOT_ELEMENT_ID]?.display).toBe('flex');
    });
});
describe('styleChanges', () => {
    it('reports nothing for an untouched element', () => {
        const tree = standInTree(input());
        expect(styleChanges(tree, tree)).toEqual([]);
    });
    it('reports a changed property with its value before and after', () => {
        const tree = standInTree(input());
        expect(styleChanges(tree, edited(tree, { padding: [24, 24, 24, 24] }))).toEqual([{ property: 'padding', from: '16px', to: '24px' }]);
    });
    it('states the default when an edit returns a property to it, since Scamp omits defaults', () => {
        const tree = standInTree(input());
        expect(styleChanges(tree, edited(tree, { padding: [0, 0, 0, 0] }))).toEqual([{ property: 'padding', from: '16px', to: '0px' }]);
    });
    it('reports a property the element didn’t have, from nothing', () => {
        const tree = standInTree(input());
        const [change] = styleChanges(tree, edited(tree, { borderRadius: [8, 8, 8, 8] }));
        expect(change).toEqual({ property: 'border-radius', from: '', to: '8px' });
    });
    it('is empty when the stand-in is missing', () => {
        expect(styleChanges({}, {})).toEqual([]);
    });
});
describe('declarationMap', () => {
    it('reads declarations, skipping commented-out groups and malformed lines', () => {
        expect([...declarationMap(['padding: 16px;', '/* color: red; */', 'nonsense', '  width: 10px  '])]).toEqual([
            ['padding', '16px'],
            ['width', '10px'],
        ]);
    });
});

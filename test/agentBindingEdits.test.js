import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { renameList, setShow } from '@lib/agentEdits';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
/**
 * The agent's binding edits: a show condition, and renaming a list.
 * see docs/plans/react-import-plan.md, docs/notes/view-bindings.md
 */
const el = (overrides) => ({
    ...DEFAULT_RECT_STYLES,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    customProperties: {},
    ...overrides,
});
const ctx = () => ({
    rootId: ROOT_ELEMENT_ID,
    breakpoints: [],
    isComponent: true,
    elements: {
        [ROOT_ELEMENT_ID]: el({
            id: ROOT_ELEMENT_ID,
            parentId: null,
            childIds: ['badge', 'list'],
            samples: { items: [{ text: 'Ada', text2: 'MD' }, { text: 'Grace', text2: 'DO' }] },
        }),
        badge: el({ id: 'badge', type: 'text', tag: 'span', text: 'Overdue', name: 'badge' }),
        list: el({ id: 'list', tag: 'ul', childIds: ['row'] }),
        row: el({ id: 'row', parentId: 'list', tag: 'li', childIds: ['name', 'kind'], repeat: { over: 'items', as: 'item', key: 'text' } }),
        name: el({ id: 'name', parentId: 'row', type: 'text', tag: 'strong', prop: 'item.text' }),
        kind: el({ id: 'kind', parentId: 'row', type: 'text', tag: 'span', prop: 'item.text2', bind: { title: 'item.text2' } }),
    },
});
describe('setShow', () => {
    it('puts a condition on an element, with its sample on the root', () => {
        const result = setShow(ctx(), { element: 'badge', flag: 'isOverdue' });
        if (!result.ok)
            throw new Error(result.error);
        expect(result.elements['badge']?.showIf).toBe('isOverdue');
        expect(result.elements[ROOT_ELEMENT_ID]?.samples?.['isOverdue']).toBe(true);
    });
    it('stores the flag’s own value for a negated condition', () => {
        const result = setShow(ctx(), { element: 'badge', flag: '!isEmpty', shown: true });
        if (!result.ok)
            throw new Error(result.error);
        expect(result.elements[ROOT_ELEMENT_ID]?.samples?.['isEmpty']).toBe(false);
    });
    it('removes a condition with an empty flag', () => {
        const first = setShow(ctx(), { element: 'badge', flag: 'isOverdue' });
        if (!first.ok)
            throw new Error(first.error);
        const second = setShow({ ...ctx(), elements: first.elements }, { element: 'badge', flag: '' });
        if (!second.ok)
            throw new Error(second.error);
        expect(second.elements['badge']?.showIf).toBeUndefined();
    });
    it('refuses the root, a bad name, and a name a list already has', () => {
        expect(setShow(ctx(), { element: 'root', flag: 'x' })).toMatchObject({ ok: false });
        expect(setShow(ctx(), { element: 'badge', flag: 'Is Overdue' })).toMatchObject({ ok: false });
        expect(setShow(ctx(), { element: 'badge', flag: 'items' })).toMatchObject({ ok: false });
        expect(setShow(ctx(), { element: 'nope', flag: 'x' })).toMatchObject({ ok: false });
    });
});
describe('renameList', () => {
    const renamed = () => {
        const result = renameList(ctx(), { list: 'items', to: 'providers', row: 'provider', fields: { text: 'name', text2: 'kind' } });
        if (!result.ok)
            throw new Error(result.error);
        return result.elements;
    };
    it('renames the list, its row, and its key', () => {
        expect(renamed()['row']?.repeat).toEqual({ over: 'providers', as: 'provider', key: 'name' });
    });
    it('renames every row path beneath it, text and bound attributes', () => {
        const elements = renamed();
        expect(elements['name']?.prop).toBe('provider.name');
        expect(elements['kind']?.prop).toBe('provider.kind');
        expect(elements['kind']?.bind).toEqual({ title: 'provider.kind' });
    });
    it('moves the sample rows to the new name, with the new field names', () => {
        expect(renamed()[ROOT_ELEMENT_ID]?.samples).toEqual({
            providers: [{ name: 'Ada', kind: 'MD' }, { name: 'Grace', kind: 'DO' }],
        });
    });
    it('refuses a list that isn’t there, a field the rows don’t have, and a bad name', () => {
        expect(renameList(ctx(), { list: 'nope', to: 'x' })).toMatchObject({ ok: false });
        expect(renameList(ctx(), { list: 'items', fields: { missing: 'x' } })).toMatchObject({ ok: false });
        expect(renameList(ctx(), { list: 'items', to: 'Bad Name' })).toMatchObject({ ok: false });
    });
    it('writes a file that reads back the same', () => {
        const elements = renamed();
        const once = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'V', cssModuleImportName: 'V', isComponent: true });
        expect(once.tsx).toContain('providers.map((provider) =>');
        const parsed = parseCode(once.tsx, once.css, { isComponent: true });
        const twice = generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: 'V', cssModuleImportName: 'V', isComponent: true });
        expect(twice).toEqual(once);
    });
});

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { reduceCapture } from '@lib/importReduce';
import { describeReactFinding, planReactComponents } from '@lib/reactComponents';
/**
 * Finding a React app's components across its imported views.
 * see docs/plans/react-import-plan.md
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
const owners = (...list) => ({
    owners: list.map(([name, id]) => ({ name, id })),
});
/**
 * One route of a small app: a `Shell` (nav of three items, the active one
 * highlighted, and a `main` the page goes in) around a `Page` card.
 */
const route = (name, title, active, prefix) => {
    const id = (s) => `${prefix}${s}`;
    const items = ['Home', 'About', 'Team'].map((label, i) => el({
        id: id(`i${i}`),
        parentId: id('nav'),
        type: 'text',
        tag: 'button',
        text: label,
        name: 'nav_item',
        ...(i === active ? { backgroundColor: '#dbe8f6' } : {}),
    }));
    const elements = {
        [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: [id('shell')] }),
        [id('shell')]: el({ id: id('shell'), childIds: [id('nav'), id('main')], name: 'shell' }),
        [id('nav')]: el({ id: id('nav'), parentId: id('shell'), tag: 'nav', childIds: items.map((i) => i.id), name: 'nav' }),
        ...Object.fromEntries(items.map((i) => [i.id, i])),
        [id('main')]: el({ id: id('main'), parentId: id('shell'), tag: 'main', childIds: [id('card')], name: 'main' }),
        [id('card')]: el({ id: id('card'), parentId: id('main'), tag: 'section', childIds: [id('h1')], name: 'card' }),
        [id('h1')]: el({ id: id('h1'), parentId: id('card'), type: 'text', tag: 'h1', text: title }),
    };
    const react = {
        [id('shell')]: owners(['Shell', 1]),
        [id('nav')]: owners(['Shell', 1]),
        [id('i0')]: owners(['NavItem', 2], ['Shell', 1]),
        [id('i1')]: owners(['NavItem', 3], ['Shell', 1]),
        [id('i2')]: owners(['NavItem', 4], ['Shell', 1]),
        [id('main')]: owners(['Shell', 1]),
        [id('card')]: owners(['Page', 5]),
        // The heading's words were lifted: no annotation of their own.
    };
    return {
        name,
        elements,
        rootId: ROOT_ELEMENT_ID,
        react,
        instances: {
            '1': { name: 'Shell', props: {} },
            '2': { name: 'NavItem', props: { label: 'Home' } },
            '3': { name: 'NavItem', props: { label: 'About' } },
            '4': { name: 'NavItem', props: { label: 'Team' } },
            '5': { name: 'Page', props: { title } },
        },
    };
};
describe('planReactComponents', () => {
    const plan = planReactComponents([route('Home', 'Welcome home', 0, 'a'), route('About', 'About us', 1, 'b'), route('Team', 'The team', 2, 'c')]);
    it('makes one component of a shell every view draws', () => {
        expect(plan.components.map((c) => c.name)).toEqual(['Shell']);
        expect(plan.components[0]).toMatchObject({ instances: 3, views: ['Home', 'About', 'Team'] });
    });
    it('puts an instance where each copy was, with the page’s own content inside it', () => {
        const view = plan.views[1];
        const root = view.elements[ROOT_ELEMENT_ID];
        const instance = view.elements[root.childIds[0]];
        expect(instance).toMatchObject({ type: 'component-instance', componentName: 'Shell', childIds: ['bcard'] });
        expect(view.elements['bcard']?.parentId).toBe(instance.id);
        expect(view.elements['bnav']).toBeUndefined();
        expect(view.elements['bh1']?.text).toBe('About us');
    });
    it('marks where the page’s content goes as a slot, and leaves the content out', () => {
        const def = plan.components[0].elements;
        const main = Object.values(def).find((e) => e.name === 'main');
        expect(main).toMatchObject({ slot: 'children', childIds: [] });
        expect(Object.values(def).some((e) => e.name === 'card')).toBe(false);
        expect(def[ROOT_ELEMENT_ID]).toMatchObject({ parentId: null, name: undefined });
    });
    it('shows the commonest look where copies differ, and says which elements', () => {
        // Each nav item is highlighted in one view of three, so plain wins.
        const items = Object.values(plan.components[0].elements).filter((e) => e.name === 'nav_item');
        expect(items).toHaveLength(3);
        expect(items.every((i) => i.backgroundColor !== '#dbe8f6')).toBe(true);
        expect(plan.findings).toContainEqual({ component: 'Shell', kind: 'style-varies', detail: 'nav_item, nav_item, nav_item' });
    });
    it('lets the content size a box whose size differs by page, and keeps one every page shares', () => {
        const sized = (view, height) => ({
            ...view,
            elements: Object.fromEntries(Object.entries(view.elements).map(([id, e]) => [
                id,
                e.name === 'shell'
                    ? { ...e, heightMode: 'fixed', heightValue: height, widthMode: 'fixed', widthValue: 1440 }
                    : e,
            ])),
        });
        const tall = planReactComponents([
            sized(route('Home', 'x', 0, 'a'), 900),
            sized(route('About', 'y', 0, 'b'), 1400),
            sized(route('Team', 'z', 0, 'c'), 900),
        ]);
        const root = tall.components[0].elements[ROOT_ELEMENT_ID];
        // The height is the page's; the width every page shares is the shell's.
        expect(root).toMatchObject({ heightMode: 'auto', widthMode: 'fixed', widthValue: 1440 });
        // A size that differs isn't a different look.
        expect(tall.findings.filter((f) => f.kind === 'style-varies')).toEqual([]);
    });
    it('makes a component of the copies that agree, and leaves the one laid out differently', () => {
        const relaid = (view) => ({
            ...view,
            elements: Object.fromEntries(Object.entries(view.elements).map(([id, e]) => [id, e.name === 'nav' ? { ...e, display: 'grid' } : e])),
        });
        const plan = planReactComponents([route('Home', 'x', 0, 'a'), route('About', 'y', 1, 'b'), relaid(route('Team', 'z', 2, 'c'))]);
        expect(plan.components[0]).toMatchObject({ name: 'Shell', instances: 2, views: ['Home', 'About'] });
        expect(plan.views[2].elements['cnav']).toBeDefined();
        expect(plan.findings).toContainEqual({ component: 'Shell', kind: 'too-different', detail: '1 of 3 copies (display on nav)' });
    });
    it('leaves a component drawn only once as it is', () => {
        const single = planReactComponents([route('Home', 'Welcome home', 0, 'a')]);
        expect(single.components).toEqual([]);
        expect(single.views[0].elements['ashell']).toBeDefined();
    });
    it('names a component that collides with a view or component already there', () => {
        const named = planReactComponents([route('Home', 'x', 0, 'a'), route('About', 'y', 0, 'b')], { takenNames: ['Shell'] });
        expect(named.components[0]?.name).toBe('Shell2');
    });
});
describe('planReactComponents — text props', () => {
    /** A `Card` drawn twice in one view, with different titles. */
    const cards = () => {
        const card = (n, title) => ({
            [`c${n}`]: el({ id: `c${n}`, childIds: [`t${n}`, `b${n}`], name: 'card' }),
            [`t${n}`]: el({ id: `t${n}`, parentId: `c${n}`, type: 'text', tag: 'h2', text: title }),
            [`b${n}`]: el({ id: `b${n}`, parentId: `c${n}`, type: 'text', tag: 'p', text: 'Same body' }),
        });
        return {
            name: 'Cards',
            rootId: ROOT_ELEMENT_ID,
            elements: {
                [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['c1', 'c2'] }),
                ...card(1, 'First'),
                ...card(2, 'Second'),
            },
            react: {
                c1: owners(['Card', 1]),
                t1: owners(['Card', 1]),
                b1: owners(['Card', 1]),
                c2: owners(['Card', 2]),
                t2: owners(['Card', 2]),
                b2: owners(['Card', 2]),
            },
            instances: { '1': { name: 'Card', props: { title: 'First' } }, '2': { name: 'Card', props: { title: 'Second' } } },
        };
    };
    it('makes text that differs a prop, named after the React prop that held it', () => {
        const plan = planReactComponents([cards()]);
        const def = plan.components[0];
        expect(def.props).toEqual(['title']);
        const heading = Object.values(def.elements).find((e) => e.tag === 'h2');
        expect(heading).toMatchObject({ prop: 'title', text: 'First' });
        // Text every copy shares stays in the definition.
        expect(Object.values(def.elements).find((e) => e.tag === 'p')).toMatchObject({ text: 'Same body' });
        expect(def.elements[ROOT_ELEMENT_ID]?.prop).toBeUndefined();
    });
    it('gives each instance its own text where it differs from the default', () => {
        const plan = planReactComponents([cards()]);
        const instances = Object.values(plan.views[0].elements).filter((e) => e.type === 'component-instance');
        expect(instances.map((i) => i.propOverrides)).toEqual([{}, { title: 'Second' }]);
    });
    it('calls a prop `text` when no React prop held the words', () => {
        const view = cards();
        const plan = planReactComponents([{ ...view, instances: { '1': { name: 'Card', props: {} }, '2': { name: 'Card', props: {} } } }]);
        expect(plan.components[0]?.props).toEqual(['text']);
    });
});
describe('planReactComponents — what stays as it is', () => {
    it('leaves copies alone when they differ in layout, not just paint', () => {
        const view = (n, display) => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
            `e${n}${i}`,
            el({
                id: `e${n}${i}`,
                parentId: i === 0 ? ROOT_ELEMENT_ID : `e${n}0`,
                childIds: i === 0 ? Array.from({ length: 5 }, (_x, j) => `e${n}${j + 1}`) : [],
                display,
            }),
        ]));
        const elements = {
            [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['e10', 'e20'] }),
            ...view(1, 'flex'),
            ...view(2, 'grid'),
        };
        const react = Object.fromEntries(Object.keys(elements)
            .filter((id) => id !== ROOT_ELEMENT_ID)
            .map((id) => [id, owners(['Tile', id.startsWith('e1') ? 1 : 2])]));
        const plan = planReactComponents([
            { name: 'Tiles', elements, rootId: ROOT_ELEMENT_ID, react, instances: { '1': { name: 'Tile', props: {} }, '2': { name: 'Tile', props: {} } } },
        ]);
        expect(plan.components).toEqual([]);
        expect(plan.findings).toContainEqual({
            component: 'Tile',
            kind: 'too-different',
            detail: '1 of 2 copies (display on rectangle_e10; display on rectangle_e11)',
        });
    });
    it('leaves a component whose page content sits beside its own elements, which a slot can’t hold', () => {
        // The shell's main holds its own heading as well as the page's card.
        const mixed = (view) => {
            const prefix = view.name === 'Home' ? 'a' : 'b';
            const heading = el({ id: `${prefix}hd`, parentId: `${prefix}main`, type: 'text', tag: 'h2', text: 'Section' });
            const main = view.elements[`${prefix}main`];
            return {
                ...view,
                elements: { ...view.elements, [heading.id]: heading, [main.id]: { ...main, childIds: [heading.id, ...main.childIds] } },
                react: { ...view.react, [heading.id]: owners(['Shell', 1]) },
            };
        };
        const plan = planReactComponents([mixed(route('Home', 'x', 0, 'a')), mixed(route('About', 'y', 0, 'b'))]);
        expect(plan.components.map((c) => c.name)).not.toContain('Shell');
        expect(plan.findings).toContainEqual({ component: 'Shell', kind: 'slots', detail: 'a place it shares with its own elements' });
    });
    it('reports a component with more than one top-level element, and leaves it', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['a', 'b'] }),
            a: el({ id: 'a' }),
            b: el({ id: 'b' }),
        };
        const plan = planReactComponents([
            { name: 'V', elements, rootId: ROOT_ELEMENT_ID, react: { a: owners(['Pair', 1]), b: owners(['Pair', 1]) }, instances: {} },
        ]);
        expect(plan.components).toEqual([]);
        expect(plan.findings).toContainEqual({ component: 'Pair', kind: 'fragment', detail: '1 copy' });
    });
    it('changes nothing in a view with no React annotations', () => {
        const plain = route('Home', 'x', 0, 'a');
        const plan = planReactComponents([{ ...plain, react: {} }, { ...route('About', 'y', 1, 'b'), react: {} }]);
        expect(plan.components).toEqual([]);
        expect(plan.views[0].elements).toEqual(plain.elements);
    });
});
describe('describeReactFinding', () => {
    it('says what a look that varies by page costs', () => {
        expect(describeReactFinding({ component: 'Shell', kind: 'style-varies', detail: 'nav_item' })).toBe('Shell looks different on some pages (nav_item); the component shows its most common look');
    });
    it('says why copies stayed as elements', () => {
        expect(describeReactFinding({ component: 'Row', kind: 'too-different', detail: '2 of 9 copies' })).toBe('2 of 9 copies of Row differ in layout from the rest, so they stay as separate elements');
        expect(describeReactFinding({ component: 'Pair', kind: 'fragment', detail: '1 copy' })).toContain('more than one top-level element');
        expect(describeReactFinding({ component: 'Frame', kind: 'slots', detail: '2 places' })).toContain('2 places');
        expect(describeReactFinding({ component: 'Frame', kind: 'slots', detail: '2 places' })).toContain('stays as elements');
        expect(describeReactFinding({ component: 'Shell', kind: 'nested', detail: '3 copies' })).toContain('components inside components');
    });
});
describe('against a React app captured from a real browser', () => {
    // test/fixtures/import/pages/react-app.html: a Shell with two NavItems
    // and a main holding two Cards, rendered by React in development.
    const payload = JSON.parse(readFileSync('test/fixtures/import/payloads/react-app.json', 'utf-8'));
    const reduced = reduceCapture(payload, {
        randomId: (() => {
            let n = 0;
            return () => (++n).toString(16).padStart(4, '0');
        })(),
    });
    const byNode = new Map();
    const walk = (node) => {
        if (node.react !== undefined)
            byNode.set(node.id, node.react);
        node.children.forEach(walk);
    };
    walk(payload.root);
    const react = Object.fromEntries(Object.entries(reduced.sourceNodes).flatMap(([id, nodeId]) => {
        const info = byNode.get(nodeId);
        return info === undefined ? [] : [[id, info]];
    }));
    const view = {
        name: 'Home',
        elements: reduced.elements,
        rootId: reduced.rootId,
        react,
        instances: payload.react?.instances ?? {},
    };
    it('records which component drew each element, nearest first', () => {
        const nav = Object.entries(reduced.elements).find(([, e]) => e.tag === 'nav')?.[0];
        expect(react[nav ?? '']?.owners.map((o) => o.name)).toEqual(['Shell', 'App']);
        // A Card the app passes into the Shell is the App's, not the Shell's.
        const card = Object.entries(reduced.elements).find(([, e]) => e.tag === 'section')?.[0];
        expect(react[card ?? '']?.owners.map((o) => o.name)).toEqual(['Card', 'App']);
    });
    it('records each instance’s plain props', () => {
        const cards = Object.values(payload.react?.instances ?? {}).filter((i) => i.name === 'Card');
        expect(cards.map((c) => c.props)).toEqual([{ title: 'First' }, { title: 'Second' }]);
    });
    it('makes the two Cards one component with a title prop', () => {
        const plan = planReactComponents([view]);
        expect(plan.components.map((c) => [c.name, c.instances, c.props])).toEqual([['Card', 2, ['title']]]);
        const instances = Object.values(plan.views[0].elements).filter((e) => e.type === 'component-instance');
        expect(instances.map((i) => i.propOverrides)).toEqual([{}, { title: 'Second' }]);
    });
});

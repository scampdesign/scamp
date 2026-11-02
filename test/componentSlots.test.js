import { describe, it, expect } from 'vitest';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
const makeRoot = (childIds) => ({
    ...DEFAULT_ROOT_STYLES,
    id: ROOT_ELEMENT_ID,
    type: 'rectangle',
    parentId: null,
    childIds,
    x: 0,
    y: 0,
    customProperties: {},
    inlineFragments: [],
});
const makeRect = (id, overrides) => ({
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    customProperties: {},
    inlineFragments: [],
    ...overrides,
});
const makeText = (id, overrides) => ({
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'text',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    customProperties: {},
    inlineFragments: [],
    ...overrides,
});
const gen = (elements) => generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: 'card',
    isComponent: true,
});
describe('component slots — codegen', () => {
    it('emits {children} + a React.ReactNode prop for a default slot', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['s001']),
            s001: makeRect('s001', { slot: 'children' }),
        };
        const { tsx } = gen(elements);
        expect(tsx).toContain('children?: React.ReactNode;');
        expect(tsx).toContain('{ children, className }: CardProps');
        expect(tsx).toMatch(/<div[^>]*data-scamp-id="rect_s001"[^>]*>\{children\}<\/div>/);
        // A slot has no `= default` in the destructure (it's a node, not a string).
        expect(tsx).not.toContain('children =');
    });
    it('emits two named slots as separate ReactNode props', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['s001', 's002']),
            s001: makeRect('s001', { slot: 'left' }),
            s002: makeRect('s002', { slot: 'right' }),
        };
        const { tsx } = gen(elements);
        expect(tsx).toContain('left?: React.ReactNode;');
        expect(tsx).toContain('right?: React.ReactNode;');
        expect(tsx).toContain('{ left, right, className }: CardProps');
    });
    it('lists text props before slots in the props type + signature', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['t001', 's001']),
            t001: makeText('t001', { prop: 'label', text: 'Hi' }),
            s001: makeRect('s001', { slot: 'children' }),
        };
        const { tsx } = gen(elements);
        expect(tsx).toContain('label?: string;');
        expect(tsx).toContain('children?: React.ReactNode;');
        expect(tsx).toContain('{ label = "Hi", children, className }: CardProps');
    });
    it('does not treat a slot marker as a page prop (pages emit no props type)', () => {
        const { tsx } = generateCode({
            elements: {
                [ROOT_ELEMENT_ID]: makeRoot(['s001']),
                s001: makeRect('s001', { slot: 'children' }),
            },
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
            // isComponent omitted → page mode: no {children}, no props type.
        });
        expect(tsx).not.toContain('React.ReactNode');
        expect(tsx).not.toContain('{children}');
    });
});
describe('component slots — round-trip', () => {
    it('a default slot survives generateCode → parseCode', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['s001']),
            s001: makeRect('s001', { slot: 'children' }),
        };
        const { tsx, css } = gen(elements);
        const parsed = parseCode(tsx, css);
        expect(parsed.elements['s001'].slot).toBe('children');
        // The slot marker isn't left behind as literal text.
        expect(parsed.elements['s001'].inlineFragments).toEqual([]);
    });
    it('named slots + a text prop all survive the round-trip', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['t001', 's001', 's002']),
            t001: makeText('t001', { prop: 'label', text: 'Hi' }),
            s001: makeRect('s001', { slot: 'left' }),
            s002: makeRect('s002', { slot: 'right' }),
        };
        const { tsx, css } = gen(elements);
        const parsed = parseCode(tsx, css);
        expect(parsed.elements['s001'].slot).toBe('left');
        expect(parsed.elements['s002'].slot).toBe('right');
        expect(parsed.elements['t001'].prop).toBe('label');
    });
    it('a plain rectangle with {expr} text that is NOT a declared slot stays literal', () => {
        // Guard: `{whatever}` where `whatever` isn't a ReactNode prop must not
        // be swallowed as a slot — it round-trips as verbatim source.
        const tsx = `import styles from './card.module.css';

type CardProps = {
  children?: React.ReactNode;
};

export default function Card({ children }: CardProps) {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_a1b2" className={styles.rect_a1b2}>{notASlot}</div>
      <div data-scamp-id="rect_c3d4" className={styles.rect_c3d4}>{children}</div>
    </div>
  );
}
`;
        const css = '.root {\n}\n\n.rect_a1b2 {\n}\n\n.rect_c3d4 {\n}\n';
        const parsed = parseCode(tsx, css);
        expect(parsed.elements['c3d4'].slot).toBe('children');
        expect(parsed.elements['a1b2'].slot).toBeUndefined();
    });
});
describe('component slots — Phase 2 default-slot content round-trip', () => {
    const makeInstance = (id, childIds) => ({
        ...DEFAULT_RECT_STYLES,
        id,
        type: 'component-instance',
        position: 'static',
        // `makeComponentInstance` uses auto on both axes — the instance has no
        // intrinsic size, the rendered component's root sets the box. Building
        // it from DEFAULT_RECT_STYLES alone gives it a fixed 100px size no real
        // instance has.
        widthMode: 'auto',
        heightMode: 'auto',
        parentId: ROOT_ELEMENT_ID,
        childIds,
        x: 0,
        y: 0,
        customProperties: {},
        inlineFragments: [],
        componentName: 'Card',
        instanceId: `inst_${id}`,
        propOverrides: {},
    });
    it('emits an instance with default-slot children and parses them back', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['i001']),
            i001: makeInstance('i001', ['c001']),
            c001: makeRect('c001', {
                parentId: 'i001',
                backgroundColor: '#123456',
            }),
        };
        const { tsx, css } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        // Not self-closing: the child renders between the instance tags.
        expect(tsx).toMatch(/<Card data-scamp-instance-id="inst_i001">[\s\S]*<\/Card>/);
        expect(tsx).toContain('data-scamp-id="rect_c001"');
        const parsed = parseCode(tsx, css);
        const inst = parsed.elements['i001'];
        expect(inst.type).toBe('component-instance');
        expect(inst.childIds).toContain('c001');
        expect(parsed.elements['c001'].parentId).toBe('i001');
    });
    it('an instance with no slot content still self-closes', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['i001']),
            i001: makeInstance('i001', []),
        };
        const { tsx } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        expect(tsx).toMatch(/<Card data-scamp-instance-id="inst_i001" \/>/);
    });
});
describe('component slots — slot content flows (parity with preview)', () => {
    it('slot content is not absolutely positioned', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: {
                ...DEFAULT_ROOT_STYLES,
                id: ROOT_ELEMENT_ID,
                type: 'rectangle',
                parentId: null,
                childIds: ['i001'],
                x: 0,
                y: 0,
                customProperties: {},
                inlineFragments: [],
            },
            i001: {
                ...DEFAULT_RECT_STYLES,
                id: 'i001',
                type: 'component-instance',
                position: 'static',
                widthMode: 'auto',
                heightMode: 'auto',
                parentId: ROOT_ELEMENT_ID,
                childIds: ['c001'],
                x: 0,
                y: 0,
                customProperties: {},
                inlineFragments: [],
                componentName: 'Card',
                instanceId: 'inst_i001',
                propOverrides: {},
            },
            c001: makeRect('c001', {
                parentId: 'i001',
                backgroundColor: '#123456',
            }),
        };
        const { css } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        // The slot-content rect flows inside the component's slot; it must NOT
        // be `position: absolute` or it escapes to the component root.
        expect(css).not.toMatch(/\.rect_c001\s*\{[^}]*position:\s*absolute/);
    });
});
describe('component slots — Phase 3 named slots round-trip', () => {
    const makeInstance = (id, childIds) => ({
        ...DEFAULT_RECT_STYLES,
        id,
        type: 'component-instance',
        position: 'static',
        parentId: ROOT_ELEMENT_ID,
        childIds,
        x: 0,
        y: 0,
        customProperties: {},
        inlineFragments: [],
        componentName: 'Card',
        instanceId: `inst_${id}`,
        propOverrides: {},
    });
    it('emits a named slot as `name={<…>}` and a default child as JSX children', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['i001']),
            i001: makeInstance('i001', ['cl', 'cd']),
            cl: makeRect('cl', { parentId: 'i001', slotName: 'left', backgroundColor: '#111111' }),
            cd: makeRect('cd', { parentId: 'i001', backgroundColor: '#222222' }),
        };
        const { tsx } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        expect(tsx).toMatch(/left=\{<div[^}]*data-scamp-id="rect_cl"/);
        // The default child renders as a JSX child of the instance.
        expect(tsx).toMatch(/<Card[^>]*>[\s\S]*data-scamp-id="rect_cd"[\s\S]*<\/Card>/);
    });
    it('round-trips named-slot content back onto the right slot', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['i001']),
            i001: makeInstance('i001', ['cl', 'cd']),
            cl: makeRect('cl', { parentId: 'i001', slotName: 'left', backgroundColor: '#111111' }),
            cd: makeRect('cd', { parentId: 'i001', backgroundColor: '#222222' }),
        };
        const { tsx, css } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        const parsed = parseCode(tsx, css);
        // Named-slot child carries slotName; default child does not.
        expect(parsed.elements['cl'].slotName).toBe('left');
        expect(parsed.elements['cd'].slotName).toBeUndefined();
        // Both are children of the instance, and the marker attr is gone.
        expect(parsed.elements['i001'].childIds).toEqual(expect.arrayContaining(['cl', 'cd']));
        expect(parsed.elements['cl'].attributes?.['data-scamp-slot']).toBeUndefined();
    });
});

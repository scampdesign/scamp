import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

import type { CapturedNode, CapturedReact, CapturePayload } from '@shared/importCapture';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { generateCode } from '@lib/generateCode';
import { reduceCapture } from '@lib/importReduce';
import { parseCode } from '@lib/parseCode';
import { fieldNameFrom, planRepeats, type RepeatTree } from '@lib/reactRepeats';

/**
 * A React app's `.map()` lists, as repeats.
 * see docs/plans/react-import-plan.md
 */

const el = (overrides: Partial<ScampElement> & { id: string }): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  ...overrides,
});

/** A list of people: each row an `li` with a name and a role, from one call site. */
const people = (rows: Array<{ name: string; role: string }>, look: Partial<ScampElement> = {}): RepeatTree => {
  const elements: Record<string, ScampElement> = {
    [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['ul'] }),
    ul: el({ id: 'ul', tag: 'ul', childIds: rows.map((_, i) => `li${i}`), name: 'list' }),
  };
  const react: Record<string, CapturedReact> = { ul: { owners: [{ name: 'People', id: 1 }] } };
  rows.forEach((row, i) => {
    elements[`li${i}`] = el({ id: `li${i}`, parentId: 'ul', tag: 'li', childIds: [`n${i}`, `r${i}`], name: 'person', ...(i === 1 ? look : {}) });
    elements[`n${i}`] = el({ id: `n${i}`, parentId: `li${i}`, type: 'text', tag: 'strong', text: row.name, name: 'dp_person_name' });
    elements[`r${i}`] = el({ id: `r${i}`, parentId: `li${i}`, type: 'text', tag: 'span', text: row.role, name: 'role' });
    react[`li${i}`] = { owners: [{ name: 'People', id: 1 }], site: '/src/People.tsx:12:8' };
  });
  return { elements, rootId: ROOT_ELEMENT_ID, react };
};

const ROWS = [
  { name: 'Ada', role: 'Engineer' },
  { name: 'Grace', role: 'Admiral' },
  { name: 'Linus', role: 'Engineer' },
];

describe('planRepeats', () => {
  it('makes one repeated row of siblings from one call site', () => {
    const plan = planRepeats(people(ROWS), { sources: { '/src/People.tsx:12:8': { over: 'team', as: 'member' } } });
    expect(plan.repeats).toEqual([{ over: 'team', as: 'member', rows: 3, fields: ['personName', 'role'] }]);
    expect(plan.elements['ul']?.childIds).toEqual(['li0']);
    expect(plan.elements['li0']?.repeat).toEqual({ over: 'team', as: 'member', key: 'personName' });
    expect(plan.elements['li1']).toBeUndefined();
    expect(plan.elements['n1']).toBeUndefined();
  });

  it('binds the words that differ to row fields, and puts the rows on the root', () => {
    const plan = planRepeats(people(ROWS), { sources: { '/src/People.tsx:12:8': { over: 'team', as: 'member' } } });
    expect(plan.elements['n0']).toMatchObject({ prop: 'member.personName' });
    expect(plan.elements['n0']?.text).toBeUndefined();
    expect(plan.elements[ROOT_ELEMENT_ID]?.samples).toEqual({
      team: [
        { personName: 'Ada', role: 'Engineer' },
        { personName: 'Grace', role: 'Admiral' },
        { personName: 'Linus', role: 'Engineer' },
      ],
    });
  });

  it('keeps words every row shares as they are', () => {
    const plan = planRepeats(people(ROWS.map((r) => ({ ...r, role: 'Engineer' }))));
    expect(plan.elements['r0']).toMatchObject({ text: 'Engineer' });
    expect(plan.elements['r0']?.prop).toBeUndefined();
    expect(plan.repeats[0]?.fields).toEqual(['personName']);
  });

  it('names the list after its rows when the source wasn’t read', () => {
    const plan = planRepeats(people(ROWS));
    expect(plan.repeats[0]).toMatchObject({ over: 'persons', as: 'person' });
  });

  it('numbers the rows when nothing tells them apart, and keys on the number', () => {
    const plan = planRepeats(people(ROWS.map(() => ({ name: 'Same', role: 'Engineer' }))));
    expect(plan.elements[ROOT_ELEMENT_ID]?.samples?.['persons']).toEqual([{ index: 1 }, { index: 2 }, { index: 3 }]);
    expect(plan.elements['li0']?.repeat).toEqual({ over: 'persons', as: 'person', key: 'index' });
  });

  it('leaves a list whose rows look different as copies', () => {
    const plan = planRepeats(people(ROWS, { backgroundColor: '#fde' }));
    expect(plan.repeats).toEqual([]);
    expect(plan.skipped).toEqual([{ list: 'person', rows: 3, differs: 'backgroundColor on person' }]);
    expect(plan.elements['li1']).toBeDefined();
  });

  it('lets a size that differs by row follow the content', () => {
    const tree = people(ROWS);
    tree.elements['n0'] = { ...tree.elements['n0']!, widthMode: 'fixed', widthValue: 30 };
    tree.elements['n1'] = { ...tree.elements['n1']!, widthMode: 'fixed', widthValue: 50 };
    tree.elements['n2'] = { ...tree.elements['n2']!, widthMode: 'fixed', widthValue: 40 };
    const plan = planRepeats(tree);
    expect(plan.elements['n0']?.widthMode).toBe('auto');
  });

  it('needs a sign of a list: siblings with nothing from React stay as they are', () => {
    const tree = people(ROWS);
    const plan = planRepeats({ ...tree, react: {} });
    expect(plan.repeats).toEqual([]);
  });

  it('reads keyed siblings from one owner as a list when there is no call site (React 18)', () => {
    const tree = people(ROWS);
    const react = Object.fromEntries(
      Object.entries(tree.react).map(([id, r]) => [id, id.startsWith('li') ? { owners: r.owners, key: id } : r])
    );
    expect(planRepeats({ ...tree, react }).repeats).toHaveLength(1);
  });

  it('turns a run of component instances into one, with their props as row fields', () => {
    const instance = (i: number, title: string): ScampElement =>
      el({ id: `c${i}`, parentId: 'ul', type: 'component-instance', componentName: 'Card', instanceId: `inst_c${i}`, propOverrides: { title } });
    const tree: RepeatTree = {
      rootId: ROOT_ELEMENT_ID,
      elements: {
        [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['ul'] }),
        ul: el({ id: 'ul', childIds: ['c0', 'c1'] }),
        c0: instance(0, 'First'),
        c1: instance(1, 'Second'),
      },
      react: {
        c0: { owners: [{ name: 'Card', id: 4, key: 'a' }, { name: 'App', id: 2 }] },
        c1: { owners: [{ name: 'Card', id: 5, key: 'b' }, { name: 'App', id: 2 }] },
      },
    };
    const plan = planRepeats(tree);
    expect(plan.elements['c0']).toMatchObject({
      repeat: { over: 'cards', as: 'card', key: 'title' },
      bind: { title: 'card.title' },
      propOverrides: {},
    });
    expect(plan.elements[ROOT_ELEMENT_ID]?.samples).toEqual({ cards: [{ title: 'First' }, { title: 'Second' }] });
  });
});

describe('fieldNameFrom', () => {
  it('camel-cases a layer name, dropping a short namespace', () => {
    expect(fieldNameFrom('dp_nav_label', 'text')).toBe('navLabel');
    expect(fieldNameFrom('title', 'text')).toBe('title');
  });

  it('falls back for a name that isn’t usable', () => {
    expect(fieldNameFrom(undefined, 'text')).toBe('text');
    expect(fieldNameFrom('123', 'text')).toBe('text');
    expect(fieldNameFrom('id', 'value')).toBe('value');
  });
});

describe('a planned repeat in a file', () => {
  it('writes and reads back the same: generateCode → parseCode → generateCode', () => {
    const plan = planRepeats(people(ROWS), { sources: { '/src/People.tsx:12:8': { over: 'team', as: 'member' } } });
    const once = generateCode({ elements: plan.elements, rootId: ROOT_ELEMENT_ID, pageName: 'People', cssModuleImportName: 'People', isComponent: true });
    expect(once.tsx).toContain('team.map((member) =>');
    expect(once.tsx).toContain('{member.personName}');
    const parsed = parseCode(once.tsx, once.css, { isComponent: true });
    const twice = generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: 'People', cssModuleImportName: 'People', isComponent: true });
    expect(twice).toEqual(once);
  });
});

describe('against a React app captured from a real browser', () => {
  // test/fixtures/import/pages/react-app.html: a keyed `TAGS.map(…)` list,
  // rendered by React 18, which gives keys but no call sites.
  const payload = JSON.parse(readFileSync('test/fixtures/import/payloads/react-app.json', 'utf-8')) as CapturePayload;
  const reduced = reduceCapture(payload, {
    randomId: (() => {
      let n = 0;
      return () => (++n).toString(16).padStart(4, '0');
    })(),
  });
  const byNode = new Map<number, CapturedReact>();
  const walk = (node: CapturedNode): void => {
    if (node.react !== undefined) byNode.set(node.id, node.react);
    node.children.forEach(walk);
  };
  walk(payload.root);
  const react = Object.fromEntries(
    Object.entries(reduced.sourceNodes).flatMap(([id, nodeId]) => {
      const info = byNode.get(nodeId);
      return info === undefined ? [] : [[id, info]];
    })
  );

  it('records the keys React requires on a list', () => {
    const keys = Object.values(react).flatMap((r) => (r.key === undefined ? [] : [r.key]));
    expect(keys).toEqual(['Design', 'Code', 'Ship']);
  });

  it('makes the keyed list one repeated item, its words a row field', () => {
    const plan = planRepeats({ elements: reduced.elements, rootId: reduced.rootId, react });
    // React 18 gives no call site, so no source names: the list is named
    // after its row, which the reducer calls `item`.
    expect(plan.repeats).toEqual([{ over: 'items', as: 'item', rows: 3, fields: ['item'] }]);
    expect(plan.elements[reduced.rootId]?.samples?.['items']).toEqual([{ item: 'Design' }, { item: 'Code' }, { item: 'Ship' }]);
  });
});

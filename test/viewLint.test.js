import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { parseCode } from '@lib/parseCode';
import { BIND_MARK } from '@lib/parseCode/bindings';
import { lintView } from '@lib/viewLint';
/**
 * The degradations a view can arrive with that leave the element tree
 * looking correct. Each rule gets a case that fires and a case that
 * stays quiet, because a linter that cries wolf is worse than none.
 * see docs/notes/view-lint.md
 */
const TOKENS = ['--color-ink', '--space-4', '--text-lg'];
const rect = (id, extra = {}) => ({
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    widthMode: 'auto',
    heightMode: 'auto',
    customProperties: {},
    inlineFragments: [],
    name: 'box',
    ...extra,
});
/** A one-child view. The child is what each case is about. */
const view = (child, rootExtra = {}) => ({
    [ROOT_ELEMENT_ID]: {
        ...DEFAULT_ROOT_STYLES,
        id: ROOT_ELEMENT_ID,
        type: 'rectangle',
        parentId: null,
        childIds: [child.id],
        x: 0,
        y: 0,
        customProperties: {},
        inlineFragments: [],
        minHeight: undefined,
        ...rootExtra,
    },
    [child.id]: child,
});
const lint = (elements) => lintView({ elements, rootId: ROOT_ELEMENT_ID, themeTokens: TOKENS });
const kinds = (elements) => lint(elements).map((f) => f.kind);
describe('lintView — a clean view', () => {
    it('reports nothing for a view whose every value is typed and declared', () => {
        const elements = view(rect('a1b2', {
            backgroundColor: 'var(--color-ink)',
            customProperties: { 'text-transform': 'uppercase', 'object-fit': 'cover' },
        }));
        expect(lint(elements)).toEqual([]);
    });
    it('stays quiet about properties Scamp has no control for at all', () => {
        // `aspect-ratio` and `overflow` have no typed field, so landing in
        // customProperties is correct rather than a degradation.
        const elements = view(rect('a1b2', { customProperties: { 'aspect-ratio': '4 / 5', overflow: 'hidden' } }));
        expect(lint(elements)).toEqual([]);
    });
});
describe('lintView — marker-leaked', () => {
    it('flags a typed field still holding the internal binding marker', () => {
        const elements = view(rect('a1b2', { type: 'image', src: `${BIND_MARK}product.image`, alt: `${BIND_MARK}product.name` }));
        const found = lint(elements);
        expect(found).toHaveLength(1);
        expect(found[0]?.kind).toBe('marker-leaked');
        expect(found[0]?.message).toContain('`src`, `alt`');
        expect(found[0]?.className).toBe('box_a1b2');
    });
    it('ignores a src that merely resembles the marker text', () => {
        const elements = view(rect('a1b2', { type: 'image', src: '/scamp_bind/hero.png', alt: '' }));
        expect(kinds(elements)).toEqual([]);
    });
});
describe('lintView — not-panel-editable', () => {
    it('flags a value a typed control cannot read, naming the property', () => {
        const elements = view(rect('a1b2', { customProperties: { filter: 'grayscale(100%) contrast(1.1)' } }));
        const found = lint(elements);
        expect(found).toHaveLength(1);
        expect(found[0]?.kind).toBe('not-panel-editable');
        expect(found[0]?.message).toContain('`filter: grayscale(100%) contrast(1.1)`');
    });
    it('is a note, not a problem: the value renders, the panel just can’t hold it', () => {
        const elements = view(rect('a1b2', { customProperties: { filter: 'grayscale(100%) contrast(1.1)' }, color: 'var(--color-ghost)' }));
        const bySeverity = Object.fromEntries(lint(elements).map((f) => [f.kind, f.severity]));
        expect(bySeverity).toEqual({ 'not-panel-editable': 'note', 'undeclared-token': 'problem' });
    });
    it('says nothing when the same property parsed into its typed field', () => {
        const elements = view(rect('a1b2', { filters: [{ kind: 'grayscale', value: 100 }] }));
        expect(kinds(elements)).toEqual([]);
    });
});
describe('lintView — side-not-typed', () => {
    it('names the shorthand Scamp types for each per-side longhand', () => {
        const elements = view(rect('a1b2', {
            customProperties: {
                'border-bottom': '1px solid var(--color-ink)',
                'padding-bottom': 'var(--space-4)',
            },
        }));
        const found = lint(elements);
        expect(found.map((f) => f.kind)).toEqual(['side-not-typed', 'side-not-typed']);
        expect(found[0]?.message).toContain('Scamp types `border`');
        expect(found[1]?.message).toContain('Scamp types `padding`');
    });
    it('prefers the side message over the generic one for a mapped longhand', () => {
        // `border-width` IS mapped, but `border-top-width` is a side of it —
        // the useful thing to say is which shorthand to write.
        const elements = view(rect('a1b2', { customProperties: { 'border-top-width': '2px' } }));
        expect(kinds(elements)).toEqual(['side-not-typed']);
    });
});
describe('lintView — undeclared-token', () => {
    it('flags a token theme.css does not declare, wherever it sits', () => {
        const elements = view(rect('a1b2', {
            color: 'var(--color-ghost)',
            // An unmapped property, so this case is only about the token.
            customProperties: { outline: '1px solid var(--shadow-ring)' },
        }));
        const found = lint(elements);
        expect(found.map((f) => f.kind)).toEqual(['undeclared-token', 'undeclared-token']);
        expect(found[0]?.message).toContain('var(--color-ghost)');
        expect(found[1]?.message).toContain('var(--shadow-ring)');
    });
    it('accepts a declared token and reports each undeclared one once', () => {
        const elements = view(rect('a1b2', {
            color: 'var(--color-ink)',
            customProperties: { outline: 'var(--missing) solid var(--missing)' },
        }));
        const found = lint(elements);
        expect(found).toHaveLength(1);
        expect(found[0]?.kind).toBe('undeclared-token');
    });
    it('reads a token reference out of a spacing field', () => {
        const elements = view(rect('a1b2', { gap: { kind: 'token', ref: 'var(--space-gone)' } }));
        expect(kinds(elements)).toEqual(['undeclared-token']);
    });
});
describe('lintView — binding-not-parsed', () => {
    it('flags an attribute kept as a verbatim expression', () => {
        const elements = view(rect('a1b2', { tag: 'a', attributes: { href: '{route(item)}' } }));
        const found = lint(elements);
        expect(found).toHaveLength(1);
        expect(found[0]?.kind).toBe('binding-not-parsed');
        expect(found[0]?.message).toContain('href={route(item)}');
    });
    it('leaves a constant expression alone: tabIndex={-1} is a number, not a binding', () => {
        const elements = view(rect('a1b2', { attributes: { tabIndex: '{-1}', 'aria-hidden': '{true}', role: '{"note"}', width: '{1.5}' } }));
        expect(kinds(elements)).toEqual([]);
        expect(kinds(view(rect('a1b2', { attributes: { tabIndex: '{index}' } })))).toEqual(['binding-not-parsed']);
    });
    it('leaves a real binding and a plain literal alone', () => {
        const elements = view(rect('a1b2', { tag: 'a', attributes: { href: '/about', target: '_blank' }, bind: { href: 'url' } }), { samples: { url: '/about' } });
        expect(kinds(elements)).toEqual([]);
    });
});
describe('lintView — a vendor-prefixed value', () => {
    it('is a note, not a problem: text-align: -webkit-center renders, the panel can’t hold it', () => {
        const found = lint(view(rect('a1b2', { customProperties: { 'text-align': '-webkit-center' } })));
        expect(found.map((f) => `${f.severity}:${f.kind}`)).toEqual(['note:not-panel-editable']);
    });
});
describe('lintView — missing-sample', () => {
    it('flags a bound prop with neither a sample nor a literal', () => {
        const elements = view(rect('a1b2', { type: 'image', src: '', bind: { src: 'photo' } }));
        const found = lint(elements);
        expect(found).toHaveLength(1);
        expect(found[0]?.kind).toBe('missing-sample');
        expect(found[0]?.hint).toContain('`photo`');
    });
    it('never fires for a boolean attribute, whose sample is its presence', () => {
        // `disabled={!canStart}` with the attribute absent means the flag
        // defaults true — a complete sample, not a missing one.
        const absent = view(rect('a1b2', { tag: 'button', attributes: { type: 'button' }, bind: { disabled: '!canStart' } }));
        expect(kinds(absent)).toEqual([]);
        const present = view(rect('a1b2', { tag: 'button', attributes: { disabled: '' }, bind: { disabled: 'isBusy' } }));
        expect(kinds(present)).toEqual([]);
    });
    it('accepts the sample in the typed field of an image', () => {
        const elements = view(rect('a1b2', { type: 'image', src: '/sample.png', bind: { src: 'photo' } }));
        expect(kinds(elements)).toEqual([]);
    });
    it('ignores a row path, whose sample is the rows on the root', () => {
        const elements = view(rect('a1b2', { type: 'image', bind: { src: 'shot.src' }, repeat: { over: 'shots', as: 'shot' } }), { samples: { shots: [{ id: '1', src: '/a.png' }] } });
        expect(kinds(elements)).toEqual([]);
    });
});
describe('lintView — raw-text-fragment', () => {
    it('flags loose words sitting directly in a container', () => {
        const elements = view(rect('a1b2', { inlineFragments: [{ kind: 'text', value: 'Sale ends Friday' }] }));
        const found = lint(elements);
        expect(found).toHaveLength(1);
        expect(found[0]?.kind).toBe('raw-text-fragment');
        expect(found[0]?.message).toContain('1 run of text');
    });
    it('ignores whitespace-only fragments and text elements', () => {
        const whitespace = view(rect('a1b2', { inlineFragments: [{ kind: 'text', value: '\n  ' }] }));
        expect(kinds(whitespace)).toEqual([]);
        const textEl = view(rect('a1b2', {
            type: 'text',
            text: 'Hello',
            inlineFragments: [{ kind: 'text', value: 'Hello' }],
        }));
        expect(kinds(textEl)).toEqual([]);
    });
});
describe('lintView — repeat-rows-differ', () => {
    it('flags sample rows that disagree on their fields', () => {
        const elements = view(rect('a1b2', { repeat: { over: 'rows', as: 'row' } }), { samples: { rows: [{ id: '1', label: 'A' }, { id: '2' }] } });
        expect(kinds(elements)).toEqual(['repeat-rows-differ']);
    });
    it('accepts rows with matching fields, and a single row', () => {
        const matching = view(rect('a1b2', { repeat: { over: 'rows', as: 'row' } }), { samples: { rows: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }] } });
        expect(kinds(matching)).toEqual([]);
        const single = view(rect('a1b2', { repeat: { over: 'rows', as: 'row' } }), { samples: { rows: [{ id: '1', label: 'A' }] } });
        expect(kinds(single)).toEqual([]);
    });
    it('says nothing when the repeat has no sample rows at all', () => {
        const elements = view(rect('a1b2', { repeat: { over: 'rows', as: 'row' } }));
        expect(kinds(elements)).toEqual([]);
    });
});
describe('lintView — reporting', () => {
    it('returns findings in document order, not element-map order', () => {
        const first = rect('aaaa', { customProperties: { 'border-top': '1px solid red' } });
        const second = rect('bbbb', { customProperties: { 'border-bottom': '1px solid red' } });
        const elements = {
            // Deliberately inserted child-last so map order differs from tree order.
            [second.id]: second,
            [first.id]: first,
            [ROOT_ELEMENT_ID]: {
                ...DEFAULT_ROOT_STYLES,
                id: ROOT_ELEMENT_ID,
                type: 'rectangle',
                parentId: null,
                childIds: ['aaaa', 'bbbb'],
                x: 0,
                y: 0,
                customProperties: {},
                inlineFragments: [],
                minHeight: undefined,
            },
        };
        expect(lint(elements).map((f) => f.elementId)).toEqual(['aaaa', 'bbbb']);
    });
    it('survives a childIds entry with no element behind it', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: {
                ...DEFAULT_ROOT_STYLES,
                id: ROOT_ELEMENT_ID,
                type: 'rectangle',
                parentId: null,
                childIds: ['gone'],
                x: 0,
                y: 0,
                customProperties: {},
                inlineFragments: [],
                minHeight: undefined,
            },
        };
        expect(lint(elements)).toEqual([]);
    });
    it('reports an empty theme as every token being undeclared', () => {
        const elements = view(rect('a1b2', { color: 'var(--color-ink)' }));
        const found = lintView({ elements, rootId: ROOT_ELEMENT_ID, themeTokens: [] });
        expect(found.map((f) => f.kind)).toEqual(['undeclared-token']);
    });
});
describe('tables', () => {
    const tableTsx = (rows) => `<div data-scamp-id="root" className={styles.root}>
  <table data-scamp-id="t1" className={styles.rect_t1}>
    <tbody data-scamp-id="t2" className={styles.rect_t2}>${rows}</tbody>
  </table>
</div>`;
    const row = (id, cells) => `<tr data-scamp-id="${id}" className={styles.rect_${id}}>${cells}</tr>`;
    const td = (id, extra = '') => `<td data-scamp-id="${id}" className={styles.text_${id}}${extra}>x</td>`;
    const GRID = '.rect_t1 { display: grid; grid-template-columns: 1fr 1fr; }';
    const tableKinds = (tsx, css) => lintView({ elements: parseCode(tsx, css).elements, rootId: ROOT_ELEMENT_ID, themeTokens: [] })
        .map((f) => f.kind)
        .filter((k) => k.startsWith('table-') || k === 'side-not-typed');
    it('says nothing about a well-formed table', () => {
        const tsx = tableTsx(row('r1', td('c1') + td('c2')) + row('r2', td('c3') + td('c4')));
        expect(tableKinds(tsx, GRID)).toEqual([]);
    });
    it('reports a div straight inside a row', () => {
        const tsx = tableTsx(row('r1', `${td('c1')}<div data-scamp-id="d1" className={styles.rect_d1} />`));
        expect(tableKinds(tsx, GRID)).toEqual(['table-structure']);
    });
    it('checks a component instance as the tag its component renders', () => {
        // A <Row> whose component's root is a <tr> is a row in the exported
        // page; read as a <div> it was a false alarm on every row.
        const tsx = `import Row from '@/components/Row/Row';\n${tableTsx(`<Row data-scamp-instance-id="inst_r1" /><Row data-scamp-instance-id="inst_r2" />`)}`;
        const structure = (tags) => lintView({ elements: parseCode(tsx, GRID).elements, rootId: ROOT_ELEMENT_ID, themeTokens: [], componentRootTags: tags })
            .filter((f) => f.kind === 'table-structure').length;
        expect(structure({ Row: 'tr' })).toBe(0);
        expect(structure({ Row: 'div' })).toBe(2);
        expect(structure()).toBe(2);
    });
    it('reports a row written straight inside the table, not a section', () => {
        // The HTML parser wraps it in a tbody of its own in the exported
        // page only; the canvas never sees that element.
        const tsx = `<div data-scamp-id="root" className={styles.root}>
  <table data-scamp-id="t1" className={styles.rect_t1}>
    <div data-scamp-id="d1" className={styles.rect_d1} />
  </table>
</div>`;
        const findings = lintView({
            elements: parseCode(tsx, GRID).elements,
            rootId: ROOT_ELEMENT_ID,
            themeTokens: [],
        });
        const structure = findings.filter((f) => f.kind === 'table-structure');
        expect(structure).toHaveLength(1);
        expect(structure[0]?.className).toBe('rect_d1');
    });
    it('reports a cell with its own width in a grid table', () => {
        const tsx = tableTsx(row('r1', td('c1') + td('c2')));
        expect(tableKinds(tsx, `${GRID}\n.text_c2 { width: 120px; }`)).toEqual(['table-cell-width']);
    });
    it('says nothing about a cell width in a table with no columns', () => {
        // The browser's own table layout sizes a column from its cells, so
        // a cell width is how such a table is sized at all.
        const tsx = tableTsx(row('r1', td('c1') + td('c2')));
        expect(tableKinds(tsx, '.text_c2 { width: 120px; }')).toEqual([]);
    });
    it('reports a rowSpan', () => {
        const tsx = tableTsx(row('r1', td('c1', ' rowSpan="2"') + td('c2')));
        expect(tableKinds(tsx, GRID)).toEqual(['table-rowspan']);
    });
    it('reports a divider repeated on every row, once, on the table', () => {
        const tsx = tableTsx(row('r1', td('c1')) + row('r2', td('c2')));
        const css = `${GRID}
.rect_r1 { border-bottom: 1px solid #ddd; }
.rect_r2 { border-bottom: 1px solid #ddd; }`;
        const findings = lintView({
            elements: parseCode(tsx, css).elements,
            rootId: ROOT_ELEMENT_ID,
            themeTokens: [],
        });
        const repeated = findings.filter((f) => f.kind === 'table-repeated-style');
        expect(repeated).toHaveLength(1);
        expect(repeated[0]?.className).toBe('rect_t1');
        // The fix it names is the exact rule Scamp reads as the divider.
        expect(repeated[0]?.hint).toContain(':where(.rect_t1) :where(tr) { border-bottom: 1px solid #ddd; }');
        // …and the one-sided-border advice, wrong for a row, is not given.
        expect(findings.map((f) => f.kind)).not.toContain('side-not-typed');
    });
    it('says nothing when only some rows carry a divider', () => {
        const tsx = tableTsx(row('r1', td('c1')) + row('r2', td('c2')));
        expect(tableKinds(tsx, `${GRID}\n.rect_r1 { border-bottom: 1px solid #ddd; }`)).toEqual([]);
    });
    it('reports padding repeated on every cell', () => {
        const tsx = tableTsx(row('r1', td('c1') + td('c2')));
        const css = `${GRID}
.text_c1 { padding: 8px 12px; }
.text_c2 { padding: 8px 12px; }`;
        const findings = lintView({
            elements: parseCode(tsx, css).elements,
            rootId: ROOT_ELEMENT_ID,
            themeTokens: [],
        });
        const repeated = findings.filter((f) => f.kind === 'table-repeated-style');
        expect(repeated).toHaveLength(1);
        expect(repeated[0]?.hint).toContain('.rect_t1 :where(th, td) { padding: 8px 12px; }');
    });
    it('says nothing about cells with no padding', () => {
        const tsx = tableTsx(row('r1', td('c1') + td('c2')));
        expect(tableKinds(tsx, GRID)).toEqual([]);
    });
});

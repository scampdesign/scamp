import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { CAPTURE_VERSION } from '@shared/importCapture';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { applyBreakpointCaptures, reduceCapture, resolveInheritance, viewNameFromTitle, } from '@lib/importReduce';
import { ROOT_ELEMENT_ID } from '@lib/element';
/**
 * The reducer: a captured page in, an element tree out.
 *
 * Two kinds of case here. Synthetic payloads pin one rule each, and the
 * real fixture — captured from a real browser by
 * `scripts/capture-import-fixtures.mjs` — proves the rules hold against
 * a layout engine's actual output, which is where every wrong
 * assumption has shown up so far.
 * see docs/plans/website-import-plan.md
 */
const node = (over = {}) => ({
    id: 0,
    tag: 'div',
    rect: { x: 0, y: 0, w: 1200, h: 400 },
    styles: {},
    text: null,
    attrs: {},
    children: [],
    notes: [],
    ...over,
});
const payloadOf = (root, over = {}) => ({
    version: CAPTURE_VERSION,
    url: 'fixture:test',
    title: 'Test Page',
    viewport: { width: 1440, height: 900 },
    root,
    assets: [],
    notes: [],
    ...over,
});
/** Deterministic ids, as `element/tree.ts` does for its own tests. */
const seqIds = () => {
    let n = 0;
    return () => {
        n += 1;
        return n.toString(16).padStart(4, '0');
    };
};
const reduce = (root, over = {}) => reduceCapture(payloadOf(root, over), { randomId: seqIds() });
const kinds = (root) => reduce(root).findings.map((f) => f.kind);
describe('what the page wrote, in the spelling Scamp and React need', () => {
    // Everything here came out of one agent's clean-up report on a real
    // import: 834 single-side declarations the panel could not edit, SVGs
    // React refused to compile, and every link pointing back at the site
    // the page was copied from.
    it('folds four sides into the shorthand Scamp models', () => {
        // `getComputedStyle` only ever reports longhands, and Scamp maps
        // only the shorthand — so all four fell through to
        // `customProperties`: four lines where one would do, and none of
        // them editable in the panel.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    styles: {
                        'padding-top': '8px',
                        'padding-right': '16px',
                        'padding-bottom': '8px',
                        'padding-left': '16px',
                    },
                }),
            ],
        }));
        const box = Object.values(elements).find((e) => e.id !== ROOT_ELEMENT_ID);
        expect(box?.padding).toEqual([8, 16, 8, 16]);
        expect(box?.customProperties['padding-top']).toBeUndefined();
    });
    it.each([
        [['4px', '4px', '4px', '4px'], [4, 4, 4, 4]],
        [['4px', '8px', '4px', '8px'], [4, 8, 4, 8]],
        [['4px', '8px', '12px', '8px'], [4, 8, 12, 8]],
        [['4px', '8px', '12px', '16px'], [4, 8, 12, 16]],
    ])('collapses %j without changing what it means', (sides, want) => {
        const [top, right, bottom, left] = sides;
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    styles: {
                        'margin-top': top,
                        'margin-right': right,
                        'margin-bottom': bottom,
                        'margin-left': left,
                    },
                }),
            ],
        }));
        const box = Object.values(elements).find((e) => e.id !== ROOT_ELEMENT_ID);
        expect(box?.margin).toEqual(want);
    });
    it('leaves a partial set alone, rather than inventing the other sides', () => {
        const { elements } = reduce(node({ children: [node({ id: 1, styles: { 'padding-left': '16px' } })] }));
        const box = Object.values(elements).find((e) => e.id !== ROOT_ELEMENT_ID);
        expect(box?.padding).toEqual([0, 0, 0, 0]);
        expect(box?.customProperties['padding-left']).toBe('16px');
    });
    it('folds a border the same way, all three of its sets', () => {
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    styles: {
                        'border-top-width': '1px',
                        'border-right-width': '1px',
                        'border-bottom-width': '1px',
                        'border-left-width': '1px',
                        'border-top-style': 'solid',
                        'border-right-style': 'solid',
                        'border-bottom-style': 'solid',
                        'border-left-style': 'solid',
                        'border-top-color': 'rgb(1, 2, 3)',
                        'border-right-color': 'rgb(1, 2, 3)',
                        'border-bottom-color': 'rgb(1, 2, 3)',
                        'border-left-color': 'rgb(1, 2, 3)',
                    },
                }),
            ],
        }));
        const box = Object.values(elements).find((e) => e.id !== ROOT_ELEMENT_ID);
        expect(box?.borderWidth).toEqual([1, 1, 1, 1]);
        expect(box?.borderStyle).toBe('solid');
        expect(box?.borderColor).toBe('rgb(1, 2, 3)');
    });
    it('writes an svg React will accept', () => {
        // The DOM serialises `style` as a string and keeps the hyphens.
        // React takes neither, so the icon's own `fill: currentColor` was
        // captured correctly and then dropped — icons rendered black.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'svg',
                    svgSource: '<path style="fill: currentcolor" fill-rule="evenodd"></path>',
                }),
            ],
        }));
        const icon = Object.values(elements).find((e) => e.type === 'image');
        expect(icon?.svgSource).toContain("style={{ fill: 'currentcolor' }}");
        expect(icon?.svgSource).toContain('fillRule="evenodd"');
    });
    it('spells a kept attribute the way React spells it', () => {
        const { elements } = reduce(node({
            children: [node({ id: 1, tag: 'time', text: 'today', attrs: { datetime: '2026-01-01' } })],
        }));
        const time = Object.values(elements).find((e) => e.text === 'today');
        expect(time?.attributes?.['dateTime']).toBe('2026-01-01');
        expect(time?.attributes?.['datetime']).toBeUndefined();
    });
});
describe('boxes that hold words, and words that hold their place', () => {
    it('keeps the words in a box that is nothing but words', () => {
        // `elementTypeFor` calls a `<div>` a rectangle, and the generator
        // emits `text` for text elements alone — so the words were written
        // nowhere and the div came out empty, with nothing in the report.
        const { elements } = reduce(node({ children: [node({ id: 1, tag: 'div', text: 'Clinical iQ > AI Recorder' })] }));
        const words = Object.values(elements).find((e) => e.text === 'Clinical iQ > AI Recorder');
        expect(words?.type).toBe('text');
        expect(words?.tag).toBe('div');
        // The class prefix has to agree, or `parseCode` reads the tag and
        // calls it a rectangle again on the next load.
        expect(words?.name).toBe('text');
    });
    it('still calls a box with children a box', () => {
        // Given a background so the collapse pass keeps it: a `<div>` that
        // decides nothing and holds one child is removed on purpose.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'div',
                    styles: { 'background-color': 'rgb(1, 2, 3)' },
                    children: [node({ id: 2, tag: 'p', text: 'x' })],
                }),
            ],
        }));
        // `tag` is only stored when it differs from the type's default, so
        // a `<div>` rectangle records none.
        const box = Object.values(elements).find((e) => e.childIds.length === 1 && e.id !== ROOT_ELEMENT_ID);
        expect(box?.type).toBe('rectangle');
        expect(box?.text ?? null).toBeNull();
    });
    it('puts lifted words after the children they followed', () => {
        // `<h1><span class="ico">…</span>Live capture</h1>` is an icon and
        // then a title. Lifting the title to the front put the icon after it.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'h1',
                    text: 'Live capture',
                    textAfterChildIndex: 0,
                    children: [node({ id: 2, tag: 'span', text: '★' })],
                }),
            ],
        }));
        const host = Object.values(elements).find((e) => e.childIds.length === 2);
        expect((host?.childIds ?? []).map((id) => elements[id]?.text)).toEqual([
            '★',
            'Live capture',
        ]);
    });
    it('puts them first when that is where they were', () => {
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'h1',
                    text: 'Title first',
                    textAfterChildIndex: -1,
                    children: [node({ id: 2, tag: 'span', text: '★' })],
                }),
            ],
        }));
        const host = Object.values(elements).find((e) => e.childIds.length === 2);
        expect((host?.childIds ?? []).map((id) => elements[id]?.text)).toEqual([
            'Title first',
            '★',
        ]);
    });
    it('still lands them somewhere when the capture said nothing', () => {
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'h1',
                    text: 'Words',
                    children: [node({ id: 2, tag: 'span', text: '★' })],
                }),
            ],
        }));
        const host = Object.values(elements).find((e) => e.childIds.length === 2);
        expect((host?.childIds ?? []).map((id) => elements[id]?.text)).toContain('Words');
    });
});
describe('a container is never typed as text', () => {
    // The canvas renders a text element's `text` and ignores its
    // children (`ElementRenderer`), so a tag whose words have moved into
    // children must not be one: its spans were listed in the layers panel
    // and written to the file, and drew nothing at all.
    //
    // `parseCode` already corrects this when it reads a file — but not
    // when the class name pins the type, and `text_` does. So the name
    // has to stop saying text as well, or reopening the project does not
    // fix it either. see docs/notes/import-inline-spans.md
    const paragraph = () => node({
        tag: 'p',
        text: 'Ships with a warranty',
        styles: { 'font-size': '11px' },
        children: [node({ id: 2, tag: 'em', text: 'Terms apply', styles: { display: 'block' } })],
    });
    it('types a paragraph with element children as a container', () => {
        const { elements } = reduce(node({ children: [paragraph()] }));
        const em = Object.values(elements).find((e) => e.text === 'Terms apply');
        const host = Object.values(elements).find((e) => e.id === em?.parentId);
        expect(host?.type).toBe('rectangle');
    });
    it('does not name it `text`, which would pin the type back', () => {
        const { elements } = reduce(node({ children: [paragraph()] }));
        const em = Object.values(elements).find((e) => e.text === 'Terms apply');
        const host = Object.values(elements).find((e) => e.id === em?.parentId);
        expect(host?.name).not.toBe('text');
    });
    it('keeps the <p> tag, so only the type changed', () => {
        const { elements } = reduce(node({ children: [paragraph()] }));
        const em = Object.values(elements).find((e) => e.text === 'Terms apply');
        const host = Object.values(elements).find((e) => e.id === em?.parentId);
        expect(host?.tag).toBe('p');
    });
    it('leaves a leaf paragraph a text element', () => {
        const { elements } = reduce(node({ children: [node({ id: 1, tag: 'p', text: 'just words' })] }));
        const leaf = Object.values(elements).find((e) => e.text === 'just words');
        expect(leaf?.type).toBe('text');
        expect(leaf?.name).toBe('text');
    });
    it('leaves a paragraph that only has inline markup a text element', () => {
        // Fragments are not children, so nothing moved and the canvas can
        // still render it as text.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'p',
                    text: null,
                    inline: [
                        { kind: 'text', value: 'Read the ' },
                        { kind: 'markup', source: '<strong>docs</strong>' },
                    ],
                }),
            ],
        }));
        const host = Object.values(elements).find((e) => e.inlineFragments.length > 0);
        expect(host?.type).toBe('text');
        expect(host?.childIds).toEqual([]);
    });
    it('agrees with what parseCode makes of it, so a reload changes nothing', () => {
        const { elements, rootId } = reduce(node({ children: [paragraph()] }));
        const out = generateCode({
            elements,
            rootId,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        const back = parseCode(out.tsx, out.css);
        for (const [id, before] of Object.entries(elements)) {
            const after = back.elements[id];
            if (after !== undefined)
                expect(after.type).toBe(before.type);
        }
    });
});
describe('the inline run is text, not layout', () => {
    // `<b>`, `<i>`, `<sup>` and the rest were not text tags, so each came
    // out a rectangle — and a rectangle carries no text at all, which
    // emitted `<b />` with the word gone. They only reach the tree as
    // elements now that a flex or grid host's children are elements
    // rather than one verbatim run.
    it.each(['b', 'i', 'u', 's', 'sub', 'sup', 'mark', 'abbr', 'cite', 'q', 'kbd', 'del', 'ins'])('keeps the words inside <%s>', (tag) => {
        const { elements } = reduce(node({
            styles: { display: 'flex' },
            children: [node({ id: 1, tag, text: 'kept' })],
        }));
        const el = Object.values(elements).find((e) => e.text === 'kept');
        expect(el?.type).toBe('text');
    });
    it('still treats a genuine box tag as a box', () => {
        const { elements } = reduce(node({ styles: { display: 'flex' }, children: [node({ id: 1, tag: 'section' })] }));
        expect(Object.values(elements).find((e) => e.name === 'section')?.type).toBe('rectangle');
    });
    it('reads a flex host as items rather than as a sentence', () => {
        // The host is a text tag, so before this its children were flattened
        // into one verbatim run of bare tags.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'span',
                    styles: { display: 'flex' },
                    children: [
                        node({ id: 2, tag: 'span', text: 'North' }),
                        node({ id: 3, tag: 'b', text: 'wind' }),
                    ],
                }),
            ],
        }));
        expect(Object.values(elements).map((e) => e.text).filter(Boolean).sort()).toEqual([
            'North',
            'wind',
        ]);
    });
    it('keeps the type on the container as well as on its words', () => {
        // A tag with element children parses back as a rectangle, and a
        // rectangle now emits the typography it was given — so the
        // container keeps what the page declared, and the words that
        // inherited it carry their own copy. Neither is lost on a save.
        const { elements } = reduce(node({
            children: [
                node({
                    id: 1,
                    tag: 'span',
                    styles: { display: 'flex', 'font-size': '22px', 'font-weight': '700' },
                    children: [node({ id: 2, tag: 'b', text: 'wind' })],
                }),
            ],
        }));
        const bold = Object.values(elements).find((e) => e.text === 'wind');
        const host = Object.values(elements).find((e) => e.id === bold?.parentId);
        expect(bold?.fontSize).toBe('22px');
        expect(host?.fontSize).toBe('22px');
    });
});
describe('styled spans become elements in the line', () => {
    // A `<strong>` survives being written out as a bare tag, because the
    // browser styles it. A `<span>` does not: everything it looks like
    // came from a class the import cannot carry, so a bare `<span>` is
    // the whole loss. see docs/notes/import-inline-spans.md
    const run = (...items) => node({ tag: 'h1', text: null, inline: items, children: [] });
    const styledSpan = (text, styles = {}) => node({
        id: 9,
        tag: 'span',
        text,
        styles: { 'background-color': 'rgb(1, 2, 3)', ...styles },
        children: [],
    });
    it('makes a styled span a real element rather than bare markup', () => {
        const { elements } = reduce(node({ children: [run({ kind: 'text', value: 'Stop the ' }, { kind: 'element', node: styledSpan('busywork') })] }));
        const span = Object.values(elements).find((e) => e.text === 'busywork');
        expect(span?.type).toBe('text');
        expect(span?.backgroundColor).toBe('rgb(1, 2, 3)');
    });
    it('leaves it in the line rather than pinning it at 0,0', () => {
        // A child of a text host is `position: absolute` under Scamp's
        // tree-shape rule, which would lift the word out of the sentence.
        const { elements } = reduce(node({ children: [run({ kind: 'text', value: 'Stop the ' }, { kind: 'element', node: styledSpan('busywork') })] }));
        const span = Object.values(elements).find((e) => e.text === 'busywork');
        expect(span?.position).toBe('static');
    });
    it('lets the span hug its words instead of pinning a measured width', () => {
        const { elements } = reduce(node({ children: [run({ kind: 'element', node: styledSpan('busywork', { width: '425px', height: '89px' }) })] }));
        const span = Object.values(elements).find((e) => e.text === 'busywork');
        expect(span?.widthMode).toBe('auto');
        expect(span?.heightMode).toBe('auto');
    });
    it('moves the surrounding words into siblings, in source order', () => {
        // A host cannot hold both words and children — the generator drops
        // the words — so once one span is an element they all have to be.
        const { elements } = reduce(node({ children: [run({ kind: 'text', value: 'Stop the ' }, { kind: 'element', node: styledSpan('busywork') }, { kind: 'text', value: ' today' })] }));
        const span = Object.values(elements).find((e) => e.text === 'busywork');
        const host = Object.values(elements).find((e) => e.id === span?.parentId);
        expect((host?.childIds ?? []).map((id) => elements[id]?.text)).toEqual([
            'Stop the',
            'busywork',
            'today',
        ]);
        expect(host?.text ?? null).toBeNull();
    });
    it('keeps those lifted runs inline, so they still read as one line', () => {
        const { elements } = reduce(node({ children: [run({ kind: 'text', value: 'Stop the ' }, { kind: 'element', node: styledSpan('busywork') })] }));
        const words = Object.values(elements).find((e) => e.text === 'Stop the');
        expect(words?.customProperties['display']).toBe('inline');
    });
    it('places markup between the children it sat between', () => {
        const { elements } = reduce(node({ children: [run({ kind: 'element', node: styledSpan('one') }, { kind: 'markup', source: '<em>and</em>' }, { kind: 'element', node: styledSpan('two') })] }));
        const span = Object.values(elements).find((e) => e.text === 'one');
        const host = Object.values(elements).find((e) => e.id === span?.parentId);
        const fragment = host?.inlineFragments[0];
        // After the first child, before the second — which is what puts it
        // back where the sentence had it.
        expect(fragment?.afterChildIndex).toBe(0);
    });
    it('changes nothing for a run with no styled span in it', () => {
        // The leading text stays on the host and the rest stay fragments,
        // exactly as before — this is the common case and it must not move.
        const { elements } = reduce(node({ children: [run({ kind: 'text', value: 'Read the ' }, { kind: 'markup', source: '<a href="/docs">docs</a>' })] }));
        const host = Object.values(elements).find((e) => e.text === 'Read the');
        expect(host?.childIds).toEqual([]);
        expect(host?.inlineFragments[0]?.afterChildIndex).toBe(-1);
    });
    it('lets a span that positions itself keep what it asked for', () => {
        const { elements } = reduce(node({ children: [run({ kind: 'element', node: styledSpan('badge', { position: 'relative' }) })] }));
        const span = Object.values(elements).find((e) => e.text === 'badge');
        expect(span?.position).toBe('relative');
    });
});
describe('materializePseudos — ticks and toggles become elements', () => {
    // Pages put real design in `::before` / `::after`: a "✓" on every
    // bullet, a "+" on every collapsed row. Scamp has no
    // pseudo-elements, so these become text elements — which is the
    // better answer anyway, since you can then see and edit them.
    const bullet = (over = {}) => node({
        tag: 'li',
        text: 'Ships on Friday',
        styles: { 'font-size': '14px', color: 'rgb(20, 20, 20)' },
        pseudo: { before: { text: '✓', styles: { color: 'rgb(46, 160, 67)' } } },
        ...over,
    });
    const childrenOf = (root) => {
        const { elements } = reduce(node({ children: [root] }));
        const host = Object.values(elements).find((e) => e.name === 'listitem' || e.name === 'box');
        return { elements, host };
    };
    it('puts a ::before in front of everything else', () => {
        const { elements } = reduce(node({ children: [bullet()] }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        const host = Object.values(elements).find((e) => e.id === glyph?.parentId);
        expect(host?.childIds[0]).toBe(glyph?.id);
    });
    it('puts an ::after behind everything else', () => {
        const { elements } = reduce(node({
            children: [
                bullet({
                    pseudo: { after: { text: '+', styles: {} } },
                }),
            ],
        }));
        const glyph = Object.values(elements).find((e) => e.text === '+');
        const host = Object.values(elements).find((e) => e.id === glyph?.parentId);
        expect(host?.childIds[host.childIds.length - 1]).toBe(glyph?.id);
    });
    it('keeps both ends around the words', () => {
        const { elements } = reduce(node({
            children: [
                bullet({
                    pseudo: {
                        before: { text: '«', styles: {} },
                        after: { text: '»', styles: {} },
                    },
                }),
            ],
        }));
        const open = Object.values(elements).find((e) => e.text === '«');
        const host = Object.values(elements).find((e) => e.id === open?.parentId);
        const order = (host?.childIds ?? []).map((id) => elements[id]?.text);
        expect(order).toEqual(['«', 'Ships on Friday', '»']);
    });
    it('moves the host\'s own words into a sibling, not the host', () => {
        // Leaving them on the host would render them before the glyph,
        // whatever the child order said.
        const { elements } = reduce(node({ children: [bullet()] }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        const host = Object.values(elements).find((e) => e.id === glyph?.parentId);
        expect(host?.text ?? null).toBeNull();
        expect(elements[host?.childIds[1] ?? '']?.text).toBe('Ships on Friday');
    });
    it('carries a host\'s inline markup across with its words', () => {
        const { elements } = reduce(node({
            children: [
                bullet({
                    text: null,
                    inline: [
                        { kind: 'text', value: 'Read the ' },
                        { kind: 'markup', source: '<a href="/docs">docs</a>' },
                    ],
                }),
            ],
        }));
        const words = Object.values(elements).find((e) => e.inlineFragments.length > 0);
        expect(words?.text).toBe('Read the');
        const fragment = words?.inlineFragments[0];
        expect(fragment && 'source' in fragment && fragment.source).toContain('/docs');
    });
    it('gives the host a layout, so the glyph is not stacked on the words', () => {
        // An `li` is a text tag. Once its words move out it is a container,
        // and a container with no layout pins every child at 0,0 — which
        // would print the tick on top of the sentence.
        const { baseStyles, elements } = reduce(node({ children: [bullet()] }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        const hostId = glyph?.parentId ?? '';
        expect(baseStyles[hostId]?.['display']).toBe('flex');
    });
    it('dresses the glyph in the type it was rendered in', () => {
        const { elements } = reduce(node({ children: [bullet()] }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        expect(glyph?.fontSize).toBe('14px');
    });
    it('lets the glyph\'s own styles beat what it inherited', () => {
        const { elements } = reduce(node({ children: [bullet()] }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        expect(glyph?.color).toBe('rgb(46, 160, 67)');
    });
    it('works on a host with no words of its own', () => {
        const { elements } = reduce(node({
            children: [
                node({
                    tag: 'div',
                    styles: { 'background-color': 'rgb(1, 2, 3)' },
                    pseudo: { before: { text: '→', styles: {} } },
                }),
            ],
        }));
        const glyph = Object.values(elements).find((e) => e.text === '→');
        expect(glyph?.type).toBe('text');
    });
    it('keeps the wrapper that holds a glyph, rather than collapsing it away', () => {
        // A `div` whose only distinguishing feature is its `::before` looks
        // like an empty wrapper to the collapse pass.
        const { elements } = reduce(node({
            children: [
                node({
                    tag: 'div',
                    pseudo: { before: { text: '→', styles: {} } },
                    children: [node({ id: 2, tag: 'p', text: 'only child' })],
                }),
            ],
        }));
        expect(Object.values(elements).some((e) => e.text === '→')).toBe(true);
    });
    it('leaves a node with no pseudo-element exactly as it was', () => {
        const plain = node({ tag: 'li', text: 'nothing special' });
        const { elements } = reduce(node({ children: [plain] }));
        const item = Object.values(elements).find((e) => e.text === 'nothing special');
        expect(item?.childIds).toEqual([]);
    });
    it('does not mutate the captured tree', () => {
        // The narrower captures run through the same pass.
        const root = node({ children: [bullet()] });
        reduce(root);
        expect(root.children[0]?.text).toBe('Ships on Friday');
        expect(root.children[0]?.pseudo?.before?.text).toBe('✓');
    });
    it('stacks the words when the glyph is taken out of flow', () => {
        // `position: absolute; left: 0` is the custom-bullet idiom: the
        // glyph does not participate, so the words keep block flow.
        const { baseStyles, elements } = reduce(node({
            children: [
                bullet({
                    pseudo: {
                        before: { text: '✓', styles: { position: 'absolute', left: '0px' } },
                    },
                }),
            ],
        }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        const host = baseStyles[glyph?.parentId ?? ''];
        expect(host?.['display']).toBe('flex');
        expect(host?.['flex-direction']).toBe('column');
    });
    it('sits the glyph beside the words when it is still in flow', () => {
        const { baseStyles, elements } = reduce(node({ children: [bullet()] }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        const host = baseStyles[glyph?.parentId ?? ''];
        expect(host?.['flex-direction']).toBe('row');
        expect(host?.['align-items']).toBe('baseline');
    });
    it('keeps an inline host part of the line it was in', () => {
        const { baseStyles, elements } = reduce(node({
            children: [
                bullet({ tag: 'span', styles: { display: 'inline' } }),
            ],
        }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        expect(baseStyles[glyph?.parentId ?? '']?.['display']).toBe('inline-flex');
    });
    it('leaves a host that already has a layout alone', () => {
        const { baseStyles, elements } = reduce(node({
            children: [
                bullet({ styles: { display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)' } }),
            ],
        }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        expect(baseStyles[glyph?.parentId ?? '']?.['display']).toBe('grid');
    });
    it('does not put a list marker on the glyph it made', () => {
        const { elements } = reduce(node({
            children: [bullet({ styles: { 'list-style-type': 'none', 'font-size': '14px' } })],
        }));
        const glyph = Object.values(elements).find((e) => e.text === '✓');
        expect(glyph?.customProperties['list-style-type']).toBeUndefined();
    });
    it('reports what it recovered, so the change is not silent', () => {
        const { findings } = reduce(node({ children: [bullet()] }));
        const made = findings.filter((f) => f.kind === 'pseudo-materialized');
        expect(made).toHaveLength(1);
        expect(made[0]?.detail).toBe('✓');
    });
});
describe('grid templates — used values are not decisions', () => {
    // `getComputedStyle` reads a grid template back as the track sizes it
    // used, never as what was written. `1fr 1fr` comes out
    // `548.094px 495.891px`, and `auto` rows come out as whatever height
    // the content took, which then stops the content from growing.
    const gridStyles = (over, w = 1100) => ({
        display: 'grid',
        width: `${w}px`,
        ...over,
    });
    const cssOf = (root) => {
        const { elements, rootId } = reduce(root);
        return generateCode({
            elements,
            rootId,
            pageName: 'Page',
            cssModuleImportName: 'Page',
            isComponent: true,
        }).css;
    };
    it('drops a row template that is only measurements', () => {
        const css = cssOf(node({
            styles: gridStyles({ 'grid-template-rows': '739.797px' }),
            children: [node({ id: 1, rect: { x: 0, y: 0, w: 1100, h: 739.797 } })],
        }));
        expect(css).not.toContain('grid-template-rows');
    });
    it('keeps a row template the page actually wrote', () => {
        const css = cssOf(node({
            styles: gridStyles({ 'grid-template-rows': 'repeat(2, minmax(0, 1fr))' }),
            children: [node({ id: 1 })],
        }));
        expect(css).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))');
    });
    it('turns filling pixel columns back into fractions', () => {
        // 548.094 + 56 + 495.891 = 1099.985, which is the content box: these
        // tracks were `fr` before the browser measured them.
        const css = cssOf(node({
            rect: { x: 0, y: 0, w: 1100, h: 740 },
            styles: gridStyles({
                'grid-template-columns': '548.094px 495.891px',
                'column-gap': '56px',
            }),
            children: [node({ id: 1 })],
        }));
        expect(css).toContain('grid-template-columns: 1.105fr 1fr');
    });
    it('reads an even grid as plain fractions', () => {
        const css = cssOf(node({
            rect: { x: 0, y: 0, w: 1100, h: 400 },
            styles: gridStyles({
                'grid-template-columns': '356px 356px 356px',
                'column-gap': '16px',
            }),
            children: [node({ id: 1 })],
        }));
        expect(css).toContain('grid-template-columns: 1fr 1fr 1fr');
    });
    it('leaves pixel columns that do not fill the box alone', () => {
        // 200 + 200 leaves 700px of the container unused, so the author
        // really did write pixels and the grid is not flexible.
        const css = cssOf(node({
            rect: { x: 0, y: 0, w: 1100, h: 400 },
            styles: gridStyles({ 'grid-template-columns': '200px 200px' }),
            children: [node({ id: 1 })],
        }));
        expect(css).toContain('grid-template-columns: 200px 200px');
    });
    it('measures the content box, not the border box', () => {
        // Padding and border come off the width before the tracks are
        // compared, or a padded grid never looks like it fills.
        const css = cssOf(node({
            rect: { x: 0, y: 0, w: 1100, h: 400 },
            styles: gridStyles({
                'grid-template-columns': '500px 500px',
                'padding-left': '50px',
                'padding-right': '50px',
            }),
            children: [node({ id: 1 })],
        }));
        expect(css).toContain('grid-template-columns: 1fr 1fr');
    });
    it('leaves a template that already says what it means', () => {
        const css = cssOf(node({
            rect: { x: 0, y: 0, w: 1100, h: 400 },
            styles: gridStyles({ 'grid-template-columns': 'repeat(auto-fit, minmax(240px, 1fr))' }),
            children: [node({ id: 1 })],
        }));
        expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))');
    });
    it('leaves a flex container\'s tracks alone, whatever it reports', () => {
        // The rule is scoped to grid containers: a stray template on
        // anything else is the page's business, not a measurement.
        const { baseStyles } = reduce(node({
            styles: { display: 'flex', width: '1100px', 'grid-template-rows': '400px' },
            children: [node({ id: 1 })],
        }));
        expect(baseStyles[ROOT_ELEMENT_ID]?.['grid-template-rows']).toBe('400px');
    });
    it('reports the fraction it restored, so the change is not silent', () => {
        const { findings } = reduce(node({
            rect: { x: 0, y: 0, w: 1100, h: 400 },
            styles: gridStyles({ 'grid-template-columns': '550px 550px' }),
            children: [node({ id: 1 })],
        }));
        expect(findings.map((f) => f.kind)).toContain('grid-tracks-to-fr');
    });
});
describe('resolveInheritance — typography reaching the words', () => {
    // Scamp emits typography only on text elements, so a font left on a
    // container by CSS inheritance reaches nothing at all. Every case
    // here is about that gap; the symptom it produced was headings a line
    // taller than they were captured, overlapping what sat below them.
    const styleOf = (root, path) => {
        let at = resolveInheritance(root);
        for (const i of path)
            at = at.children[i];
        return at.styles;
    };
    it('puts an ancestor font onto the text element that renders it', () => {
        const root = node({
            styles: { 'font-family': 'Fraunces, serif' },
            children: [node({ id: 1, tag: 'p', text: 'hello' })],
        });
        expect(styleOf(root, [0])['font-family']).toBe('Fraunces, serif');
    });
    it('carries it down through containers that only pass it along', () => {
        const root = node({
            styles: { 'font-family': 'Inter' },
            children: [
                node({
                    id: 1,
                    children: [node({ id: 2, children: [node({ id: 3, tag: 'h1', text: 'deep' })] })],
                }),
            ],
        });
        expect(styleOf(root, [0, 0, 0])['font-family']).toBe('Inter');
    });
    it('lets the nearest ancestor win, the way the cascade did', () => {
        const root = node({
            styles: { color: 'rgb(0, 0, 0)' },
            children: [
                node({
                    id: 1,
                    styles: { color: 'rgb(85, 85, 85)' },
                    children: [node({ id: 2, tag: 'p', text: 'grey' })],
                }),
            ],
        });
        expect(styleOf(root, [0, 0])['color']).toBe('rgb(85, 85, 85)');
    });
    it('never overwrites a value the element declared for itself', () => {
        const root = node({
            styles: { 'font-size': '16px' },
            children: [node({ id: 1, tag: 'h1', styles: { 'font-size': '60px' }, text: 'big' })],
        });
        expect(styleOf(root, [0])['font-size']).toBe('60px');
    });
    it('leaves containers alone, so the generated CSS stays clean', () => {
        // A container could not emit the font anyway, and writing it there
        // would only add a line no one reads.
        const root = node({
            styles: { 'font-family': 'Inter' },
            children: [node({ id: 1, children: [node({ id: 2, tag: 'p', text: 'x' })] })],
        });
        expect(styleOf(root, [0])['font-family']).toBeUndefined();
    });
    it('carries every inherited property, not only the font', () => {
        const root = node({
            styles: {
                'font-family': 'Inter',
                color: 'rgb(85, 85, 85)',
                'line-height': '25.6px',
                'letter-spacing': '1.44px',
                'text-align': 'center',
                'text-transform': 'uppercase',
            },
            children: [node({ id: 1, tag: 'p', text: 'x' })],
        });
        expect(styleOf(root, [0])).toEqual({
            'font-family': 'Inter',
            color: 'rgb(85, 85, 85)',
            'line-height': '25.6px',
            'letter-spacing': '1.44px',
            'text-align': 'center',
            'text-transform': 'uppercase',
        });
    });
    it('does not invent values nobody set', () => {
        const root = node({ children: [node({ id: 1, tag: 'p', text: 'x' })] });
        expect(styleOf(root, [0])).toEqual({});
    });
    it('leaves the tree otherwise untouched', () => {
        const root = node({
            styles: { 'font-family': 'Inter' },
            children: [node({ id: 1, tag: 'p', text: 'hello', attrs: { id: 'a' } })],
        });
        const out = resolveInheritance(root);
        expect(out.children).toHaveLength(1);
        expect(out.children[0]?.id).toBe(1);
        expect(out.children[0]?.text).toBe('hello');
        expect(out.children[0]?.attrs).toEqual({ id: 'a' });
    });
    it('does not mutate the captured tree it was given', () => {
        // The narrower breakpoint captures are reduced against the same
        // payloads, so a mutating pass would cross-contaminate them.
        const root = node({
            styles: { 'font-family': 'Inter' },
            children: [node({ id: 1, tag: 'p', text: 'x' })],
        });
        resolveInheritance(root);
        expect(root.children[0]?.styles).toEqual({});
    });
    it('survives a page with no elements under the root', () => {
        expect(resolveInheritance(node({ styles: { 'font-family': 'Inter' } })).children).toEqual([]);
    });
    it('reaches the words through a wrapper that later gets collapsed', () => {
        // Inheritance is resolved before the collapse pass for exactly this
        // reason: a wrapper that carries the font and nothing else is
        // removed, and would take the font with it.
        const root = node({
            styles: {},
            children: [
                node({
                    id: 1,
                    styles: { 'font-family': 'Fraunces, serif' },
                    children: [node({ id: 2, tag: 'h1', text: 'headline' })],
                }),
            ],
        });
        const { elements } = reduce(root);
        const heading = Object.values(elements).find((e) => e.type === 'text');
        expect(heading?.fontFamily).toBe('Fraunces, serif');
    });
});
describe('reduceCapture — the shape it produces', () => {
    it('makes the captured root a div, whatever the page called it', () => {
        // The capture's root is `document.body`; a Scamp root is a div.
        const result = reduce(node({ tag: 'body' }));
        expect(result.elements['root']?.tag).toBeUndefined();
        expect(result.rootId).toBe('root');
    });
    it('classifies a tag into the model\'s four element types', () => {
        const result = reduce(node({
            children: [
                node({ tag: 'h1', text: 'Title' }),
                node({ tag: 'img', attrs: { src: 'https://x/a.png', alt: 'A' } }),
                node({ tag: 'input', attrs: { type: 'text' } }),
                node({ tag: 'section' }),
            ],
        }));
        const types = Object.values(result.elements)
            .filter((e) => e.id !== 'root')
            .map((e) => e.type);
        expect(types).toEqual(['text', 'image', 'input', 'rectangle']);
    });
    it('carries an image\'s src and alt into the typed fields', () => {
        const result = reduce(node({ children: [node({ tag: 'img', attrs: { src: 'https://x/a.png', alt: 'A cat' } })] }));
        const img = Object.values(result.elements).find((e) => e.type === 'image');
        expect(img?.src).toBe('https://x/a.png');
        expect(img?.alt).toBe('A cat');
        // …and not also in the attribute bag, which would emit them twice.
        expect(img?.attributes?.['src']).toBeUndefined();
    });
    it('names classes for what the element is, not what the DOM called it', () => {
        const result = reduce(node({ children: [node({ tag: 'nav' }), node({ tag: 'h1', text: 'x' })] }));
        const names = Object.values(result.elements)
            .filter((e) => e.id !== 'root')
            .map((e) => e.name);
        expect(names).toEqual(['nav', 'title']);
    });
});
describe('reduceCapture — a computed value is not a decision', () => {
    it('drops a width the element got for free, and stretches instead', () => {
        // Same width as its parent: it was filling, and `stretch` reproduces
        // that at any width.
        const child = node({
            tag: 'section',
            rect: { x: 0, y: 0, w: 1200, h: 100 },
            styles: { width: '1200px' },
            children: [node({ tag: 'p', text: 'x', rect: { x: 0, y: 0, w: 1200, h: 100 } })],
        });
        const result = reduce(node({ children: [child] }));
        const el = Object.values(result.elements).find((e) => e.tag === 'section');
        expect(el?.widthMode).toBe('stretch');
    });
    it('keeps a width the element chose, because that one is a decision', () => {
        // Narrower than the space it was given: not filling.
        const child = node({
            tag: 'section',
            rect: { x: 0, y: 0, w: 442, h: 100 },
            styles: { width: '442px' },
            children: [node({ tag: 'p', text: 'x', rect: { x: 0, y: 0, w: 442, h: 100 } })],
        });
        const result = reduce(node({ children: [child] }));
        const el = Object.values(result.elements).find((e) => e.tag === 'section');
        expect(el?.widthMode).toBe('fixed');
    });
    it('keeps every size when the capture carries no geometry', () => {
        // An older payload, or one captured without rects: guessing is worse
        // than being faithful, so nothing is dropped.
        const bare = { ...node({ styles: { width: '442px' } }), rect: undefined };
        const result = reduceCapture(payloadOf({ ...bare, children: [node({ tag: 'p', text: 'x' })] }), {
            randomId: seqIds(),
        });
        expect(result.findings.some((f) => f.kind === 'dropped-computed-size')).toBe(false);
    });
    it('reports each size it dropped, so the report can explain the layout', () => {
        const child = node({
            tag: 'section',
            rect: { x: 0, y: 0, w: 1200, h: 100 },
            styles: { width: '1200px' },
            children: [node({ tag: 'p', text: 'x', rect: { x: 0, y: 0, w: 1200, h: 100 } })],
        });
        const found = reduce(node({ children: [child] })).findings.filter((f) => f.kind === 'dropped-computed-size');
        expect(found).toHaveLength(1);
        expect(found[0]?.detail).toContain('1200px');
    });
    it('keeps a size on a leaf, where an explicit box is usually the point', () => {
        const result = reduce(node({ children: [node({ tag: 'img', styles: { width: '120px', height: '120px' } })] }));
        const img = Object.values(result.elements).find((e) => e.type === 'image');
        expect(img?.widthMode).not.toBe('auto');
        expect(kinds(node({ children: [node({ tag: 'img', styles: { width: '120px' } })] })))
            .not.toContain('dropped-computed-size');
    });
});
describe('reduceCapture — collapsing wrappers', () => {
    it('removes a div that holds one child and decides nothing', () => {
        const result = reduce(node({ children: [node({ tag: 'div', children: [node({ tag: 'nav', styles: { display: 'flex' } })] })] }));
        const tags = Object.values(result.elements).map((e) => e.tag);
        expect(tags).toContain('nav');
        expect(tags.filter((t) => t === 'div')).toHaveLength(0);
    });
    it('collapses a run of nested wrappers down to the thing inside', () => {
        const deep = node({
            children: [
                node({ children: [node({ children: [node({ tag: 'nav', styles: { display: 'flex' } })] })] }),
            ],
        });
        expect(reduce(deep).findings.filter((f) => f.kind === 'collapsed-wrapper')).toHaveLength(2);
    });
    it('keeps a wrapper that centres its child, which is real work', () => {
        const result = reduce(node({ children: [node({ styles: { display: 'flex' }, children: [node({ tag: 'p', text: 'x' })] })] }));
        expect(kinds(node({ children: [node({ styles: { display: 'flex' }, children: [node({ tag: 'p', text: 'x' })] })] })))
            .not.toContain('collapsed-wrapper');
        expect(Object.keys(result.elements)).toHaveLength(3);
    });
    it.each([
        ['a background', { 'background-color': 'rgb(1, 2, 3)' }],
        ['padding', { 'padding-top': '16px' }],
        ['a border', { 'border-top-width': '1px' }],
        ['a radius', { 'border-top-left-radius': '8px' }],
        ['a position', { position: 'sticky' }],
        ['a max-width', { 'max-width': '1200px' }],
    ])('keeps a wrapper that has %s', (_label, styles) => {
        const tree = node({ children: [node({ styles, children: [node({ tag: 'p', text: 'x' })] })] });
        expect(kinds(tree)).not.toContain('collapsed-wrapper');
    });
    it('never collapses a wrapper with two children, however plain', () => {
        const tree = node({
            children: [node({ children: [node({ tag: 'p', text: 'a' }), node({ tag: 'p', text: 'b' })] })],
        });
        expect(kinds(tree)).not.toContain('collapsed-wrapper');
    });
    it('keeps a non-div wrapper, because its tag is meaning', () => {
        const tree = node({ children: [node({ tag: 'main', children: [node({ tag: 'p', text: 'x' })] })] });
        expect(kinds(tree)).not.toContain('collapsed-wrapper');
    });
});
describe('reduceCapture — text', () => {
    it('keeps text on a text element that has no element children', () => {
        const result = reduce(node({ children: [node({ tag: 'p', text: 'Hello' })] }));
        const text = Object.values(result.elements).find((e) => e.type === 'text');
        expect(text?.text).toBe('Hello');
    });
    it('lifts text out of a container that also has element children', () => {
        // Scamp's rule: words live in a text element, never loose in a box.
        const result = reduce(node({ children: [node({ tag: 'div', text: 'Loose words', children: [node({ tag: 'p', text: 'Child' })] })] }));
        const texts = Object.values(result.elements).filter((e) => e.type === 'text');
        expect(texts.map((t) => t.text).sort()).toEqual(['Child', 'Loose words']);
        expect(kinds(node({ children: [node({ tag: 'div', text: 'Loose', children: [node({ tag: 'p', text: 'c' })] })] })))
            .toContain('wrapped-bare-text');
    });
});
describe('reduceCapture — inline content stays inline', () => {
    const para = (inline) => node({
        children: [
            node({ tag: 'p', rect: { x: 0, y: 0, w: 400, h: 20 }, inline, text: null }),
        ],
    });
    it('keeps a leading text run as the element\'s own text', () => {
        const result = reduce(para([
            { kind: 'text', value: 'Ship ' },
            { kind: 'markup', source: '<strong>faster</strong>' },
        ]));
        const p = Object.values(result.elements).find((e) => e.type === 'text');
        expect(p?.text).toBe('Ship');
    });
    it('turns the markup into fragments rather than elements', () => {
        const result = reduce(para([
            { kind: 'text', value: 'Ship ' },
            { kind: 'markup', source: '<strong>faster</strong>' },
            { kind: 'text', value: ' today' },
        ]));
        // One paragraph, not a paragraph plus a box for the <strong>.
        expect(Object.keys(result.elements)).toHaveLength(2);
        const p = Object.values(result.elements).find((e) => e.type === 'text');
        expect(p?.inlineFragments).toEqual([
            { kind: 'jsx', source: '<strong>faster</strong>', afterChildIndex: -1 },
            { kind: 'text', value: ' today', afterChildIndex: -1 },
        ]);
    });
    it('handles a run that opens with markup, leaving text null', () => {
        const result = reduce(para([
            { kind: 'markup', source: '<em>New</em>' },
            { kind: 'text', value: ' in beta' },
        ]));
        const p = Object.values(result.elements).find((e) => e.type === 'text');
        expect(p?.text).toBeUndefined();
        expect(p?.inlineFragments).toHaveLength(2);
    });
    it('reports it, because the markup is no longer selectable on canvas', () => {
        expect(kinds(para([{ kind: 'markup', source: '<b>x</b>' }]))).toContain('inline-kept');
    });
    it('emits fragments as JSX that parses back to the same tree', () => {
        const elements = reduce(para([
            { kind: 'text', value: 'Read the ' },
            { kind: 'markup', source: '<a href="/docs">docs</a>' },
        ])).elements;
        const out = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'M',
            cssModuleImportName: 'M',
            isComponent: true,
        });
        expect(out.tsx).toContain('<a href="/docs">docs</a>');
        const back = parseCode(out.tsx, out.css, { isComponent: true });
        expect(Object.keys(back.elements)).toHaveLength(Object.keys(elements).length);
    });
});
describe('reduceCapture — inline SVG', () => {
    const withSvg = (svgSource) => node({
        children: [
            node({
                tag: 'svg',
                attrs: { viewBox: '0 0 24 24' },
                svgSource,
                rect: { x: 0, y: 0, w: 24, h: 24 },
            }),
        ],
    });
    it('carries the icon\'s markup instead of an empty box', () => {
        const result = reduce(withSvg('<path d="M1 2L3 4"/>'));
        const svg = Object.values(result.elements).find((e) => e.tag === 'svg');
        expect(svg?.svgSource).toBe('<path d="M1 2L3 4"/>');
        expect(svg?.name).toBe('icon');
    });
    it('emits it verbatim, and it parses back', () => {
        const inner = '<path d="M1 2L3 4" stroke="currentColor"/><circle cx="5" cy="5" r="2"/>';
        const { elements } = reduce(withSvg(inner));
        const out = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'S',
            cssModuleImportName: 'S',
            isComponent: true,
        });
        expect(out.tsx).toContain(inner);
        expect(out.tsx).toContain('viewBox="0 0 24 24"');
        const back = parseCode(out.tsx, out.css, { isComponent: true });
        const svg = Object.values(back.elements).find((e) => e.tag === 'svg');
        expect(svg?.svgSource).toContain('circle');
    });
    it('still reports it, because an icon is not editable as elements', () => {
        const tree = node({
            children: [
                node({
                    tag: 'svg',
                    svgSource: '<path/>',
                    notes: [{ kind: 'svg', at: 'svg' }],
                    rect: { x: 0, y: 0, w: 24, h: 24 },
                }),
            ],
        });
        expect(kinds(tree)).toContain('svg');
    });
});
describe('applyBreakpointCaptures', () => {
    const at = (w, styles, children = []) => node({
        tag: 'section',
        path: 'body>section:0',
        rect: { x: 0, y: 0, w, h: 100 },
        styles,
        children,
    });
    const payloadFor = (child) => payloadOf(node({ path: 'body', children: [child] }));
    it('never turns a translated block container back into display:none', () => {
        // The base capture's `display: block` becomes flex here; the narrow
        // capture says `block` too. Diffing the raw narrow value against the
        // translated base reported a difference, and Scamp's "not a layout
        // container" sentinel IS the string `none` — so every block
        // container on the page vanished at tablet. A blank canvas, from a
        // diff measuring its own work.
        const base = reduceCapture(payloadFor(at(1200, { display: 'block' }, [node({ tag: 'p', text: 'x' })])), { randomId: seqIds() });
        const narrow = payloadFor(at(700, { display: 'block' }, [node({ tag: 'p', text: 'x' })]));
        const merged = applyBreakpointCaptures(base, [{ breakpointId: 'tablet', payload: narrow }]);
        for (const el of Object.values(merged.elements)) {
            expect(el.breakpointOverrides?.['tablet']?.display).toBeUndefined();
        }
    });
    it('reads a real difference as an override', () => {
        const base = reduceCapture(payloadFor(at(1200, { display: 'flex', 'font-size': '56px' })), { randomId: seqIds() });
        const narrow = payloadFor(at(700, { display: 'flex', 'font-size': '32px' }));
        const merged = applyBreakpointCaptures(base, [{ breakpointId: 'tablet', payload: narrow }]);
        const section = Object.values(merged.elements).find((e) => e.tag === 'section');
        expect(section?.breakpointOverrides?.['tablet']?.fontSize).toBe('32px');
    });
    it('writes nothing when the width changed nothing', () => {
        const styles = { display: 'flex', 'font-size': '18px' };
        const base = reduceCapture(payloadFor(at(1200, styles)), { randomId: seqIds() });
        const merged = applyBreakpointCaptures(base, [
            { breakpointId: 'tablet', payload: payloadFor(at(700, styles)) },
        ]);
        expect(Object.values(merged.elements).some((e) => e.breakpointOverrides !== undefined)).toBe(false);
    });
    it('reports an element that is absent at the narrower width', () => {
        // A path that does not match means the element is not there, which
        // is an absence rather than an override — and Scamp has no way to
        // say "hidden below 768px".
        const base = reduceCapture(payloadFor(at(1200, { display: 'flex' })), {
            randomId: seqIds(),
        });
        const merged = applyBreakpointCaptures(base, [
            { breakpointId: 'tablet', payload: payloadOf(node({ path: 'body', children: [] })) },
        ]);
        expect(merged.findings.map((f) => f.kind)).toContain('breakpoint-absent');
    });
    it('leaves the base alone when there are no narrower captures', () => {
        const base = reduceCapture(payloadFor(at(1200, { display: 'flex' })), {
            randomId: seqIds(),
        });
        expect(applyBreakpointCaptures(base, []).elements).toEqual(base.elements);
    });
    it('ignores measured width and height, which every width re-measures', () => {
        const base = reduceCapture(payloadFor(at(1200, { display: 'flex', width: '1200px' })), { randomId: seqIds() });
        const merged = applyBreakpointCaptures(base, [
            { breakpointId: 'tablet', payload: payloadFor(at(700, { display: 'flex', width: '700px' })) },
        ]);
        expect(Object.values(merged.elements).some((e) => e.breakpointOverrides !== undefined)).toBe(false);
    });
});
describe('reduceCapture — reporting', () => {
    it('carries every capture note through as a finding', () => {
        const tree = node({
            notes: [{ kind: 'pseudo-element', at: 'div::before', detail: '"★"' }],
            children: [node({ tag: 'canvas', notes: [{ kind: 'canvas', at: 'canvas' }] })],
        });
        expect(kinds(tree)).toEqual(expect.arrayContaining(['pseudo-element', 'canvas']));
    });
    it('reports a display the model has no equivalent for', () => {
        expect(kinds(node({ styles: { display: 'table' } }))).toContain('unsupported-display');
    });
    it('includes whole-page notes, like a cap being hit', () => {
        const result = reduceCapture(payloadOf(node({}), { notes: [{ kind: 'node-capped', detail: '4000' }] }), { randomId: seqIds() });
        expect(result.findings.map((f) => f.kind)).toContain('node-capped');
    });
});
describe('reduceCapture — unhappy paths', () => {
    it('refuses a payload from a different contract version', () => {
        const stale = { ...payloadOf(node({})), version: 99 };
        expect(() => reduceCapture(stale)).toThrow(/version 99/);
    });
    it('reduces an empty page to a lone root', () => {
        const result = reduce(node({}));
        expect(Object.keys(result.elements)).toEqual(['root']);
    });
    it('survives a page that is one unsupported element', () => {
        const result = reduce(node({ children: [node({ tag: 'canvas', notes: [{ kind: 'canvas' }] })] }));
        expect(Object.keys(result.elements)).toHaveLength(2);
    });
    it('handles a deeply nested chain without losing the leaf', () => {
        let tree = node({ tag: 'p', text: 'bottom' });
        for (let i = 0; i < 40; i += 1)
            tree = node({ styles: { display: 'flex' }, children: [tree] });
        const result = reduce(node({ children: [tree] }));
        const texts = Object.values(result.elements).filter((e) => e.type === 'text');
        expect(texts[0]?.text).toBe('bottom');
    });
    it('gives every element a unique id', () => {
        const result = reduce(node({ children: Array.from({ length: 50 }, () => node({ tag: 'p', text: 'x' })) }));
        const ids = Object.values(result.elements).map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
describe('viewNameFromTitle', () => {
    it.each([
        ['Northwind — Ship faster', 'NorthwindShipFaster'],
        ['about us', 'AboutUs'],
        ['A Very Long Page Title That Goes On', 'AVeryLong'],
        ['', 'Imported'],
        ['   ', 'Imported'],
        ['!!!', 'Imported'],
        ['404', 'Imported404'],
    ])('turns %j into %j', (title, expected) => {
        expect(viewNameFromTitle(title)).toBe(expected);
    });
});
describe('against a page captured from a real browser', () => {
    const payload = JSON.parse(readFileSync('test/fixtures/import/payloads/marketing.json', 'utf-8'));
    it('is the contract version this build reads', () => {
        // A stale fixture should fail here, loudly, not somewhere subtle.
        expect(payload.version).toBe(CAPTURE_VERSION);
    });
    it('lets a container that was filling keep filling', () => {
        // Not "never pins a width" — a width the page chose is a decision,
        // and dropping those measured 20 points worse. What must hold is
        // that the ones which were merely filling come back as stretch.
        const result = reduceCapture(payload, { randomId: seqIds() });
        const stretched = Object.values(result.elements).filter((el) => el.childIds.length > 0 && el.widthMode === 'stretch');
        expect(stretched.length).toBeGreaterThan(0);
    });
    it('produces a tree that generates and re-parses', () => {
        // The real contract: whatever comes out has to survive the pipeline
        // every other part of Scamp puts an element tree through.
        const result = reduceCapture(payload, { randomId: seqIds() });
        const { tsx, css } = generateCode({
            elements: result.elements,
            rootId: result.rootId,
            pageName: result.suggestedName,
            cssModuleImportName: result.suggestedName,
            isComponent: true,
        });
        const back = parseCode(tsx, css, { isComponent: true });
        expect(Object.keys(back.elements)).toHaveLength(Object.keys(result.elements).length);
        expect(tsx).not.toContain('<body');
        expect(tsx).toContain('data-scamp-id="root"');
    });
    it('paints an icon the colour the page painted it', () => {
        // Most pages colour an icon with a CSS rule, not an attribute, and
        // `fill` was not captured at all — so every icon arrived with no
        // fill and rendered in the initial black, on a dark page.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const icons = Object.values(elements).filter((e) => e.tag === 'svg');
        expect(icons.length).toBeGreaterThanOrEqual(2);
        // Kept as written where the paint IS the text colour: that is what
        // the page meant, and it keeps the icon following its surroundings.
        expect(icons.some((i) => i.fill === 'currentColor')).toBe(true);
    });
    it('leaves an icon with a colour of its own alone', () => {
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const fixed = Object.values(elements).find((e) => e.name === 'icon_fixed');
        expect(fixed?.fill).toBe('rgb(217, 179, 106)');
        expect(fixed?.fill).not.toBe('currentColor');
    });
    it('brings gradient text across whole, or it is invisible', () => {
        // The background is clipped to the glyphs and the text is painted
        // transparent. Capture the transparency without the clip — which is
        // what happened — and the headline simply cannot be seen.
        const { elements, rootId } = reduceCapture(payload, { randomId: seqIds() });
        const title = Object.values(elements).find((e) => e.text === 'Painted by a gradient');
        const { css } = generateCode({
            elements,
            rootId,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        const rule = css.match(new RegExp(`\\.${title?.name}_${title?.id}\\s*\\{[^}]*\\}`))?.[0] ?? '';
        expect(rule).toContain('background-clip: text');
        // `transparent` computes to its rgba form, which is what a
        // stylesheet reader gets back.
        expect(rule).toContain('-webkit-text-fill-color: rgba(0, 0, 0, 0)');
        expect(rule).toContain('linear-gradient');
    });
    it('does not put a text-fill colour on everything that never set one', () => {
        // It resolves to the element's own `color` wherever it is unset, so
        // keeping it unconditionally would double up every colour on the page.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const withFill = Object.values(elements).filter((e) => e.customProperties['-webkit-text-fill-color'] !== undefined);
        expect(withFill).toHaveLength(1);
    });
    it('keeps a link to the same site relative, not pointed back at it', () => {
        // Resolved absolute, every nav item walks the user out of the
        // project and back onto the page it was copied from.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const hrefs = Object.values(elements)
            .map((e) => e.attributes?.['href'])
            .filter((h) => typeof h === 'string');
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs.every((h) => !h.startsWith('file://'))).toBe(true);
        expect(hrefs).toContain('/product');
    });
    it('keeps the page exactly as it was, beside what it became', () => {
        // The reduction is lossy by design, so the original is the only
        // record of what the page actually said.
        // see docs/notes/import-source-store.md
        const source = payload.source;
        expect(source?.html).toContain('<h1>Ship the');
        expect(source?.css).toContain('.hero h1');
        // A local fixture has no cross-origin sheets and is nowhere near
        // the cap, so both of these say "nothing went missing".
        expect(source?.unreadable).toEqual([]);
        expect(source?.truncated).toBe(false);
    });
    it('keeps an icon in front of the words it labels', () => {
        // `<h3 class="with-icon"><span class="ico">★</span>Icon before the
        // words</h3>` — a flex host, so the span is a child rather than
        // markup, and the heading's own words are lifted into a sibling.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const words = Object.values(elements).find((e) => e.text === 'Icon before the words');
        const host = Object.values(elements).find((e) => e.id === words?.parentId);
        expect((host?.childIds ?? []).map((id) => elements[id]?.text)).toEqual([
            '★',
            'Icon before the words',
        ]);
    });
    it('keeps the words in a div that is nothing but words', () => {
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const words = Object.values(elements).find((e) => e.text === 'A box whose only content is words.');
        expect(words?.type).toBe('text');
        expect(words?.tag).toBe('div');
    });
    it('reads an inline-flex row as a layout parent, so it does not collapse', () => {
        // Its children would otherwise take Scamp's tree-shape default of
        // `position: absolute`, drop out of flow, and leave the row 0 tall.
        const { elements, rootId } = reduceCapture(payload, { randomId: seqIds() });
        const chip = Object.values(elements).find((e) => e.customProperties['display'] === 'inline-flex');
        const { css } = generateCode({
            elements,
            rootId,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        const childId = chip?.childIds[0] ?? '';
        const child = elements[childId];
        const rule = css.match(new RegExp(`\\.${child?.name}_${childId}\\s*\\{[^}]*\\}`))?.[0] ?? '';
        expect(rule).not.toContain('position: absolute');
    });
    it('converts a content-box measurement into the border-box Scamp renders', () => {
        // 200x40 of content plus 16px of padding each side and a 2px
        // border is 236x68 once Scamp's own `border-box` reset applies.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const box = Object.values(elements).find((e) => e.text === 'Measured in content-box');
        expect(box?.widthValue).toBe(236);
        expect(box?.heightValue).toBe(68);
    });
    it('makes the legal paragraph a container, not a text element', () => {
        // `<p class="legal">Ships with a warranty<em class="fineprint">…</em></p>`
        // — the shape that drew nothing on the canvas while appearing in
        // both the layers panel and the code.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const em = Object.values(elements).find((e) => (e.text ?? '').startsWith('Terms apply'));
        const host = Object.values(elements).find((e) => e.id === em?.parentId);
        expect(host?.tag).toBe('p');
        expect(host?.type).toBe('rectangle');
        expect(host?.name).not.toBe('text');
        expect(host?.childIds).toHaveLength(2);
    });
    it('gives the block-level <em> inside it a display it can keep', () => {
        // Its `display: block` is what separates the small print from the
        // line above; without it the two ran together.
        const { elements, rootId } = reduceCapture(payload, { randomId: seqIds() });
        const em = Object.values(elements).find((e) => (e.text ?? '').startsWith('Terms apply'));
        const { css } = generateCode({
            elements,
            rootId,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        const block = css.match(new RegExp(`\\.${em?.name}_${em?.id}\\s*\\{[^}]*\\}`))?.[0] ?? '';
        expect(block).toContain('display: block;');
        expect(block).toContain('font-size: 10px;');
    });
    it('brings a wordmark across in all its parts', () => {
        // `<span class="brand"><span>North</span><b>wind</b><sup>®</sup></span>`
        // — a flex span. Read as running text it collapsed to one bare
        // `<span>North</span>`, losing two thirds of the mark.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const parts = ['North', 'wind', '®'].map((t) => Object.values(elements).find((e) => e.text === t));
        expect(parts.map((e) => e?.type)).toEqual(['text', 'text', 'text']);
    });
    it('gives each part of it the type it was rendered in', () => {
        // A rectangle carries no text, so `<b>` and `<sup>` used to be
        // emitted as empty tags; as text elements they each keep their own
        // size, weight and colour rather than one shared guess.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const bold = Object.values(elements).find((e) => e.text === 'wind');
        const sup = Object.values(elements).find((e) => e.text === '®');
        expect(bold?.color).toBe('rgb(45, 74, 124)');
        expect(sup?.fontSize).toBe('10px');
        expect(bold?.fontSize).toBe('18px');
    });
    it('keeps the tag each part was written with', () => {
        const { elements, rootId } = reduceCapture(payload, { randomId: seqIds() });
        const { tsx } = generateCode({
            elements,
            rootId,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        expect(tsx).toMatch(/<b [^>]*>wind<\/b>/);
        expect(tsx).toMatch(/<sup [^>]*>®<\/sup>/);
    });
    it('generates a page that does not rewrite itself on the first save', () => {
        // The invariant that matters most for an import: what Scamp writes
        // has to survive being read back. It did not. A tag with element
        // children and no text of its own parses as a RECTANGLE, and a
        // rectangle carries no typography — so a heading whose words had
        // moved into spans was written with `font-size: 56px` once and
        // regenerated without it, falling back to 16px on the next save.
        const { elements, rootId } = reduceCapture(payload, { randomId: seqIds() });
        const once = generateCode({
            elements,
            rootId,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        const back = parseCode(once.tsx, once.css);
        const twice = generateCode({
            elements: back.elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'P',
            cssModuleImportName: 'P',
            isComponent: true,
        });
        expect(twice.tsx).toBe(once.tsx);
        // The root gains the page default on the way back through, which
        // is generator behaviour rather than anything the import decided.
        expect(twice.css.replace('  min-height: 100vh;\n', '')).toBe(once.css.replace('  min-height: 100vh;\n', ''));
    });
    it('puts the type on the words as well as the box around them', () => {
        // The container keeps what the page declared — it sets the line box
        // its inline children sit in, and stripping it made a paragraph
        // seven pixels taller than the one it copied.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const word = Object.values(elements).find((e) => e.text === 'Ship the');
        expect(word?.fontSize).toBe('56px');
        const host = Object.values(elements).find((e) => e.id === word?.parentId);
        expect(host?.fontSize).toBe('56px');
    });
    it('brings the heading\'s highlighted word in as an element', () => {
        // `.mark` is a span whose entire appearance is in the stylesheet:
        // background, colour, padding, radius, inline-block. Emitted as a
        // bare `<span>` it kept none of it.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const mark = Object.values(elements).find((e) => e.text === 'thing');
        expect(mark?.backgroundColor).toBe('rgb(217, 232, 255)');
        expect(mark?.color).toBe('rgb(22, 34, 58)');
        expect(mark?.customProperties['display']).toBe('inline-block');
        expect(mark?.position).toBe('static');
    });
    it('leaves a span that carries nothing of its own as inline markup', () => {
        // `.plain-span` adds no appearance, so a bare `<span>` loses
        // nothing — and making an element of it would be noise in the tree.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const sources = Object.values(elements)
            .flatMap((e) => e.inlineFragments)
            .map((f) => ('source' in f ? f.source : ''));
        expect(sources).toContain('<span>actually</span>');
        expect(Object.values(elements).some((e) => e.text === 'actually')).toBe(false);
    });
    it('keeps the heading\'s own words around it, in order', () => {
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const mark = Object.values(elements).find((e) => e.text === 'thing');
        const host = Object.values(elements).find((e) => e.id === mark?.parentId);
        expect((host?.childIds ?? []).map((id) => elements[id]?.text)).toEqual([
            'Ship the',
            'thing',
            'you',
            'designed',
        ]);
    });
    it('recovers the page\'s decorative glyph as a real text element', () => {
        // `.badge::before { content: "★" }`. It used to be reported as a
        // loss; it is now an element you can see and edit.
        const result = reduceCapture(payload, { randomId: seqIds() });
        expect(result.findings.filter((f) => f.kind === 'pseudo-element')).toHaveLength(0);
        const star = Object.values(result.elements).find((e) => e.text === '★');
        expect(star?.type).toBe('text');
        expect(result.findings.filter((f) => f.kind === 'pseudo-materialized')).toHaveLength(1);
    });
    it('keeps the glyph\'s own styling, not just its character', () => {
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const star = Object.values(elements).find((e) => e.text === '★');
        // `margin-right: 6px` is what holds it off the words beside it, and
        // the colour is the whole point of a gold star.
        expect(star?.margin).toEqual([0, 6, 0, 0]);
        expect(star?.color).toBe('rgb(217, 179, 106)');
    });
    it('puts the glyph in front of the words it belongs to', () => {
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const star = Object.values(elements).find((e) => e.text === '★');
        const host = Object.values(elements).find((e) => e.id === star?.parentId);
        expect(host?.childIds[0]).toBe(star?.id);
        // The badge's own text moved into a sibling rather than staying on
        // the host, which is what makes that order possible.
        const words = elements[host?.childIds[1] ?? ''];
        expect(words?.text).toContain('No credit card');
    });
    it('gives the recovered glyph a box that fits it', () => {
        // Nothing measures a pseudo-element, so without an explicit size it
        // lands on the model's 100x100 default.
        const { elements } = reduceCapture(payload, { randomId: seqIds() });
        const star = Object.values(elements).find((e) => e.text === '★');
        expect(star?.widthMode).toBe('auto');
        expect(star?.heightMode).toBe('auto');
    });
    it('collapses the page\'s empty wrappers and keeps its real ones', () => {
        const result = reduceCapture(payload, { randomId: seqIds() });
        // `.nav-outer` / `.nav-mid` contribute nothing; `.nav` and `.hero` do.
        expect(result.findings.filter((f) => f.kind === 'collapsed-wrapper').length).toBeGreaterThan(0);
        const names = Object.values(result.elements).map((e) => e.name);
        // Named by the page's own words rather than by the tag: `.hero` is
        // a `<header>` and `.card` an `<article>`, and the layers panel
        // now says what the page called them.
        expect(names).toContain('nav');
        expect(names).toContain('hero');
        expect(names).toContain('card');
    });
    it('takes the page\'s word for what things are', () => {
        // `box_0090` and `label_00a5` describe nothing. Every one of these
        // is a class the page itself wrote.
        const names = Object.values(reduceCapture(payload, { randomId: seqIds() }).elements).map((e) => e.name);
        for (const want of ['brand', 'nav_links', 'eyebrow', 'features', 'badge', 'legal']) {
            expect(names).toContain(want);
        }
    });
    it('ignores a class that reads like a hash or a utility', () => {
        // The fixture's `.mark` is a name; a `css-182dboe` or a `px-4`
        // would say less than the tag does, and those are left alone.
        const names = Object.values(reduceCapture(payload, { randomId: seqIds() }).elements).map((e) => e.name ?? '');
        expect(names.every((n) => !/^css[-_]/.test(n))).toBe(true);
        expect(names.every((n) => !/\d$/.test(n))).toBe(true);
    });
    it('names the view after the page', () => {
        expect(reduceCapture(payload, { randomId: seqIds() }).suggestedName).toBe('NorthwindShipFaster');
    });
});
describe('whitespace around an inline span', () => {
    /**
     * `works <span>alongside</span> AI.` imports as `worksalongsideAI.`
     * The two text runs are `"…works "` and `" AI."`, and both boundary
     * spaces live there.
     *
     * **These are KNOWN GAPS, asserted to fail.** The reducer computes the
     * right value; `makeBaseline` then trims every text element, because
     * the model has nowhere to keep a leading or trailing space and the
     * generateCode ↔ parseCode round trip depends on that. Fixing it is a
     * change to the two core functions, planned in
     * `docs/plans/inline-spans-plan.md`.
     *
     * The same convention as the parity harness's `knownGap`: the suite
     * stays green while the divergence is recorded, and the day someone
     * fixes it these flip to failing and have to be updated.
     * see docs/notes/parity-harness.md
     */
    const gradientSpan = (id, text) => node({
        id,
        tag: 'span',
        styles: {
            display: 'inline',
            'background-image': 'linear-gradient(90deg, red, blue)',
        },
        text,
    });
    const heading = (inline) => node({
        id: 1,
        tag: 'div',
        children: [
            node({
                id: 2,
                tag: 'h1',
                styles: { display: 'block', 'font-size': '48px' },
                inline,
            }),
        ],
    });
    /** Every element's text, joined, so a missing space is visible. */
    const textOf = (root) => Object.values(reduce(root).elements)
        .map((el) => el.text)
        .filter((t) => typeof t === 'string' && t.length > 0)
        .join('|');
    it.fails('keeps the space before and after a styled span', () => {
        const joined = textOf(heading([
            { kind: 'text', value: 'An AI studio for what works ' },
            { kind: 'element', node: gradientSpan(3, 'alongside') },
            { kind: 'text', value: ' AI.' },
        ]));
        expect(joined).toContain('works ');
        expect(joined).toContain(' AI.');
    });
    it('trims the outer edges, which is what a line box does', () => {
        const joined = textOf(heading([
            { kind: 'text', value: '  leading ' },
            { kind: 'element', node: gradientSpan(3, 'x') },
            { kind: 'text', value: ' trailing  ' },
        ]));
        expect(joined).not.toContain('|  leading');
        expect(joined.endsWith(' ')).toBe(false);
    });
    it.fails('keeps a run that is only a space between two elements', () => {
        // `<b>a</b> <i>b</i>` — the gap IS the content, and dropping it
        // joins the two words.
        const joined = textOf(heading([
            { kind: 'element', node: gradientSpan(3, 'one') },
            { kind: 'text', value: ' ' },
            { kind: 'element', node: gradientSpan(4, 'two') },
        ]));
        expect(joined).toContain(' ');
    });
    it.fails('collapses a run of whitespace to a single space', () => {
        const joined = textOf(heading([
            { kind: 'text', value: 'a   \n  b ' },
            { kind: 'element', node: gradientSpan(3, 'x') },
        ]));
        expect(joined).toContain('a b ');
    });
});

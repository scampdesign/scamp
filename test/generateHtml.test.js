import { describe, it, expect } from 'vitest';
import { collectExpandedInstances, generateHtml, jsxTextToHtml, renderDocument, } from '@lib/generateHtml';
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
const makeEl = (id, overrides = {}) => ({
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
const asMap = (els) => Object.fromEntries(els.map((el) => [el.id, el]));
const render = (els, options = {}) => generateHtml(asMap(els), ROOT_ELEMENT_ID, {
    componentTrees: {},
    ...options,
});
/**
 * A component whose root holds one prop-bound text element.
 * `label` defaults to "Home" — the value `generateTsx` would write into the
 * function signature.
 */
const sidebarRow = () => ({
    rootId: ROOT_ELEMENT_ID,
    elements: asMap([
        makeRoot(['d3e4']),
        makeEl('d3e4', {
            type: 'text',
            name: 'label',
            prop: 'label',
            text: 'Home',
        }),
    ]),
});
const instance = (id, instanceId, overrides = {}) => makeEl(id, {
    type: 'component-instance',
    componentName: 'SidebarRow',
    instanceId,
    // Matches `makeComponentInstance`: an instance has no intrinsic size,
    // the rendered component's root sets the box. Without this the fixture
    // carries the generic fixed 100px default, which no real instance has.
    widthMode: 'auto',
    heightMode: 'auto',
    ...overrides,
});
describe('generateHtml — plain elements', () => {
    it('emits nested elements with class names matching classNameFor', () => {
        const html = render([
            makeRoot(['a1b2']),
            makeEl('a1b2', { name: 'Hero Card', childIds: ['c3d4'] }),
            makeEl('c3d4', { parentId: 'a1b2', type: 'text', text: 'Hello' }),
        ]);
        expect(html).toContain('<div class="root"');
        expect(html).toContain('<div class="hero_card_a1b2"');
        expect(html).toContain('<p class="text_c3d4">Hello</p>');
    });
    it('emits class= rather than the JSX className={styles.x} form', () => {
        const html = render([makeRoot([])]);
        expect(html).toContain('class="root"');
        expect(html).not.toContain('className');
        expect(html).not.toContain('styles.');
    });
    it('closes an empty non-void element rather than self-closing it', () => {
        // `<div />` is valid JSX and invalid HTML — a browser treats it as an
        // unclosed open tag and swallows the rest of the document.
        const html = render([makeRoot(['a1b2']), makeEl('a1b2')]);
        expect(html).toContain('<div class="rect_a1b2"></div>');
        expect(html).not.toContain('<div class="rect_a1b2" />');
    });
    it('self-closes void elements', () => {
        const html = render([
            makeRoot(['i1']),
            makeEl('i1', { type: 'image', src: '/assets/hero.webp', alt: 'Hero' }),
        ]);
        expect(html).toContain('<img class="img_i1" src="/assets/hero.webp" alt="Hero" />');
    });
    it('escapes text content', () => {
        const html = render([
            makeRoot(['t1']),
            makeEl('t1', { type: 'text', text: 'Fish & <chips> "today"' }),
        ]);
        expect(html).toContain('Fish &amp; &lt;chips&gt; &quot;today&quot;');
        expect(html).not.toContain('<chips>');
    });
    it('escapes attribute values', () => {
        const html = render([
            makeRoot(['a1']),
            makeEl('a1', { tag: 'a', attributes: { title: 'a "quoted" title' } }),
        ]);
        expect(html).toContain('title="a &quot;quoted&quot; title"');
    });
    it('strips editor bookkeeping attributes', () => {
        const html = render([
            makeRoot(['s1']),
            makeEl('s1', {
                tag: 'svg',
                svgSource: '<path d="M0 0" />',
                attributes: { 'data-scamp-svg-src': 'assets/icon.svg', role: 'img' },
            }),
        ]);
        expect(html).not.toContain('data-scamp');
        expect(html).toContain('role="img"');
    });
    it('emits select options as real children', () => {
        const html = render([
            makeRoot(['s1']),
            makeEl('s1', {
                tag: 'select',
                selectOptions: [
                    { value: 'a', label: 'Apple' },
                    { value: 'b', label: 'Banana', selected: true },
                ],
            }),
        ]);
        expect(html).toContain('<option value="a">Apple</option>');
        expect(html).toContain('<option value="b" selected>Banana</option>');
    });
    it('returns an empty string when the root is missing', () => {
        expect(generateHtml({}, ROOT_ELEMENT_ID, { componentTrees: {} })).toBe('');
    });
});
describe('generateHtml — inline fragments', () => {
    it('keeps captured markup fragments', () => {
        const html = render([
            makeRoot(['t1']),
            makeEl('t1', {
                childIds: ['t2'],
                inlineFragments: [
                    { kind: 'jsx', source: '<span>badge</span>', afterChildIndex: -1 },
                ],
            }),
            makeEl('t2', { parentId: 't1' }),
        ]);
        expect(html).toContain('<span>badge</span>');
    });
    it('does not print JSX comments captured between children', () => {
        const html = render([
            makeRoot(['t1', 't2']),
            makeEl('t1'),
            makeEl('t2'),
        ].map((el, i) => (i === 0 ? { ...el, inlineFragments: [
                { kind: 'text', value: '\n  {/* ── Hero ── */}\n  ', afterChildIndex: 0 },
            ] } : el)));
        expect(html).not.toContain('Hero');
        expect(html).not.toContain('{/*');
    });
    it('drops brace expressions, which a browser would show as literal text', () => {
        const html = render([
            makeRoot(['t1']),
            makeEl('t1', {
                childIds: ['t2'],
                inlineFragments: [
                    { kind: 'jsx', source: '{count}', afterChildIndex: -1 },
                ],
            }),
            makeEl('t2', { parentId: 't1' }),
        ]);
        expect(html).not.toContain('{count}');
    });
});
describe('jsxTextToHtml', () => {
    it('renders a JSX comment as nothing, the way React does', () => {
        // Regression: agent-written pages use `{/* ── Hero ── */}` dividers
        // between sections, and the exporter printed them on the page.
        expect(jsxTextToHtml('{/* ── Hero ─────────── */}')).toBeNull();
    });
    it('drops a comment surrounded by the indentation it sat in', () => {
        expect(jsxTextToHtml('\n      \n\n      {/* ── Nav ── */}\n      \n      ')).toBeNull();
    });
    it('drops whitespace that spans a newline, as JSX does', () => {
        expect(jsxTextToHtml('\n        ')).toBeNull();
    });
    it('keeps real text', () => {
        expect(jsxTextToHtml('Hello there')).toBe('Hello there');
    });
    it('keeps text that shares a fragment with a comment', () => {
        expect(jsxTextToHtml('{/* label */} Hello')).toBe('Hello');
    });
    it('collapses interior whitespace and newlines to single spaces', () => {
        expect(jsxTextToHtml('one\n   two    three')).toBe('one two three');
    });
    it('handles multiple comments in one fragment', () => {
        expect(jsxTextToHtml('{/* a */}{/* b */}')).toBeNull();
    });
    it('leaves a lone brace expression alone — it is not a comment', () => {
        expect(jsxTextToHtml('{count}')).toBe('{count}');
    });
});
describe('generateHtml — component instances', () => {
    const options = { componentTrees: { SidebarRow: sidebarRow() } };
    it('expands an instance into the component element tree', () => {
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024')], options);
        expect(html).not.toContain('SidebarRow');
        expect(html).toContain('class="inst_a024__root"');
        expect(html).toContain('class="inst_a024__label_d3e4"');
    });
    it('applies a prop override to the bound text element', () => {
        const html = render([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', { propOverrides: { label: 'Settings' } }),
        ], options);
        expect(html).toContain('>Settings</p>');
        expect(html).not.toContain('>Home</p>');
    });
    it("falls back to the component's default when the prop is not overridden", () => {
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024')], options);
        expect(html).toContain('>Home</p>');
    });
    it('gives two instances of one component distinct class names', () => {
        // The regression this design exists to prevent: both instances' roots
        // are `.root` inside the component module, so a flattened stylesheet
        // would have them share one rule.
        const html = render([
            makeRoot(['i1', 'i2']),
            instance('i1', 'inst_a024', { propOverrides: { label: 'One' } }),
            instance('i2', 'inst_b135', { propOverrides: { label: 'Two' } }),
        ], options);
        expect(html).toContain('class="inst_a024__root"');
        expect(html).toContain('class="inst_b135__root"');
        expect(html).toContain('>One</p>');
        expect(html).toContain('>Two</p>');
    });
    it('carries the page size class on the root alongside the component class', () => {
        // Mirrors the app, where the component root renders
        // `${styles.root} ${className}` with className coming from the page.
        const html = render([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', {
                widthMode: 'fixed',
                widthValue: DEFAULT_RECT_STYLES.widthValue + 137,
            }),
        ], options);
        expect(html).toContain('class="inst_a024__root inst_a024"');
    });
    it('omits the page size class when the instance has no size of its own', () => {
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024')], options);
        expect(html).toContain('class="inst_a024__root"');
        expect(html).not.toContain('inst_a024__root inst_a024');
    });
    it('emits a comment instead of throwing when the component is missing', () => {
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024')], {
            componentTrees: {},
        });
        expect(html).toContain('missing component SidebarRow');
        expect(html).toContain('<!--');
    });
    it('emits a comment for an instance flagged as a broken reference', () => {
        const html = render([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', { missingComponent: true }),
        ], options);
        expect(html).toContain('missing component SidebarRow');
    });
});
describe('generateHtml — nested components', () => {
    /** Outer contains an instance of SidebarRow. */
    const outer = () => ({
        rootId: ROOT_ELEMENT_ID,
        elements: asMap([
            makeRoot(['n1']),
            makeEl('n1', {
                type: 'component-instance',
                componentName: 'SidebarRow',
                instanceId: 'inst_b111',
                // As above: a real instance is auto on both axes.
                widthMode: 'auto',
                heightMode: 'auto',
            }),
        ]),
    });
    it('chains the class prefix through a nested instance', () => {
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024', { componentName: 'Outer' })], { componentTrees: { Outer: outer(), SidebarRow: sidebarRow() } });
        expect(html).toContain('class="inst_a024__root"');
        expect(html).toContain('class="inst_a024__inst_b111__root"');
        expect(html).toContain('class="inst_a024__inst_b111__label_d3e4"');
    });
    it('stops at a component that contains itself instead of recursing forever', () => {
        // The canvas forbids building this (`wouldCreateComponentCycle`), but a
        // file edited outside Scamp is not bound by that.
        const selfRef = {
            rootId: ROOT_ELEMENT_ID,
            elements: asMap([
                makeRoot(['n1']),
                makeEl('n1', {
                    type: 'component-instance',
                    componentName: 'Loop',
                    instanceId: 'inst_c222',
                }),
            ]),
        };
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024', { componentName: 'Loop' })], { componentTrees: { Loop: selfRef } });
        expect(html).toContain('component cycle at Loop');
    });
});
describe('collectExpandedInstances', () => {
    const outer = () => ({
        rootId: ROOT_ELEMENT_ID,
        elements: asMap([
            makeRoot(['n1']),
            makeEl('n1', {
                type: 'component-instance',
                componentName: 'SidebarRow',
                instanceId: 'inst_b111',
                // As above: a real instance is auto on both axes.
                widthMode: 'auto',
                heightMode: 'auto',
            }),
        ]),
    });
    it('reports every instance the renderer expands, nested ones included', () => {
        const trees = { Outer: outer(), SidebarRow: sidebarRow() };
        const found = collectExpandedInstances(asMap([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', { componentName: 'Outer' }),
        ]), ROOT_ELEMENT_ID, trees);
        expect(found).toEqual([
            { prefix: 'inst_a024__', componentName: 'Outer' },
            { prefix: 'inst_a024__inst_b111__', componentName: 'SidebarRow' },
        ]);
    });
    it('agrees with the prefixes the renderer actually emits', () => {
        // If these two drifted, the stylesheet would define class names the
        // markup never uses and the page would lose its styling silently.
        const trees = { Outer: outer(), SidebarRow: sidebarRow() };
        const els = asMap([
            makeRoot(['i1', 'i2']),
            instance('i1', 'inst_a024', { componentName: 'Outer' }),
            instance('i2', 'inst_c333'),
        ]);
        const html = generateHtml(els, ROOT_ELEMENT_ID, { componentTrees: trees });
        const prefixes = collectExpandedInstances(els, ROOT_ELEMENT_ID, trees).map((i) => i.prefix);
        for (const prefix of prefixes) {
            expect(html).toContain(`class="${prefix}`);
        }
        // And nothing in the markup is prefixed by something never collected.
        const emitted = [...html.matchAll(/class="([^"]*?)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/));
        for (const cls of emitted) {
            if (!cls.includes('__'))
                continue;
            const matched = prefixes.some((p) => cls.startsWith(p));
            expect(matched, `no collected prefix covers ${cls}`).toBe(true);
        }
    });
    it('reports nothing for a page with no instances', () => {
        expect(collectExpandedInstances(asMap([makeRoot([])]), ROOT_ELEMENT_ID, {})).toEqual([]);
    });
    it('skips an instance whose component is missing', () => {
        expect(collectExpandedInstances(asMap([makeRoot(['i1']), instance('i1', 'inst_a024')]), ROOT_ELEMENT_ID, {})).toEqual([]);
    });
    it('stops at a cycle rather than collecting forever', () => {
        const selfRef = {
            rootId: ROOT_ELEMENT_ID,
            elements: asMap([
                makeRoot(['n1']),
                makeEl('n1', {
                    type: 'component-instance',
                    componentName: 'Loop',
                    instanceId: 'inst_c222',
                }),
            ]),
        };
        const found = collectExpandedInstances(asMap([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', { componentName: 'Loop' }),
        ]), ROOT_ELEMENT_ID, { Loop: selfRef });
        expect(found).toEqual([{ prefix: 'inst_a024__', componentName: 'Loop' }]);
    });
});
describe('generateHtml — slots', () => {
    /** A component whose root is a slot container. */
    const card = () => ({
        rootId: ROOT_ELEMENT_ID,
        elements: asMap([
            makeRoot(['slot1']),
            makeEl('slot1', { name: 'body', slot: 'children' }),
        ]),
    });
    const options = { componentTrees: { Card: card() } };
    it('renders page content inside the slot', () => {
        const html = render([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', {
                componentName: 'Card',
                childIds: ['p1'],
            }),
            makeEl('p1', { parentId: 'i1', type: 'text', text: 'Page owned' }),
        ], options);
        expect(html).toContain('Page owned');
    });
    it('keeps slot content on its page class name, unprefixed', () => {
        // Slot content belongs to the page, and its rules are already in the
        // page stylesheet — prefixing it would point at a rule that isn't there.
        const html = render([
            makeRoot(['i1']),
            instance('i1', 'inst_a024', {
                componentName: 'Card',
                childIds: ['p1'],
            }),
            makeEl('p1', { parentId: 'i1', type: 'text', text: 'Page owned' }),
        ], options);
        expect(html).toContain('class="text_p1"');
        expect(html).not.toContain('inst_a024__text_p1');
    });
    it('renders an unfilled slot as an empty element', () => {
        const html = render([makeRoot(['i1']), instance('i1', 'inst_a024', { componentName: 'Card' })], options);
        expect(html).toContain('<div class="inst_a024__body_slot1"></div>');
    });
});
describe('generateHtml — rewriting hooks', () => {
    it('rewrites image sources through rewriteAssetUrl', () => {
        const html = render([
            makeRoot(['i1']),
            makeEl('i1', { type: 'image', src: '/assets/hero.webp', alt: '' }),
        ], { rewriteAssetUrl: (url) => url.replace('/assets/', '../assets/') });
        expect(html).toContain('src="../assets/hero.webp"');
    });
    it('rewrites hrefs through rewriteHref', () => {
        const html = render([makeRoot(['a1']), makeEl('a1', { tag: 'a', attributes: { href: '/about' } })], { rewriteHref: () => 'about/index.html' });
        expect(html).toContain('href="about/index.html"');
    });
    it('leaves values alone when no rewriter is supplied', () => {
        const html = render([
            makeRoot(['a1']),
            makeEl('a1', { tag: 'a', attributes: { href: '/about' } }),
        ]);
        expect(html).toContain('href="/about"');
    });
});
describe('renderDocument', () => {
    it('wraps markup in a complete document with the body reset from layout.tsx', () => {
        const doc = renderDocument('    <div class="root"></div>', {
            title: 'My Project',
            stylesheets: ['../theme.css', 'index.css'],
        });
        expect(doc.startsWith('<!doctype html>')).toBe(true);
        expect(doc).toContain('<html lang="en">');
        expect(doc).toContain('<title>My Project</title>');
        expect(doc).toContain('<link rel="stylesheet" href="../theme.css" />');
        expect(doc).toContain('<link rel="stylesheet" href="index.css" />');
        expect(doc).toContain('<body style="margin: 0; min-height: 100vh">');
        expect(doc.trimEnd().endsWith('</html>')).toBe(true);
    });
    it('escapes a title containing markup characters', () => {
        const doc = renderDocument('', {
            title: 'A & B <script>',
            stylesheets: [],
        });
        expect(doc).toContain('<title>A &amp; B &lt;script&gt;</title>');
    });
    it('links stylesheets in the order given, theme first', () => {
        const doc = renderDocument('', {
            title: 't',
            stylesheets: ['theme.css', 'index.css'],
        });
        expect(doc.indexOf('theme.css')).toBeLessThan(doc.indexOf('index.css'));
    });
});
describe('generateHtml — repeats and show flags', () => {
    // The canvas expands these from the root's samples; the export has to
    // write what the canvas shows. see docs/notes/view-bindings.md
    const team = (extra = {}) => asMap([
        { ...makeRoot(['list']), samples: { team: [{ name: 'Ada', url: '/ada' }, { name: 'Grace', url: '/grace' }], open: false } },
        makeEl('list', { tag: 'ul', childIds: ['item'] }),
        makeEl('item', { parentId: 'list', tag: 'li', childIds: ['name', 'link'], repeat: { over: 'team', as: 'member' }, ...extra }),
        makeEl('name', { parentId: 'item', type: 'text', tag: 'strong', prop: 'member.name' }),
        makeEl('link', { parentId: 'item', tag: 'a', attributes: { href: '#' }, bind: { href: 'member.url' } }),
    ]);
    it('writes a repeated element once per row, each with its row’s words', () => {
        const html = generateHtml(team(), ROOT_ELEMENT_ID, { componentTrees: {} });
        expect(html.match(/<li /g)).toHaveLength(2);
        expect(html).toContain('>Ada</strong>');
        expect(html).toContain('>Grace</strong>');
    });
    it('writes a row-bound attribute from the row', () => {
        const html = generateHtml(team(), ROOT_ELEMENT_ID, { componentTrees: {} });
        expect(html).toContain('href="/ada"');
        expect(html).toContain('href="/grace"');
        expect(html).not.toContain('href="#"');
    });
    it('leaves out an element whose show flag is off', () => {
        const html = generateHtml(team({ showIf: 'open' }), ROOT_ELEMENT_ID, { componentTrees: {} });
        expect(html).not.toContain('<li ');
    });
    it('writes nothing for a repeat with no rows', () => {
        const elements = team();
        elements[ROOT_ELEMENT_ID] = { ...elements[ROOT_ELEMENT_ID], samples: {} };
        expect(generateHtml(elements, ROOT_ELEMENT_ID, { componentTrees: {} })).not.toContain('<li ');
    });
    it('gives a repeated instance its row’s props', () => {
        const card = {
            rootId: ROOT_ELEMENT_ID,
            elements: asMap([
                makeRoot(['title']),
                makeEl('title', { type: 'text', tag: 'h2', prop: 'title', text: 'Default' }),
            ]),
        };
        const elements = asMap([
            { ...makeRoot(['inst']), samples: { cards: [{ title: 'First' }, { title: 'Second' }] } },
            makeEl('inst', {
                type: 'component-instance',
                componentName: 'Card',
                instanceId: 'inst_inst',
                propOverrides: {},
                repeat: { over: 'cards', as: 'card' },
                bind: { title: 'card.title' },
            }),
        ]);
        const html = generateHtml(elements, ROOT_ELEMENT_ID, { componentTrees: { Card: card } });
        expect(html).toContain('>First</h2>');
        expect(html).toContain('>Second</h2>');
        expect(html).not.toContain('Default');
    });
});

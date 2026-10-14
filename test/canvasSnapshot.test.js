import { describe, expect, it } from 'vitest';
import { answerSnapshotTool, CANVAS_STATE_ELEMENT_LIMIT, componentPathsRelative, getActiveTarget, getCanvasState, getElementById, getElementTree, getSelectedElement, getThemeTokens, getRecentEdits, getViewCheck, getViewProps, listComponents, listPages, inputForView, pagePathsRelative, treeNameFor, } from '@lib/canvasSnapshot';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
/**
 * The MCP tool return shapes. An agent acts on these without a human
 * checking them, so the unhappy paths matter as much as the happy ones —
 * a wrong answer is worse than a missing one.
 * see docs/archive/2026-08-06-mcp-server-plan.md
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
const pageTarget = {
    kind: 'page',
    name: 'dashboard',
    tsxPath: 'app/dashboard/page.tsx',
    cssPath: 'app/dashboard/page.module.css',
};
const tree = () => ({
    [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['a1b2'] }),
    a1b2: el({
        id: 'a1b2',
        parentId: ROOT_ELEMENT_ID,
        childIds: ['c3d4', 'e5f6'],
        display: 'flex',
        flexDirection: 'row',
        gap: 16,
        backgroundColor: '#f0f0f0',
        widthMode: 'fixed',
        widthValue: 400,
    }),
    c3d4: el({ id: 'c3d4', parentId: 'a1b2' }),
    e5f6: el({ id: 'e5f6', parentId: 'a1b2', type: 'text', text: 'Hello world' }),
});
const build = (over = {}) => ({
    projectFormat: 'nextjs',
    target: pageTarget,
    elements: tree(),
    rootElementId: ROOT_ELEMENT_ID,
    selectedIds: [],
    pageNames: ['home', 'dashboard'],
    componentNames: ['Button'],
    themeTokens: [{ name: '--color-primary', value: '#3b82f6' }],
    themes: [{ id: 'light', label: 'Light', cssClass: '' }],
    activeThemeId: 'light',
    breakpointId: 'desktop',
    breakpointLabel: 'desktop',
    canvasWidth: 1440,
    ...over,
});
describe('getActiveTarget', () => {
    it('reports the open page with project-relative paths', () => {
        expect(getActiveTarget(build())).toEqual({
            kind: 'page',
            name: 'dashboard',
            tsx: 'app/dashboard/page.tsx',
            css: 'app/dashboard/page.module.css',
        });
    });
    it('distinguishes an open component from a page', () => {
        // The brief only modelled pages. Reporting a component as a page would
        // send the agent to edit the wrong file.
        const out = getActiveTarget(build({
            target: {
                kind: 'component',
                name: 'Button',
                tsxPath: 'components/Button/Button.tsx',
                cssPath: 'components/Button/Button.module.css',
            },
        }));
        expect(out?.kind).toBe('component');
        expect(out?.name).toBe('Button');
    });
    it('returns null when no project is open', () => {
        expect(getActiveTarget(build({ target: null }))).toBeNull();
    });
});
describe('getSelectedElement', () => {
    it('returns the primary selection with class, tag, and parentage', () => {
        const out = getSelectedElement(build({ selectedIds: ['a1b2'] }));
        expect(out).toMatchObject({
            id: 'a1b2',
            class: 'rect_a1b2',
            tag: 'div',
            parentId: ROOT_ELEMENT_ID,
            childIds: ['c3d4', 'e5f6'],
        });
    });
    it('returns styles as a map, not as declaration lines', () => {
        const out = getSelectedElement(build({ selectedIds: ['a1b2'] }));
        expect(out?.styles).toMatchObject({
            display: 'flex',
            gap: '16px',
            background: '#f0f0f0',
            width: '400px',
        });
    });
    it('separates custom properties from canvas-controlled styles', () => {
        // The agent needs to know which of these Scamp's controls can change.
        const elements = {
            ...tree(),
            a1b2: { ...tree()['a1b2'], customProperties: { 'box-shadow': '0 2px 8px red' } },
        };
        const out = getSelectedElement(build({ elements, selectedIds: ['a1b2'] }));
        expect(out?.customProperties).toEqual({ 'box-shadow': '0 2px 8px red' });
        expect(out?.styles['box-shadow']).toBeUndefined();
    });
    it('includes the user-set name only when there is one', () => {
        const named = { ...tree(), a1b2: { ...tree()['a1b2'], name: 'sidebar' } };
        expect(getSelectedElement(build({ elements: named, selectedIds: ['a1b2'] })))
            .toMatchObject({ name: 'sidebar' });
        expect(getSelectedElement(build({ selectedIds: ['a1b2'] }))).not.toHaveProperty('name');
    });
    it('returns null when nothing is selected', () => {
        expect(getSelectedElement(build())).toBeNull();
    });
    it('returns null when the selection no longer exists', () => {
        // An external edit can delete the selected element out from under us.
        expect(getSelectedElement(build({ selectedIds: ['gone'] }))).toBeNull();
    });
    it('reports the root with a null parentId', () => {
        expect(getSelectedElement(build({ selectedIds: [ROOT_ELEMENT_ID] }))).toMatchObject({ parentId: null });
    });
});
describe('getElementById', () => {
    it('describes any element, selected or not', () => {
        expect(getElementById(build(), 'e5f6')).toMatchObject({
            id: 'e5f6',
            class: 'text_e5f6',
            tag: 'p',
        });
    });
    it('returns null for an unknown id rather than throwing', () => {
        expect(getElementById(build(), 'nope')).toBeNull();
    });
    it('returns null for an empty id', () => {
        expect(getElementById(build(), '')).toBeNull();
    });
});
describe('getElementTree', () => {
    it('nests children under the root', () => {
        const out = getElementTree(build());
        expect(out?.root.id).toBe(ROOT_ELEMENT_ID);
        expect(out?.root.children[0]?.id).toBe('a1b2');
        expect(out?.root.children[0]?.children.map((c) => c.id)).toEqual([
            'c3d4',
            'e5f6',
        ]);
    });
    it('carries class and tag but no styles', () => {
        // The cheap structural tool — styles would make it a second
        // get_canvas_state.
        const node = getElementTree(build())?.root.children[0];
        expect(node).toMatchObject({ class: 'rect_a1b2', tag: 'div' });
        expect(node).not.toHaveProperty('styles');
    });
    it('skips child ids that no longer resolve', () => {
        const elements = {
            ...tree(),
            a1b2: { ...tree()['a1b2'], childIds: ['c3d4', 'ghost'] },
        };
        const kids = getElementTree(build({ elements }))?.root.children[0]?.children;
        expect(kids?.map((c) => c.id)).toEqual(['c3d4']);
    });
    it('terminates on a parent/child cycle instead of overflowing the stack', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['x'] }),
            x: el({ id: 'x', childIds: ['y'] }),
            y: el({ id: 'y', parentId: 'x', childIds: ['x'] }),
        };
        expect(() => getElementTree(build({ elements }))).not.toThrow();
    });
    it('returns null when the root is missing', () => {
        expect(getElementTree(build({ elements: {} }))).toBeNull();
    });
});
describe('listPages', () => {
    it('derives nextjs paths, with home at the app root', () => {
        expect(listPages(build())).toEqual([
            { name: 'home', kind: 'page', tsx: 'app/page.tsx', css: 'app/page.module.css' },
            {
                name: 'dashboard',
                kind: 'page',
                tsx: 'app/dashboard/page.tsx',
                css: 'app/dashboard/page.module.css',
            },
        ]);
    });
    it('derives flat paths for legacy projects', () => {
        expect(listPages(build({ projectFormat: 'legacy' }))).toEqual([
            { name: 'home', kind: 'page', tsx: 'home.tsx', css: 'home.module.css' },
            { name: 'dashboard', kind: 'page', tsx: 'dashboard.tsx', css: 'dashboard.module.css' },
        ]);
    });
    it('lists a view as a page by its route slug, pointing at views/', () => {
        expect(listPages(build({ pageNames: ['home'], viewNames: ['CheckoutFlow'] }))).toEqual([
            { name: 'home', kind: 'page', tsx: 'app/page.tsx', css: 'app/page.module.css' },
            {
                name: 'checkout-flow',
                kind: 'view',
                view: 'CheckoutFlow',
                tsx: 'views/CheckoutFlow/CheckoutFlow.tsx',
                css: 'views/CheckoutFlow/CheckoutFlow.module.css',
            },
        ]);
    });
    it('returns an empty list when the project has no pages', () => {
        expect(listPages(build({ pageNames: [] }))).toEqual([]);
    });
});
describe('pagePathsRelative', () => {
    // Mirrors main/ipc/pageOps.ts → pagePathsFor. If that moves, this breaks.
    it('puts the nextjs home page at the app root, not app/home/', () => {
        expect(pagePathsRelative('home', 'nextjs')).toEqual({
            tsx: 'app/page.tsx',
            css: 'app/page.module.css',
        });
    });
    it('never emits an absolute path', () => {
        // These land in text an agent quotes back; a leaked home directory
        // would go with it.
        for (const format of ['nextjs', 'legacy']) {
            const { tsx, css } = pagePathsRelative('about', format);
            expect(tsx.startsWith('/')).toBe(false);
            expect(css.startsWith('/')).toBe(false);
        }
    });
});
describe('listComponents', () => {
    it('gives each component its folder paths', () => {
        expect(listComponents(build())).toEqual([
            {
                name: 'Button',
                tsx: 'components/Button/Button.tsx',
                css: 'components/Button/Button.module.css',
            },
        ]);
    });
    it('omits a variants field entirely rather than reporting an empty one', () => {
        // Variants aren't on main. An agent told the field exists and finding it
        // empty concludes the component has none.
        expect(listComponents(build())[0]).not.toHaveProperty('variants');
    });
    it('returns an empty list for a project with no components', () => {
        expect(listComponents(build({ componentNames: [] }))).toEqual([]);
    });
});
describe('componentPathsRelative', () => {
    it('nests the component in its own folder', () => {
        expect(componentPathsRelative('Card')).toEqual({
            tsx: 'components/Card/Card.tsx',
            css: 'components/Card/Card.module.css',
        });
    });
});
describe('getThemeTokens', () => {
    it('returns tokens flat, as they exist in theme.css', () => {
        expect(getThemeTokens(build()).tokens).toEqual([
            { name: '--color-primary', value: '#3b82f6' },
        ]);
    });
    it('does not group tokens into invented categories', () => {
        // The agent is about to edit theme.css — a structure that file doesn't
        // have would leave it editing against the wrong shape.
        const out = getThemeTokens(build());
        expect(out).not.toHaveProperty('colors');
        expect(out).not.toHaveProperty('typography');
        expect(out).not.toHaveProperty('spacing');
    });
    it('lists the themes and which one is active', () => {
        const out = getThemeTokens(build({
            themes: [
                { id: 'light', label: 'Light', cssClass: '' },
                { id: 'dark', label: 'Dark', cssClass: 'dark' },
            ],
            activeThemeId: 'dark',
        }));
        expect(out.themes).toEqual([
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
        ]);
        expect(out.activeThemeId).toBe('dark');
    });
    it('survives a project with no tokens yet', () => {
        expect(getThemeTokens(build({ themeTokens: [], themes: [] }))).toEqual({
            tokens: [],
            themes: [],
            activeThemeId: 'light',
        });
    });
});
describe('getCanvasState', () => {
    it('reports the active target, selection, and breakpoint together', () => {
        const out = getCanvasState(build({ selectedIds: ['a1b2'] }));
        expect(out.active?.name).toBe('dashboard');
        expect(out.selectedElementId).toBe('a1b2');
        expect(out.breakpoint).toEqual({
            id: 'desktop',
            label: 'desktop',
            width: 1440,
        });
    });
    it('includes every element when under the cap', () => {
        const out = getCanvasState(build());
        expect(Object.keys(out.elements)).toHaveLength(4);
        expect(out.truncated).toBeUndefined();
    });
    it('reports a null selection rather than omitting the field', () => {
        expect(getCanvasState(build()).selectedElementId).toBeNull();
    });
    it('caps the element map and says so', () => {
        // Uncapped, this tool is the expensive default rather than a choice.
        const many = {
            [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: [] }),
        };
        for (let i = 0; i < CANVAS_STATE_ELEMENT_LIMIT + 50; i += 1) {
            many[`n${i}`] = el({ id: `n${i}` });
        }
        const out = getCanvasState(build({ elements: many }));
        expect(Object.keys(out.elements)).toHaveLength(CANVAS_STATE_ELEMENT_LIMIT);
        expect(out.truncated?.returned).toBe(CANVAS_STATE_ELEMENT_LIMIT);
        expect(out.truncated?.total).toBe(CANVAS_STATE_ELEMENT_LIMIT + 51);
    });
    it('tells the agent how to get the rest', () => {
        // A truncation the agent can't recover from is just data loss.
        const many = {};
        for (let i = 0; i < CANVAS_STATE_ELEMENT_LIMIT + 1; i += 1) {
            many[`n${i}`] = el({ id: `n${i}` });
        }
        const hint = getCanvasState(build({ elements: many })).truncated?.hint ?? '';
        expect(hint).toContain('scamp_get_element_by_id');
        expect(hint).toContain('scamp_get_element_tree');
    });
    it('survives an empty canvas with no project open', () => {
        const out = getCanvasState(build({ target: null, elements: {}, selectedIds: [] }));
        expect(out.active).toBeNull();
        expect(out.elements).toEqual({});
        expect(out.truncated).toBeUndefined();
    });
});
describe('answerSnapshotTool', () => {
    it('routes every advertised tool name to a function', () => {
        // Pins the mapping against the tool list in main/mcp/tools.ts. If a tool
        // is advertised but unrouted, the agent gets an error instead of data.
        const names = [
            'scamp_get_active_page',
            'scamp_get_selected_element',
            'scamp_get_element_by_id',
            'scamp_get_element_tree',
            'scamp_get_canvas_state',
            'scamp_list_pages',
            'scamp_list_components',
            'scamp_get_theme_tokens',
        ];
        for (const name of names) {
            expect(() => answerSnapshotTool(name, { id: 'a1b2' }, build())).not.toThrow();
        }
    });
    it('passes the id argument through to get_element_by_id', () => {
        expect(answerSnapshotTool('scamp_get_element_by_id', { id: 'a1b2' }, build()))
            .toMatchObject({ id: 'a1b2' });
    });
    it('returns null for get_element_by_id with a missing id', () => {
        expect(answerSnapshotTool('scamp_get_element_by_id', {}, build())).toBeNull();
    });
    it('throws on an unrouted tool rather than returning null', () => {
        // Null would be indistinguishable from "nothing selected"; a throw
        // surfaces the drift as an isError result naming the tool.
        expect(() => answerSnapshotTool('scamp_made_up', {}, build())).toThrow(/Unknown snapshot tool/);
    });
});
describe('agreement with the shared model', () => {
    it('describes the selected element identically to get_element_by_id', () => {
        // Both route through contextModel. If they ever diverge, the context
        // file and the MCP answer can describe one element two ways.
        const input = build({ selectedIds: ['a1b2'] });
        expect(getSelectedElement(input)).toEqual(getElementById(input, 'a1b2'));
    });
});
describe('getViewProps', () => {
    const lobby = () => ({
        [ROOT_ELEMENT_ID]: el({
            id: ROOT_ELEMENT_ID,
            parentId: null,
            childIds: ['code', 'row', 'note', 'start'],
            samples: {
                players: [
                    { id: '1', label: 'Alex' },
                    { id: '2', label: 'Bea' },
                ],
                waiting: true,
            },
        }),
        code: el({ id: 'code', type: 'text', text: 'KZQ4', prop: 'code' }),
        row: el({
            id: 'row',
            type: 'text',
            prop: 'player.label',
            repeat: { over: 'players', as: 'player' },
        }),
        note: el({ id: 'note', type: 'text', text: 'Waiting', showIf: 'waiting' }),
        start: el({
            id: 'start',
            type: 'text',
            text: 'Start',
            tag: 'button',
            bind: { disabled: '!canStart' },
            on: { onClick: 'onStart' },
        }),
    });
    const withTrees = () => build({
        viewNames: ['Lobby'],
        componentNames: ['Button'],
        trees: {
            Lobby: { kind: 'view', elements: lobby(), rootId: ROOT_ELEMENT_ID },
            Button: { kind: 'component', elements: tree(), rootId: ROOT_ELEMENT_ID },
        },
    });
    it('returns the props type exactly as the file declares it, with kinds, events, and samples', () => {
        const result = getViewProps(withTrees(), 'Lobby');
        expect(result).toEqual({
            name: 'Lobby',
            kind: 'view',
            tsx: 'views/Lobby/Lobby.tsx',
            css: 'views/Lobby/Lobby.module.css',
            propsType: [
                'type LobbyProps = {',
                '  code?: string;',
                '  players?: Array<{ id: string; label: string }>;',
                '  waiting?: boolean;',
                '  canStart?: boolean;',
                '  onStart?: () => void;',
                '  className?: string;',
                '};',
            ].join('\n'),
            props: [
                { name: 'code', kind: 'text', type: 'string', default: 'KZQ4' },
                {
                    name: 'players',
                    kind: 'repeat',
                    type: 'Array<{ id: string; label: string }>',
                    default: [
                        { id: '1', label: 'Alex' },
                        { id: '2', label: 'Bea' },
                    ],
                },
                { name: 'waiting', kind: 'show', type: 'boolean', default: true },
                { name: 'canStart', kind: 'boolean', type: 'boolean', default: true },
                { name: 'onStart', kind: 'event', type: '() => void' },
            ],
            events: ['onStart'],
            samples: {
                code: 'KZQ4',
                players: [
                    { id: '1', label: 'Alex' },
                    { id: '2', label: 'Bea' },
                ],
                waiting: true,
                canStart: true,
            },
            // The fixture is clean; a non-empty list here means the view lost
            // something on parse. see docs/notes/view-lint.md
            warnings: [],
        });
    });
    it('resolves a view by its route slug, as scamp_list_pages reports it', () => {
        expect(getViewProps(withTrees(), 'lobby')?.name).toBe('Lobby');
    });
    it('describes a component with only className when it binds nothing', () => {
        expect(getViewProps(withTrees(), 'Button')).toEqual({
            name: 'Button',
            kind: 'component',
            tsx: 'components/Button/Button.tsx',
            css: 'components/Button/Button.module.css',
            propsType: 'type ButtonProps = {\n  className?: string;\n};',
            props: [],
            events: [],
            samples: {},
            warnings: [],
        });
    });
    it('returns null for an unknown name, an empty name, or when no trees were supplied', () => {
        expect(getViewProps(withTrees(), 'Nope')).toBeNull();
        expect(getViewProps(withTrees(), '')).toBeNull();
        expect(getViewProps(build(), 'Lobby')).toBeNull();
    });
    it('does not let a component slug-match a view name', () => {
        // Only views are addressable by slug; "button" must not resolve to Button.
        expect(getViewProps(withTrees(), 'button')).toBeNull();
    });
    it('answers through answerSnapshotTool with the name argument', () => {
        expect(answerSnapshotTool('scamp_get_view_props', { name: 'Lobby' }, withTrees())).toMatchObject({
            name: 'Lobby',
            kind: 'view',
        });
        expect(answerSnapshotTool('scamp_get_view_props', {}, withTrees())).toBeNull();
    });
});
describe('getRecentEdits', () => {
    const save = (revision, target, line, text) => ({
        revision,
        at: Date.UTC(2026, 0, 1),
        target,
        kind: 'page',
        files: [
            {
                file: 'css',
                path: `${target}.module.css`,
                hunks: [{ line, removed: 1, added: 1, text }],
                edits: [{ start: 0, end: 1, replacement: text }],
            },
        ],
    });
    it('reports nothing, at revision 0, when no save has happened', () => {
        expect(getRecentEdits(build(), 0)).toEqual({ revision: 0, saves: [] });
    });
    it('reports every save, with the line each change starts at', () => {
        const result = getRecentEdits(build({ recentEdits: [save(1, 'home', 12, '    width: 240px;\n')] }), 0);
        expect(result.revision).toBe(1);
        expect(result.saves).toEqual([
            {
                revision: 1,
                at: '2026-01-01T00:00:00.000Z',
                target: 'home',
                kind: 'page',
                files: [
                    {
                        path: 'home.module.css',
                        changes: [{ line: 12, removed: 1, added: 1, text: '    width: 240px;\n' }],
                    },
                ],
            },
        ]);
    });
    it('reports only what came after the revision it is given', () => {
        const input = build({
            recentEdits: [save(1, 'home', 1, 'a'), save(2, 'about', 2, 'b'), save(3, 'home', 3, 'c')],
        });
        expect(getRecentEdits(input, 2).saves.map((s) => s.revision)).toEqual([3]);
        // The newest revision comes back regardless, so a caller can keep paging.
        expect(getRecentEdits(input, 3)).toEqual({ revision: 3, saves: [] });
    });
    it('treats a nonsense `since` as "everything"', () => {
        const input = build({ recentEdits: [save(1, 'home', 1, 'a')] });
        expect(getRecentEdits(input, Number.NaN).saves).toHaveLength(1);
        expect(getRecentEdits(input, -5).saves).toHaveLength(1);
    });
    it('truncates a hunk too large to hand an agent', () => {
        const huge = 'x'.repeat(5000);
        const result = getRecentEdits(build({ recentEdits: [save(1, 'home', 1, huge)] }), 0);
        const text = result.saves[0]?.files[0]?.changes[0]?.text ?? '';
        expect(text.length).toBeLessThan(huge.length);
        expect(text).toContain('more characters');
    });
    it('answers through the tool dispatcher', () => {
        const input = build({ recentEdits: [save(1, 'home', 4, 'a')] });
        expect(answerSnapshotTool('scamp_get_recent_edits', { since: 0 }, input)).toEqual(getRecentEdits(input, 0));
    });
});
describe('scamp_get_element_by_id on a table', () => {
    const tableTree = (extra = {}) => ({
        [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['t1t1'] }),
        t1t1: el({ id: 't1t1', tag: 'table', display: 'grid', gridTemplateColumns: '1fr 1fr', ...extra }),
    });
    it('lists the rules Scamp derives from it, as the file has them', () => {
        // An agent reading only the table's own rule sees no stripe and no
        // subgrid, and styles every row by hand.
        const out = answerSnapshotTool('scamp_get_element_by_id', { id: 't1t1' }, build({ elements: tableTree({ tableStyle: { stripe: '#eee' } }) }));
        expect(out.tableRules?.some((rule) => rule.includes('grid-template-columns: subgrid;'))).toBe(true);
        expect(out.tableRules?.some((rule) => rule.includes('background-color: #eee;'))).toBe(true);
    });
    it('omits tableRules for a table with nothing derived', () => {
        const out = answerSnapshotTool('scamp_get_element_by_id', { id: 't1t1' }, build({ elements: tableTree({ display: 'none', gridTemplateColumns: '' }) }));
        expect(out).not.toHaveProperty('tableRules');
    });
    it('omits tableRules on anything that is not a table', () => {
        expect(answerSnapshotTool('scamp_get_element_by_id', { id: 'a1b2' }, build())).not.toHaveProperty('tableRules');
    });
});
describe('getViewCheck', () => {
    const stored = () => ({
        [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['card'] }),
        card: el({ id: 'card', parentId: ROOT_ELEMENT_ID, customProperties: { 'padding-top': '24px' } }),
    });
    const live = () => ({
        [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['card'] }),
        card: el({ id: 'card', parentId: ROOT_ELEMENT_ID }),
    });
    const lobby = { kind: 'view', name: 'Lobby', tsxPath: 'views/Lobby/Lobby.tsx', cssPath: 'views/Lobby/Lobby.module.css' };
    const input = (target) => build({
        target,
        elements: live(),
        viewNames: ['Lobby'],
        trees: { Lobby: { kind: 'view', elements: stored(), rootId: ROOT_ELEMENT_ID } },
    });
    it('checks the open view as it is on the canvas, not as it was loaded', () => {
        expect(getViewCheck(input(lobby), 'Lobby')?.findings).toEqual([]);
    });
    it('checks a view that is not open from its stored tree', () => {
        const check = getViewCheck(input(pageTarget), 'Lobby');
        expect((check?.findings.length ?? 0) + (check?.notes.length ?? 0)).toBeGreaterThan(0);
    });
    it('returns null for a name that is not a view or component', () => {
        expect(getViewCheck(input(lobby), 'Nope')).toBeNull();
    });
});
describe('reading a view that isn’t open', () => {
    const settings = () => ({
        [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['f1f1'] }),
        f1f1: el({ id: 'f1f1', parentId: ROOT_ELEMENT_ID, gap: 4 }),
    });
    const withSettings = () => build({ trees: { Settings: { kind: 'view', elements: settings(), rootId: ROOT_ELEMENT_ID } } });
    it('answers the element tree for the named view', () => {
        const answer = answerSnapshotTool('scamp_get_element_tree', { view: 'Settings' }, withSettings());
        expect(answer.root.children.map((c) => c.id)).toEqual(['f1f1']);
    });
    it('finds a view by its route slug', () => {
        expect(answerSnapshotTool('scamp_get_element_by_id', { id: 'f1f1', view: 'settings' }, withSettings())).toMatchObject({ id: 'f1f1' });
    });
    it('answers about the open page when no view is named', () => {
        expect(answerSnapshotTool('scamp_get_element_by_id', { id: 'a1b2', view: '' }, withSettings())).toMatchObject({ id: 'a1b2' });
        expect(answerSnapshotTool('scamp_get_element_by_id', { id: 'f1f1' }, withSettings())).toBeNull();
    });
    it('describes the element as part of that view’s files', () => {
        const input = inputForView(withSettings(), 'Settings');
        expect(input.target).toEqual({ kind: 'view', name: 'Settings', tsxPath: 'views/Settings/Settings.tsx', cssPath: 'views/Settings/Settings.module.css' });
        expect(input.selectedIds).toEqual([]);
    });
    it('throws for a name that is neither a view nor a component', () => {
        expect(() => answerSnapshotTool('scamp_get_element_tree', { view: 'Nowhere' }, withSettings())).toThrow(/No view or component named "Nowhere"/);
    });
});
describe('treeNameFor', () => {
    const trees = { Settings: { kind: 'view' }, Button: {} };
    it('matches a name, a view’s slug, and a component stored before kinds existed', () => {
        expect(treeNameFor(trees, 'Settings')).toBe('Settings');
        expect(treeNameFor(trees, 'settings')).toBe('Settings');
        expect(treeNameFor(trees, 'Button')).toBe('Button');
    });
    it('returns null for an unknown name or a component’s slug', () => {
        expect(treeNameFor(trees, 'button')).toBeNull();
        expect(treeNameFor(trees, '')).toBeNull();
    });
});

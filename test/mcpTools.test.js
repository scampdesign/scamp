import { describe, expect, it, vi } from 'vitest';
import { createToolInvoker, TOOL_DESCRIPTORS, TOOL_NAMES } from '../src/main/mcp/tools';
/**
 * The tool surface an agent sees. Descriptions and schemas are the only
 * thing telling it when to reach for each one, so they get asserted like
 * behaviour rather than treated as prose.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */
const invoker = (data = { ok: true }) => createToolInvoker(async () => data);
describe('imported originals', () => {
    // The originals live in a temp directory, so these two are answered in
    // main from disk rather than by the canvas — the same shape
    // `scamp_list_routes` uses. see docs/notes/import-source-store.md
    const never = () => Promise.reject(new Error('should not ask the canvas'));
    it('lists what has been imported', async () => {
        const invoke = createToolInvoker(never, {
            listImportSources: async () => [{ view: 'Lobby', url: 'https://x.test/' }],
        });
        const out = await invoke('scamp_list_import_sources', {});
        expect(out.content[0]?.text).toContain('Lobby');
    });
    it('says so plainly when nothing has been imported', async () => {
        const invoke = createToolInvoker(never, {});
        expect((await invoke('scamp_list_import_sources', {})).content[0]?.text).toBe('[]');
    });
    it('reads the css by default, since that is where the answers are', async () => {
        let asked = null;
        const invoke = createToolInvoker(never, {
            readImportSource: async (_view, part) => {
                asked = part;
                return { text: '.a { color: red; }', truncated: false, path: '/tmp/a.css', url: 'u' };
            },
        });
        const out = await invoke('scamp_get_import_source', { name: 'Lobby' });
        expect(asked).toBe('css');
        expect(out.content[0]?.text).toContain('.a { color: red; }');
    });
    it('names the file on disk, so the rest is one read away', async () => {
        const invoke = createToolInvoker(never, {
            readImportSource: async () => ({
                text: 'x',
                truncated: true,
                path: '/tmp/scamp/page.html',
                url: 'https://x.test/',
            }),
        });
        const out = await invoke('scamp_get_import_source', { name: 'Lobby', part: 'html' });
        expect(out.content[0]?.text).toContain('/tmp/scamp/page.html');
        expect(out.content[0]?.text).toContain('TRUNCATED');
    });
    it('refuses a part it does not have', async () => {
        const invoke = createToolInvoker(never, { readImportSource: async () => null });
        const out = await invoke('scamp_get_import_source', { name: 'Lobby', part: 'sass' });
        expect(out.isError).toBe(true);
    });
    it('refuses a call with no view name', async () => {
        const invoke = createToolInvoker(never, { readImportSource: async () => null });
        expect((await invoke('scamp_get_import_source', {})).isError).toBe(true);
    });
    it('tells the agent where to look when the view was never imported', async () => {
        const invoke = createToolInvoker(never, { readImportSource: async () => null });
        const out = await invoke('scamp_get_import_source', { name: 'Ghost' });
        expect(out.isError).toBe(true);
        expect(out.content[0]?.text).toContain('scamp_list_import_sources');
    });
});
describe('TOOL_DESCRIPTORS', () => {
    it('exposes the canvas tools plus the scaffold, view props, checks, routes, imported originals, React source, and overflow', () => {
        expect(TOOL_NAMES).toEqual([
            'scamp_get_active_page',
            'scamp_get_selected_element',
            'scamp_get_element_by_id',
            'scamp_get_element_tree',
            'scamp_get_canvas_state',
            'scamp_list_pages',
            'scamp_list_components',
            'scamp_get_component_scaffold',
            'scamp_get_view_props',
            'scamp_check_view',
            'scamp_check_project',
            'scamp_list_routes',
            'scamp_list_import_sources',
            'scamp_get_import_source',
            'scamp_get_recent_edits',
            'scamp_get_conventions',
            'scamp_get_theme_tokens',
            'scamp_get_react_source',
            'scamp_find_overflow',
        ]);
    });
    it('gives every tool a strict object schema', () => {
        // A hallucinated argument should fail at the boundary, not be ignored.
        for (const tool of TOOL_DESCRIPTORS) {
            expect(tool.inputSchema['type']).toBe('object');
            expect(tool.inputSchema['additionalProperties']).toBe(false);
        }
    });
    it('gives every tool a description that says when to use it', () => {
        for (const tool of TOOL_DESCRIPTORS) {
            expect(tool.description.length).toBeGreaterThan(40);
        }
    });
    it('requires an id on get_element_by_id, a name on the name-taking tools, a target on the React source, and nothing else', () => {
        const byId = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_element_by_id');
        expect(byId?.inputSchema['required']).toEqual(['id']);
        const scaffold = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_component_scaffold');
        expect(scaffold?.inputSchema['required']).toEqual(['name']);
        const viewProps = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_view_props');
        expect(viewProps?.inputSchema['required']).toEqual(['name']);
        const check = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_check_view');
        expect(check?.inputSchema['required']).toEqual(['name']);
        const source = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_import_source');
        expect(source?.inputSchema['required']).toEqual(['name']);
        const takesName = new Set([
            'scamp_get_component_scaffold',
            'scamp_get_view_props',
            'scamp_check_view',
            'scamp_get_import_source',
        ]);
        const reactSource = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_react_source');
        expect(reactSource?.inputSchema['required']).toEqual(['target']);
        for (const tool of TOOL_DESCRIPTORS) {
            if (tool.name === 'scamp_get_element_by_id' || tool.name === 'scamp_get_react_source')
                continue;
            if (takesName.has(tool.name))
                continue;
            expect(tool.inputSchema['required']).toBeUndefined();
        }
    });
    it('tells the agent to call get_view_props before rendering a view, and accepts a slug', () => {
        const tool = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_view_props');
        expect(tool?.description).toContain('scamp_list_pages');
        expect(tool?.description.toLowerCase()).toContain('route slug');
        expect(tool?.description).toContain('_scamp.events');
    });
    it('tells the agent to create components when list_components comes back empty', () => {
        // The observed failure: asked for "components", an agent built pages
        // of examples because nothing said the folder format existed.
        const tool = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_list_components');
        expect(tool?.description).toContain('scamp_get_component_scaffold');
        expect(tool?.description.toLowerCase()).toContain('create');
    });
    it('steers get_component_scaffold away from a page of examples', () => {
        const tool = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_component_scaffold');
        expect(tool?.description).toContain('components/');
        expect(tool?.description.toLowerCase()).toContain('rather than a page');
    });
    it('does not advertise variants on list_components', () => {
        // Variants aren't on main; promising the field would mislead the agent.
        const tool = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_list_components');
        expect(tool?.description.toLowerCase()).not.toContain('variant');
    });
    it('warns that get_canvas_state is large and capped', () => {
        const tool = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_canvas_state');
        expect(tool?.description).toMatch(/capped|truncated/i);
    });
    it('tells the agent get_active_page may return a component', () => {
        const tool = TOOL_DESCRIPTORS.find((t) => t.name === 'scamp_get_active_page');
        expect(tool?.description.toLowerCase()).toContain('component');
    });
});
describe('createToolInvoker', () => {
    it('serialises the answer as readable JSON', async () => {
        const out = await invoker({ id: 'a1b2', tag: 'div' })('scamp_get_selected_element', {});
        expect(out.content[0]?.text).toContain('"id": "a1b2"');
        expect(out.isError).toBeUndefined();
    });
    it('forwards the tool name and args to the query', async () => {
        const run = vi.fn(async () => null);
        await createToolInvoker(run)('scamp_get_element_by_id', { id: 'a1b2' });
        expect(run).toHaveBeenCalledWith('scamp_get_element_by_id', { id: 'a1b2' });
    });
    it('explains a null selection in words rather than printing "null"', async () => {
        // A bare `null` reads as a failure to a model; it actually means
        // "nothing is selected", which is a useful answer.
        const out = await invoker(null)('scamp_get_selected_element', {});
        expect(out.content[0]?.text).toContain('No element is currently selected');
        expect(out.isError).toBeUndefined();
    });
    it('explains a missing element for get_element_by_id', async () => {
        const out = await invoker(null)('scamp_get_element_by_id', { id: 'gone' });
        expect(out.content[0]?.text).toContain('No element with that id');
    });
    it('explains a closed project for get_active_page', async () => {
        const out = await invoker(null)('scamp_get_active_page', {});
        expect(out.content[0]?.text).toContain('No project is currently open');
    });
    it('rejects get_element_by_id with no id, without calling through', async () => {
        const run = vi.fn(async () => null);
        const out = await createToolInvoker(run)('scamp_get_element_by_id', {});
        expect(out.isError).toBe(true);
        expect(run).not.toHaveBeenCalled();
    });
    it('rejects a non-string id', async () => {
        const out = await invoker()('scamp_get_element_by_id', { id: 42 });
        expect(out.isError).toBe(true);
    });
    it('rejects an empty-string id', async () => {
        const out = await invoker()('scamp_get_element_by_id', { id: '' });
        expect(out.isError).toBe(true);
    });
    it('turns a query failure into an isError result, not a throw', async () => {
        // The agent's turn must survive a timeout with something it can act on.
        const run = async () => {
            throw new Error('The Scamp canvas did not respond in time.');
        };
        const out = await createToolInvoker(run)('scamp_get_selected_element', {});
        expect(out.isError).toBe(true);
        expect(out.content[0]?.text).toContain('did not respond');
    });
    it('names the failing tool in the error text', async () => {
        const run = async () => {
            throw new Error('boom');
        };
        const out = await createToolInvoker(run)('scamp_list_pages', {});
        expect(out.content[0]?.text).toContain('scamp_list_pages');
    });
    it('rejects a tool it does not own', async () => {
        const out = await invoker()('scamp_delete_everything', {});
        expect(out.isError).toBe(true);
    });
    it('handles an empty list without calling it an error', async () => {
        const out = await invoker([])('scamp_list_components', {});
        expect(out.isError).toBeUndefined();
        expect(out.content[0]?.text).toBe('[]');
    });
    describe('scamp_get_component_scaffold', () => {
        it('answers without a canvas round trip', async () => {
            const run = vi.fn(async () => null);
            const out = await createToolInvoker(run)('scamp_get_component_scaffold', {
                name: 'HeroCard',
            });
            expect(run).not.toHaveBeenCalled();
            expect(out.isError).toBeUndefined();
        });
        it('returns both files at their project-relative paths, CSS first', async () => {
            const out = await invoker()('scamp_get_component_scaffold', { name: 'HeroCard' });
            const parsed = JSON.parse(out.content[0]?.text ?? '');
            expect(parsed.name).toBe('HeroCard');
            expect(parsed.files.map((f) => f.path)).toEqual([
                'components/HeroCard/HeroCard.module.css',
                'components/HeroCard/HeroCard.tsx',
            ]);
            expect(parsed.files[1]?.content).toContain('export default function HeroCard(');
            expect(parsed.files[1]?.content).toContain('data-scamp-id="root"');
            expect(parsed.files[0]?.content).toContain('.root {');
        });
        it('rejects a name that is not PascalCase letters and digits', async () => {
            for (const name of ['hero-card', 'hero_card', 'heroCard', '', '1Card']) {
                const out = await invoker()('scamp_get_component_scaffold', { name });
                expect(out.isError, name).toBe(true);
                expect(out.content[0]?.text).toContain('PascalCase');
            }
        });
        it('rejects a missing or non-string name', async () => {
            expect((await invoker()('scamp_get_component_scaffold', {})).isError).toBe(true);
            expect((await invoker()('scamp_get_component_scaffold', { name: 42 })).isError).toBe(true);
        });
    });
});
describe('scamp_get_view_props', () => {
    it('rejects a missing or empty name without asking the renderer', async () => {
        const runQuery = vi.fn(async () => ({ name: 'Lobby' }));
        const invoke = createToolInvoker(runQuery);
        const missing = await invoke('scamp_get_view_props', {});
        expect(missing.isError).toBe(true);
        expect(missing.content[0]?.text).toContain('"name"');
        const empty = await invoke('scamp_get_view_props', { name: '' });
        expect(empty.isError).toBe(true);
        expect(runQuery).not.toHaveBeenCalled();
    });
    it('turns a null answer into a sentence naming the missing view and the listing tools', async () => {
        const result = await invoker(null)('scamp_get_view_props', { name: 'Nope' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toBe('No view or component named "Nope" exists. Call scamp_list_pages (the `view` field) or scamp_list_components for the names.');
    });
    it('passes the name through to the renderer and returns its answer as JSON', async () => {
        const runQuery = vi.fn(async () => ({ name: 'Lobby', propsType: 'type LobbyProps = {\n  className?: string;\n};' }));
        const result = await createToolInvoker(runQuery)('scamp_get_view_props', { name: 'Lobby' });
        expect(runQuery).toHaveBeenCalledWith('scamp_get_view_props', { name: 'Lobby' });
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({
            name: 'Lobby',
            propsType: 'type LobbyProps = {\n  className?: string;\n};',
        });
    });
});
describe('scamp_list_routes', () => {
    it('answers from the injected lister, not the renderer', async () => {
        const runQuery = vi.fn(async () => ({ never: true }));
        const invoke = createToolInvoker(runQuery, {
            listRoutes: async () => [{ file: 'index.tsx', kind: 'page', path: '/', render: 'static', view: 'Home' }],
        });
        const result = await invoke('scamp_list_routes', {});
        expect(runQuery).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual([
            { file: 'index.tsx', kind: 'page', path: '/', render: 'static', view: 'Home' },
        ]);
    });
    it('is an empty list without a lister, and an isError result when the lister throws', async () => {
        expect((await createToolInvoker(async () => null)('scamp_list_routes', {})).content[0]?.text).toBe('[]');
        const failing = createToolInvoker(async () => null, { listRoutes: async () => { throw new Error('disk'); } });
        const result = await failing('scamp_list_routes', {});
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('disk');
    });
});
describe('scamp_get_react_source', () => {
    const never = () => Promise.reject(new Error('should not ask the canvas'));
    it('answers from the React import, in main, with the element when given', async () => {
        const asked = [];
        const invoke = createToolInvoker(never, {
            reactSource: async (target, element) => {
                asked.push([target, element]);
                return { ok: true, text: '> 12 | {isLate && <Badge />}' };
            },
        });
        const out = await invoke('scamp_get_react_source', { target: 'Patients', element: 'badge_a1b2' });
        expect(out.isError).toBeUndefined();
        expect(out.content[0]?.text).toBe('> 12 | {isLate && <Badge />}');
        expect(asked).toEqual([['Patients', 'badge_a1b2']]);
    });
    it('passes on what the import record couldn’t answer, as an error', async () => {
        const invoke = createToolInvoker(never, { reactSource: async () => ({ ok: false, error: 'Patients wasn’t imported from a React app.' }) });
        const out = await invoke('scamp_get_react_source', { target: 'Patients' });
        expect(out).toMatchObject({ isError: true });
        expect(out.content[0]?.text).toBe('Patients wasn’t imported from a React app.');
    });
    it('requires a target, and says so when the project has no import to read', async () => {
        const invoke = createToolInvoker(never, {});
        expect((await invoke('scamp_get_react_source', {})).content[0]?.text).toContain('requires a non-empty string "target"');
        expect((await invoke('scamp_get_react_source', { target: 'Patients' })).content[0]?.text).toBe('This project has no React import to read.');
    });
});
describe('scamp_find_overflow', () => {
    const never = () => Promise.reject(new Error('should not ask the snapshot'));
    it('hands its arguments to the measure and returns what it found', async () => {
        let got = null;
        const invoke = createToolInvoker(never, {
            findOverflow: async (args) => {
                got = args;
                return { ok: true, text: 'Rendered Billing at 390px wide. Nothing overflows.' };
            },
        });
        const out = await invoke('scamp_find_overflow', { view: 'Billing', width: 390 });
        expect(out.content[0]?.text).toBe('Rendered Billing at 390px wide. Nothing overflows.');
        expect(got).toEqual({ view: 'Billing', width: 390 });
    });
    it('reports a failed measure, and a host that can’t lay views out, as errors', async () => {
        const failing = createToolInvoker(never, { findOverflow: async () => ({ ok: false, text: 'No view or component named "Nope".' }) });
        expect(await failing('scamp_find_overflow', { view: 'Nope' })).toMatchObject({ isError: true });
        const thrown = createToolInvoker(never, { findOverflow: async () => Promise.reject(new Error('timed out')) });
        expect((await thrown('scamp_find_overflow', {})).content[0]?.text).toBe('scamp_find_overflow failed: timed out');
        expect(await createToolInvoker(never, {})('scamp_find_overflow', {})).toMatchObject({ isError: true });
    });
});
describe('the check tools', () => {
    const never = () => Promise.reject(new Error('should not ask the canvas'));
    it('go to the fresh-from-disk check when the host has one', async () => {
        const calls = [];
        const invoke = createToolInvoker(never, {
            checks: async (tool, args) => {
                calls.push([tool, args]);
                return { ok: true, text: '{"checked":3,"withFindings":[],"unreadable":[]}' };
            },
        });
        expect((await invoke('scamp_check_project', {})).content[0]?.text).toContain('"checked":3');
        await invoke('scamp_check_view', { name: 'about' });
        expect(calls).toEqual([
            ['scamp_check_project', {}],
            ['scamp_check_view', { name: 'about' }],
        ]);
    });
    it('fall back to the snapshot without one, and still insist on a name for a single check', async () => {
        const asked = [];
        const invoke = createToolInvoker(async (tool) => {
            asked.push(tool);
            return { checked: 0, withFindings: [], unreadable: [] };
        });
        await invoke('scamp_check_project', {});
        expect(asked).toEqual(['scamp_check_project']);
        expect(await invoke('scamp_check_view', {})).toMatchObject({ isError: true });
    });
    it('report a failed check as an error', async () => {
        const thrown = createToolInvoker(never, { checks: async () => Promise.reject(new Error('timed out')) });
        expect((await thrown('scamp_check_project', {})).content[0]?.text).toBe('scamp_check_project failed: timed out');
    });
});

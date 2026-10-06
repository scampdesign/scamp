// @lib/agentHeadless.ts — the Scamp Agent's canvas, without a window.
//
// Answers the agent's tools against an in-memory page, through the same
// code the app uses: read tools through the MCP server's own invoker and
// snapshot answers, edits through `@lib/agentEdits`, feedback through
// `editFeedback`. So the import-cleanup eval measures the agent the app
// actually runs — on real imported pages, in plain Node, at no cost when
// the provider is scripted.
// see docs/plans/builtin-agent-plan.md
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { createToolInvoker } from '../../main/mcp/tools';
import { addElement, deleteElement, editFeedback, mergeThemeTokens, moveElement, planExtraction, setAttributes, setStyles, setTag, setText, wrapElements, } from './agentEdits';
import { answerSnapshotTool } from './canvasSnapshot';
import { replaceSubtreeWithInstancePure } from './componentInstance';
import { generateElementId } from './element/tree';
import { generateComponentFromSubtree } from './extractComponent';
import { classNameFor } from './generateCode';
import { parseCode } from './parseCode';
import { parseThemeFile, serializeThemeFile } from './parseTheme';
const EDITS = {
    scamp_set_styles: (ctx, a) => setStyles(ctx, { ...a, element: a['element'] }),
    scamp_add_element: (ctx, a) => addElement(ctx, { ...a, parent: a['parent'] }),
    scamp_set_text: (ctx, a) => setText(ctx, { element: a['element'], text: a['text'] }),
    scamp_set_tag: (ctx, a) => setTag(ctx, { element: a['element'], tag: a['tag'] }),
    scamp_set_attributes: (ctx, a) => setAttributes(ctx, { element: a['element'], attributes: a['attributes'] }),
    scamp_move_element: (ctx, a) => moveElement(ctx, { ...a, element: a['element'], parent: a['parent'] }),
    scamp_wrap_elements: (ctx, a) => wrapElements(ctx, { ...a, elements: a['elements'] }),
    scamp_delete_element: (ctx, a) => deleteElement(ctx, { element: a['element'] }),
};
const text = (value, isError = false) => ({
    content: [{ type: 'text', text: value }],
    ...(isError ? { isError: true } : {}),
});
export const createHeadlessCanvas = (initial, options) => {
    let state = { ...initial, components: { ...initial.components } };
    const breakpoints = options.breakpoints ?? DEFAULT_BREAKPOINTS;
    const view = options.viewName;
    const snapshotInput = () => {
        const trees = {
            [view]: { kind: 'view', elements: state.elements, rootId: state.rootId },
        };
        for (const [name, files] of Object.entries(state.components)) {
            const parsed = parseCode(files.tsx, files.css, { breakpoints: [...breakpoints], isComponent: true });
            trees[name] = { kind: 'component', elements: parsed.elements, rootId: parsed.rootId };
        }
        return {
            projectFormat: 'scamp',
            target: { kind: 'view', name: view, tsxPath: `views/${view}/${view}.tsx`, cssPath: `views/${view}/${view}.module.css` },
            elements: state.elements,
            rootElementId: state.rootId,
            selectedIds: [],
            pageNames: [],
            componentNames: Object.keys(state.components),
            viewNames: [view],
            trees,
            themeTokens: parseThemeFile(state.themeCss).tokens,
            themes: [],
            activeThemeId: 'light',
            breakpointId: 'desktop',
            breakpointLabel: 'Desktop',
            canvasWidth: 1440,
        };
    };
    const source = options.importSource;
    const read = createToolInvoker(async (tool, args) => answerSnapshotTool(tool, args, snapshotInput()), {
        listImportSources: async () => (source === undefined ? [] : [{ name: view, url: source.url }]),
        readImportSource: async (name, part) => source === undefined || name !== view
            ? null
            : { text: part === 'html' ? source.html : source.css, truncated: false, path: `(in memory)/${part}`, url: source.url },
    });
    const context = () => ({
        elements: state.elements,
        rootId: state.rootId,
        breakpoints,
        isComponent: false,
    });
    const tokenNames = () => parseThemeFile(state.themeCss).tokens.map((t) => t.name);
    const setThemeTokens = (input) => {
        const model = parseThemeFile(state.themeCss);
        const merged = mergeThemeTokens(model.tokens, input['tokens']);
        if (typeof merged === 'string')
            return text(merged, true);
        if (merged.added.length === 0 && merged.changed.length === 0)
            return text('Every token already had that value; nothing changed.');
        state = { ...state, themeCss: serializeThemeFile({ ...model, tokens: merged.tokens }, state.themeCss) };
        const summary = `Theme tokens — ${[
            ...(merged.added.length > 0 ? [`added ${merged.added.join(', ')}`] : []),
            ...(merged.changed.length > 0 ? [`changed ${merged.changed.join(', ')}`] : []),
        ].join('; ')}`;
        return { ...text(summary), summary };
    };
    const extract = (input) => {
        const plan = planExtraction(context(), { element: input['element'], name: input['name'], alsoReplace: input['alsoReplace'] }, Object.keys(state.components));
        if (typeof plan === 'string')
            return text(plan, true);
        const source = state.elements[plan.id];
        const generated = generateComponentFromSubtree(state.elements, plan.id, plan.name, breakpoints);
        if (source === undefined || generated === null)
            return text('Scamp couldn’t extract that element.', true);
        let elements = state.elements;
        let replaced = 0;
        for (const id of [plan.id, ...plan.replaceIds]) {
            let instanceId = generateElementId();
            while (elements[instanceId] !== undefined)
                instanceId = generateElementId();
            const next = replaceSubtreeWithInstancePure(elements, id, plan.name, instanceId);
            if (next !== null) {
                elements = next;
                replaced += 1;
            }
        }
        state = { ...state, elements, components: { ...state.components, [plan.name]: generated } };
        const summary = `Made ${classNameFor(source)} into the component ${plan.name}${replaced > 1 ? `, and replaced ${replaced - 1} more with it` : ''}`;
        return { ...text(summary), summary };
    };
    const invoke = async (name, args) => {
        if (name === 'scamp_set_theme_tokens')
            return setThemeTokens(args);
        if (name === 'scamp_extract_component')
            return extract(args);
        const edit = EDITS[name];
        if (edit === undefined)
            return read(name, args);
        const result = edit(context(), args);
        if (!result.ok)
            return text(result.error, true);
        state = { ...state, elements: result.elements };
        const feedback = editFeedback(result, state.rootId, tokenNames());
        return { ...text(feedback.text), summary: feedback.summary };
    };
    return { invoke, state: () => state };
};

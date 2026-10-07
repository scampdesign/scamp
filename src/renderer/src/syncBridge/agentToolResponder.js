import { addElement, deleteElement, editFeedback, mergeThemeTokens, planExtraction, planInstanceSwap, renameList, setShow, moveElement, setAttributes, setStyles, setTag, setText, wrapElements, } from '@lib/agentEdits';
import { treeNameFor } from '@lib/canvasSnapshot';
import { generateComponentFromSubtree } from '@lib/extractComponent';
import { classNameFor } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { parseThemeFile, serializeThemeFile } from '@lib/parseTheme';
import { currentConversationKey, sameConversation, useAgentStore } from '@store/agentSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { editOffCanvas, extractOffCanvas, forgetOffCanvasDraft, forgetOffCanvasDrafts, swapInOffCanvas, } from './agentOffCanvas';
const EDITS = {
    scamp_set_styles: (ctx, a) => setStyles(ctx, { ...a, element: a['element'] }),
    scamp_add_element: (ctx, a) => addElement(ctx, { ...a, parent: a['parent'] }),
    scamp_set_text: (ctx, a) => setText(ctx, { element: a['element'], text: a['text'] }),
    scamp_set_tag: (ctx, a) => setTag(ctx, { element: a['element'], tag: a['tag'] }),
    scamp_set_attributes: (ctx, a) => setAttributes(ctx, { element: a['element'], attributes: a['attributes'] }),
    scamp_move_element: (ctx, a) => moveElement(ctx, { ...a, element: a['element'], parent: a['parent'] }),
    scamp_wrap_elements: (ctx, a) => wrapElements(ctx, { ...a, elements: a['elements'] }),
    scamp_delete_element: (ctx, a) => deleteElement(ctx, { element: a['element'] }),
    scamp_set_show: (ctx, a) => setShow(ctx, { element: a['element'], flag: a['flag'], shown: a['shown'] }),
    scamp_rename_list: (ctx, a) => renameList(ctx, { list: a['list'], to: a['to'], row: a['row'], fields: a['fields'] }),
};
/** The turn whose history transaction is open, and what it touched. */
let open = null;
const closeTurn = () => {
    if (open === null)
        return;
    const { touched } = open;
    open = null;
    useHistoryStore
        .getState()
        .endHistoryTransaction({ kind: 'agent-edit', elementIds: [...touched] }, useCanvasStore.getState().elements);
};
/** The turn is over: commit its edits as one undo step. */
export const endAgentTurnHistory = (turnId) => {
    forgetOffCanvasDrafts();
    if (open?.turnId === turnId)
        closeTurn();
};
/** Open this turn's history transaction, closing any other. */
const enterTurn = (turnId) => {
    if (open?.turnId !== turnId) {
        closeTurn();
        useHistoryStore.getState().beginHistoryTransaction();
        open = { turnId, touched: new Set() };
    }
    return open.touched;
};
const contextFrom = (state) => ({
    elements: state.elements,
    rootId: state.rootElementId,
    breakpoints: state.breakpoints,
    isComponent: state.activeComponent?.kind === 'component',
});
/** Add or change theme tokens in theme.css — not in the undo stack, so said so. */
const setThemeTokens = async (projectPath, input) => {
    const existing = await window.scamp.readTheme({ projectPath });
    const model = parseThemeFile(existing);
    const merged = mergeThemeTokens(model.tokens, input['tokens']);
    if (typeof merged === 'string')
        return { ok: false, text: merged };
    if (merged.added.length === 0 && merged.changed.length === 0) {
        return { ok: true, text: 'Every token already had that value; nothing changed.', summary: 'Theme tokens unchanged' };
    }
    const next = { ...model, tokens: merged.tokens };
    useCanvasStore.getState().setThemeData(next);
    await window.scamp.writeTheme({ projectPath, content: serializeThemeFile(next, existing) });
    const summary = [
        ...(merged.added.length > 0 ? [`added ${merged.added.join(', ')}`] : []),
        ...(merged.changed.length > 0 ? [`changed ${merged.changed.join(', ')}`] : []),
    ].join('; ');
    return {
        ok: true,
        summary: `Theme tokens — ${summary}`,
        text: `Theme tokens — ${summary}\nTheme changes aren't in Cmd+Z; Undo AI changes reverts them.`,
    };
};
/** A container into a component, and any look-alikes into instances of it. */
const extractComponent = async (projectPath, input, turnId) => {
    const state = useCanvasStore.getState();
    const plan = planExtraction(contextFrom(state), { element: input['element'], name: input['name'], alsoReplace: input['alsoReplace'] }, Object.keys(state.componentTrees));
    if (typeof plan === 'string')
        return { ok: false, text: plan };
    const source = state.elements[plan.id];
    const generated = generateComponentFromSubtree(state.elements, plan.id, plan.name, state.breakpoints);
    if (source === undefined || generated === null)
        return { ok: false, text: 'Scamp couldn’t extract that element.' };
    await window.scamp.createComponent({
        projectPath,
        componentName: plan.name,
        tsxContent: generated.tsx,
        cssContent: generated.css,
    });
    // Rendered at once from the files just written; the project re-read
    // main triggers next adds it to the sidebar.
    const parsed = parseCode(generated.tsx, generated.css, { breakpoints: state.breakpoints, isComponent: true });
    state.setComponentTrees({
        ...state.componentTrees,
        [plan.name]: { elements: parsed.elements, rootId: parsed.rootId, kind: 'component' },
    });
    const touched = enterTurn(turnId);
    const replaced = [];
    for (const id of [plan.id, ...plan.replaceIds]) {
        const el = useCanvasStore.getState().elements[id];
        if (el === undefined)
            continue;
        const instanceId = useCanvasStore.getState().replaceSubtreeWithInstance(id, plan.name);
        if (instanceId !== null) {
            touched.add(instanceId);
            replaced.push(classNameFor(el));
        }
    }
    const others = replaced.length - 1;
    const summary = `Made ${classNameFor(source)} into the component ${plan.name}${others > 0 ? `, and replaced ${others} more with it` : ''}`;
    return { ok: true, summary, text: summary, createdComponent: plan.name };
};
const componentNames = (trees) => Object.keys(trees).filter((name) => trees[name] !== undefined && (trees[name]?.kind ?? 'component') === 'component');
/** A container on the canvas into an instance of an existing component. */
const swapInComponent = (input, turnId) => {
    const state = useCanvasStore.getState();
    const editing = state.activeComponent?.kind === 'component' ? state.activeComponent.name : null;
    const plan = planInstanceSwap(contextFrom(state), { element: input['element'], component: input['component'] }, componentNames(state.componentTrees), editing);
    if (typeof plan === 'string')
        return { ok: false, text: plan };
    const el = state.elements[plan.id];
    const instanceId = state.replaceSubtreeWithInstance(plan.id, plan.name);
    if (el === undefined || instanceId === null)
        return { ok: false, text: 'Scamp couldn’t replace that element.' };
    enterTurn(turnId).add(instanceId);
    const summary = `Replaced ${classNameFor(el)} with ${plan.name}`;
    return { ok: true, summary, text: summary };
};
/**
 * `view` names the view; without it, the edit is for the conversation's
 * own view — which may no longer be the open one, if the user moved on.
 */
const destinationFor = (input, turnId) => {
    const state = useCanvasStore.getState();
    const open = currentConversationKey();
    const asked = typeof input['view'] === 'string' ? input['view'].trim() : '';
    const running = useAgentStore.getState().runningTurn;
    const conversation = running !== null && running.turnId === turnId ? running.conversation : null;
    if (asked.length === 0 && (conversation === null || sameConversation(conversation, open)))
        return { on: 'canvas' };
    const wanted = asked.length > 0 ? asked : (conversation?.name ?? '');
    const name = treeNameFor(state.componentTrees, wanted);
    if (name === null) {
        if (open !== null && open.name === wanted)
            return { on: 'canvas' };
        // A legacy page has no stored tree to edit behind the canvas.
        return {
            on: 'refused',
            text: asked.length > 0
                ? `No view or component named "${asked}". scamp_list_pages (the \`view\` field) and scamp_list_components list them.`
                : `The user left ${wanted} for ${open?.name ?? 'another page'}, and ${wanted} can only be edited while it's open, so this edit wasn't made. Tell the user to go back to ${wanted} to continue.`,
        };
    }
    if (open !== null && open.kind !== 'page' && open.name === name) {
        forgetOffCanvasDraft(name);
        return { on: 'canvas' };
    }
    return { on: 'files', name, kind: state.componentTrees[name]?.kind ?? 'component' };
};
/** Make one edit, for turn `turnId`. Exported for tests. */
export const executeAgentEdit = async (tool, input, turnId) => {
    const state = useCanvasStore.getState();
    if (!state.projectPath)
        return { ok: false, text: 'No project is open in Scamp.' };
    if (state.snapshotPreview !== null) {
        return { ok: false, text: 'Scamp is showing a snapshot preview, which is read-only. Ask the user to exit it.' };
    }
    // The theme is the project's, whichever view is open.
    if (tool === 'scamp_set_theme_tokens')
        return setThemeTokens(state.projectPath, input);
    const edit = EDITS[tool];
    if (edit === undefined && tool !== 'scamp_extract_component' && tool !== 'scamp_use_component') {
        return { ok: false, text: `Unknown edit: ${tool}` };
    }
    const destination = destinationFor(input, turnId);
    if (destination.on === 'refused')
        return { ok: false, text: destination.text };
    if (destination.on === 'files') {
        const { name, kind } = destination;
        if (tool === 'scamp_extract_component')
            return extractOffCanvas(state.projectPath, name, kind, input);
        if (tool === 'scamp_use_component')
            return swapInOffCanvas(state.projectPath, name, kind, input);
        if (edit === undefined)
            return { ok: false, text: `Unknown edit: ${tool}` };
        return editOffCanvas(state.projectPath, name, kind, (ctx) => edit(ctx, input));
    }
    if (tool === 'scamp_extract_component')
        return extractComponent(state.projectPath, input, turnId);
    if (tool === 'scamp_use_component')
        return swapInComponent(input, turnId);
    if (edit === undefined)
        return { ok: false, text: `Unknown edit: ${tool}` };
    const result = edit(contextFrom(state), input);
    if (!result.ok)
        return { ok: false, text: result.error };
    const turnTouched = enterTurn(turnId);
    for (const id of result.touched)
        turnTouched.add(id);
    state.applyAgentElements(result.elements, result.touched);
    const feedback = editFeedback(result, state.rootElementId, state.themeTokens.map((token) => token.name));
    return { ok: true, summary: feedback.summary, text: feedback.text };
};
export const installAgentToolResponder = () => window.scamp.onAgentToolCall(({ requestId, tool, args }) => {
    void executeAgentEdit(tool, args.input, args.turnId)
        .then((answer) => window.scamp.sendAgentToolResult({ requestId, ok: true, data: answer }))
        .catch((err) => window.scamp.sendAgentToolResult({
        requestId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
    }));
});

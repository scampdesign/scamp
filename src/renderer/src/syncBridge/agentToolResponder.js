import { addElement, moveElement, setAttributes, setStyles, setTag, setText, wrapElements, } from '@lib/agentEdits';
import { classNameFor } from '@lib/generateCode';
import { lintView } from '@lib/viewLint';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
const EDITS = {
    scamp_set_styles: (ctx, a) => setStyles(ctx, { ...a, element: a['element'] }),
    scamp_add_element: (ctx, a) => addElement(ctx, { ...a, parent: a['parent'] }),
    scamp_set_text: (ctx, a) => setText(ctx, { element: a['element'], text: a['text'] }),
    scamp_set_tag: (ctx, a) => setTag(ctx, { element: a['element'], tag: a['tag'] }),
    scamp_set_attributes: (ctx, a) => setAttributes(ctx, { element: a['element'], attributes: a['attributes'] }),
    scamp_move_element: (ctx, a) => moveElement(ctx, { ...a, element: a['element'], parent: a['parent'] }),
    scamp_wrap_elements: (ctx, a) => wrapElements(ctx, { ...a, elements: a['elements'] }),
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
    if (open?.turnId === turnId)
        closeTurn();
};
/** Make one edit, for turn `turnId`. Exported for tests. */
export const executeAgentEdit = (tool, input, turnId) => {
    const edit = EDITS[tool];
    if (edit === undefined)
        return { ok: false, text: `Unknown edit: ${tool}` };
    const state = useCanvasStore.getState();
    if (!state.projectPath)
        return { ok: false, text: 'No project is open in Scamp.' };
    if (state.snapshotPreview !== null) {
        return { ok: false, text: 'Scamp is showing a snapshot preview, which is read-only. Ask the user to exit it.' };
    }
    const ctx = {
        elements: state.elements,
        rootId: state.rootElementId,
        breakpoints: state.breakpoints,
        isComponent: state.activeComponent?.kind === 'component',
    };
    const result = edit(ctx, input);
    if (!result.ok)
        return { ok: false, text: result.error };
    if (open?.turnId !== turnId) {
        closeTurn();
        useHistoryStore.getState().beginHistoryTransaction();
        open = { turnId, touched: new Set() };
    }
    for (const id of result.touched)
        open.touched.add(id);
    state.applyAgentElements(result.elements, result.touched);
    // What Scamp's own check says about what was just touched — the same
    // findings the Checks section shows, so the agent can fix its own work.
    const touched = new Set(result.touched);
    const findings = lintView({
        elements: result.elements,
        rootId: state.rootElementId,
        themeTokens: state.themeTokens.map((token) => token.name),
    }).filter((f) => f.elementId !== null && touched.has(f.elementId));
    const findingLines = findings.map((f) => `Check: ${f.className ?? ''} — ${f.message}${f.hint !== undefined ? ` ${f.hint}` : ''}`);
    const ids = result.touched
        .map((id) => result.elements[id])
        .flatMap((el) => (el === undefined ? [] : [`${classNameFor(el)} (id ${el.id})`]));
    return {
        ok: true,
        summary: result.summary,
        text: [result.summary, `Touched: ${ids.join(', ')}`, ...result.notes, ...findingLines].join('\n'),
    };
};
export const installAgentToolResponder = () => window.scamp.onAgentToolCall(({ requestId, tool, args }) => {
    try {
        const answer = executeAgentEdit(tool, args.input, args.turnId);
        window.scamp.sendAgentToolResult({ requestId, ok: true, data: answer });
    }
    catch (err) {
        window.scamp.sendAgentToolResult({
            requestId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
});

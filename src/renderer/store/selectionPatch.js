import { fitPatch } from '@lib/multiEdit';
import { resolveElementAtState } from '@lib/stateCascade';
import { useCanvasStore } from './canvasSlice';
import { useHistoryStore } from './historySlice';
const resolvedOf = (id) => {
    const s = useCanvasStore.getState();
    const el = s.elements[id];
    return el === undefined ? undefined : resolveElementAtState(el, s.activeBreakpointId, s.breakpoints, s.activeStateName);
};
const build = (input, id) => {
    if (typeof input !== 'function')
        return input;
    const resolved = resolvedOf(id);
    return resolved === undefined ? null : input(resolved);
};
/** The selection, when `leadId` is one of two or more selected elements. */
const multiSelection = (leadId) => {
    const ids = useCanvasStore.getState().selectedElementIds;
    return ids.length >= 2 && ids.includes(leadId) ? ids : null;
};
/** Run `edit` as one undo step covering `ids`. */
const asOneStep = (ids, propertyKeys, edit) => {
    if (useCanvasStore.getState().snapshotPreview !== null)
        return;
    const before = useCanvasStore.getState().elements;
    useHistoryStore.getState().beginHistoryTransaction();
    try {
        edit();
    }
    finally {
        const after = useCanvasStore.getState().elements;
        // An edit that changed nothing leaves no undo step.
        if (after === before)
            useHistoryStore.getState().cancelHistoryTransaction();
        else
            useHistoryStore.getState().endHistoryTransaction({ kind: 'patch', elementIds: ids, propertyKeys }, after);
    }
};
/**
 * `patchElement` for a properties-panel section: with several elements
 * selected, the patch reaches each one `fits` accepts, routed into its
 * own breakpoint or state override. see docs/plans/multi-select-edit-plan.md
 */
export const patchSelection = (fits, leadId, input) => {
    const { patchElement } = useCanvasStore.getState();
    const ids = multiSelection(leadId);
    if (ids === null) {
        const patch = build(input, leadId);
        if (patch !== null)
            patchElement(leadId, patch);
        return;
    }
    const leadPatch = build(input, leadId) ?? {};
    asOneStep(ids, Object.keys(leadPatch), () => {
        for (const id of ids) {
            const el = useCanvasStore.getState().elements[id];
            const patch = el === undefined || !fits(el) ? null : build(input, id);
            const fitted = el === undefined || patch === null ? null : fitPatch(el, patch, fits, id === leadId);
            if (fitted !== null)
                patchElement(id, fitted);
        }
    });
};
/** `patchCustomProperties` for a section; each element merges into its own custom CSS. */
export const patchSelectionCustomProperties = (fits, leadId, patch) => {
    const { patchCustomProperties } = useCanvasStore.getState();
    const ids = multiSelection(leadId);
    if (ids === null) {
        patchCustomProperties(leadId, patch);
        return;
    }
    asOneStep(ids, ['customProperties'], () => {
        for (const id of ids) {
            const el = useCanvasStore.getState().elements[id];
            if (el !== undefined && fits(el))
                patchCustomProperties(id, patch);
        }
    });
};
/**
 * Run `edit` on every selected element `fits` accepts when `leadId` is
 * part of a multi-selection, as one undo step; otherwise on `leadId`
 * alone. For panel actions that aren't a patch: an override reset, a
 * group's eye toggle.
 */
export const forSelection = (fits, leadId, propertyKeys, edit) => {
    const ids = multiSelection(leadId);
    if (ids === null) {
        edit(leadId);
        return;
    }
    asOneStep(ids, propertyKeys, () => {
        for (const id of ids) {
            const el = useCanvasStore.getState().elements[id];
            if (el !== undefined && fits(el))
                edit(id);
        }
    });
};
/** The two writers above, bound to one section's fit. */
export const selectionPatchers = (fits) => ({
    patchElement: (id, patch) => patchSelection(fits, id, patch),
    patchCustomProperties: (id, patch) => patchSelectionCustomProperties(fits, id, patch),
});

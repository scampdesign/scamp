import { fitPatch } from '@lib/multiEdit';
import { useCanvasStore } from './canvasSlice';
import { useHistoryStore } from './historySlice';
/** The selection, when `leadId` is one of two or more selected elements. */
const multiSelection = (leadId) => {
    const ids = useCanvasStore.getState().selectedElementIds;
    return ids.length >= 2 && ids.includes(leadId) ? ids : null;
};
/** Run `edit` as one undo step covering `ids`. */
const asOneStep = (ids, propertyKeys, edit) => {
    if (useCanvasStore.getState().snapshotPreview !== null)
        return;
    useHistoryStore.getState().beginHistoryTransaction();
    try {
        edit();
    }
    finally {
        useHistoryStore
            .getState()
            .endHistoryTransaction({ kind: 'patch', elementIds: ids, propertyKeys }, useCanvasStore.getState().elements);
    }
};
/**
 * `patchElement` for a properties-panel section: with several elements
 * selected, the patch reaches each one `fits` accepts, routed into its
 * own breakpoint or state override. see docs/plans/multi-select-edit-plan.md
 */
export const patchSelection = (fits, leadId, patch) => {
    const { patchElement } = useCanvasStore.getState();
    const ids = multiSelection(leadId);
    if (ids === null) {
        patchElement(leadId, patch);
        return;
    }
    asOneStep(ids, Object.keys(patch), () => {
        for (const id of ids) {
            const el = useCanvasStore.getState().elements[id];
            const fitted = el === undefined ? null : fitPatch(el, patch, fits, id === leadId);
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
/** The two writers above, bound to one section's fit. */
export const selectionPatchers = (fits) => ({
    patchElement: (id, patch) => patchSelection(fits, id, patch),
    patchCustomProperties: (id, patch) => patchSelectionCustomProperties(fits, id, patch),
});

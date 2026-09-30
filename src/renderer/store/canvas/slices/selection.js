export const createSelectionSlice = (set) => ({
    selectedElementIds: [],
    editingElementId: null,
    editingInstanceProp: null,
    /**
     * The characters selected inside a text element, as offsets over its
     * joined text — what `applyStyleToRange` and `styleOfRange` take.
     *
     * Transient UI state, beside `editingElementId` for the same reason:
     * it lives for as long as the caret does and never reaches a file.
     * see docs/plans/inline-spans-plan.md
     */
    textSelection: null,
    activeTool: 'select',
    setTool: (tool) => set({ activeTool: tool }),
    selectElement: (id) => set((state) => ({
        selectedElementIds: id === null ? [] : [id],
        // Selecting something else drops the range. Without this a stale
        // selection styles words the user is no longer looking at, the
        // next time they touch a control.
        textSelection: id === state.textSelection?.elementId ? state.textSelection : null,
    })),
    toggleSelectElement: (id) => set((state) => {
        const idx = state.selectedElementIds.indexOf(id);
        if (idx >= 0) {
            const next = [...state.selectedElementIds];
            next.splice(idx, 1);
            return { selectedElementIds: next };
        }
        return { selectedElementIds: [...state.selectedElementIds, id] };
    }),
    setEditingElement: (id) => set((state) => ({
        editingElementId: id,
        // LEAVING edit mode keeps the selection, because reaching the
        // properties panel IS leaving edit mode: clicking a control
        // blurs the contentEditable. Clearing here meant selecting a
        // word and clicking Bold emboldened the whole element, since the
        // range was gone before the control fired.
        //
        // Moving to a DIFFERENT element still clears it — offsets into
        // one element's text mean nothing in another's.
        textSelection: id === null || id === state.textSelection?.elementId ? state.textSelection : null,
    })),
    setTextSelection: (selection) => set({ textSelection: selection }),
    setEditingInstanceProp: (value) => set({ editingInstanceProp: value }),
});

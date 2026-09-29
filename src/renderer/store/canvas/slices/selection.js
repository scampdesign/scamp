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
    selectElement: (id) => set({ selectedElementIds: id === null ? [] : [id] }),
    toggleSelectElement: (id) => set((state) => {
        const idx = state.selectedElementIds.indexOf(id);
        if (idx >= 0) {
            const next = [...state.selectedElementIds];
            next.splice(idx, 1);
            return { selectedElementIds: next };
        }
        return { selectedElementIds: [...state.selectedElementIds, id] };
    }),
    setEditingElement: (id) => 
    // A new edit target invalidates the old selection — offsets into
    // one element's text mean nothing in another's.
    set({ editingElementId: id, textSelection: null }),
    setTextSelection: (selection) => set({ textSelection: selection }),
    setEditingInstanceProp: (value) => set({ editingInstanceProp: value }),
});

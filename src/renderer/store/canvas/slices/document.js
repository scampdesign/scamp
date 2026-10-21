import { ROOT_ELEMENT_ID, } from '@lib/element';
import { useHistoryStore } from '../../historySlice';
import { isVariantKeyLive } from '@lib/variantAxes';
import { makeRootElement, } from '../factories';
export const createDocumentSlice = (set) => ({
    activePage: null,
    activeComponent: null,
    pageSource: null,
    isLoading: false,
    lastLoadKind: null,
    cssDuplicates: {},
    pageCustomMediaBlocks: [],
    pageKeyframesBlocks: [],
    componentTrees: {},
    snapshotPreview: null,
    enterSnapshotPreview: (meta, content) => {
        set((state) => ({
            snapshotPreview: {
                ...meta,
                // Keep the ORIGINAL stash when switching between previews, so
                // Exit always returns to the real pre-preview state.
                stash: state.snapshotPreview?.stash ?? {
                    elements: state.elements,
                    source: state.pageSource,
                    customMediaBlocks: state.pageCustomMediaBlocks,
                    keyframesBlocks: state.pageKeyframesBlocks,
                    cssDuplicates: state.cssDuplicates,
                },
            },
            elements: content.elements,
            pageSource: content.source,
            pageCustomMediaBlocks: content.customMediaBlocks,
            pageKeyframesBlocks: content.keyframesBlocks,
            cssDuplicates: content.cssDuplicates,
            selectedElementIds: [],
        }));
    },
    exitSnapshotPreview: () => {
        set((state) => {
            const preview = state.snapshotPreview;
            if (preview === null)
                return state;
            return {
                snapshotPreview: null,
                elements: preview.stash.elements,
                pageSource: preview.stash.source,
                pageCustomMediaBlocks: preview.stash.customMediaBlocks,
                pageKeyframesBlocks: preview.stash.keyframesBlocks,
                cssDuplicates: preview.stash.cssDuplicates,
                selectedElementIds: [],
            };
        });
    },
    clearSnapshotPreview: () => {
        set((state) => state.snapshotPreview === null ? state : { snapshotPreview: null });
    },
    loadPage: (page, elements, source, customMediaBlocks, keyframesBlocks, cssDuplicates) => {
        set((state) => ({
            activePage: page,
            // Mutually exclusive with activeComponent — leaving the
            // previous component reference in place while editing a
            // page would confuse the sync bridge about which file pair
            // to write back to.
            activeComponent: null,
            elements,
            pageSource: source,
            pageCustomMediaBlocks: customMediaBlocks ?? [],
            pageKeyframesBlocks: keyframesBlocks ?? [],
            cssDuplicates: cssDuplicates ?? {},
            selectedElementIds: [],
            isLoading: true,
            lastLoadKind: 'initial',
            // Navigating to a page voids any snapshot-preview lock so the new
            // page is editable — without this the read-only lock leaks across
            // navigation. See docs/notes/snapshots.md.
            snapshotPreview: null,
            // Data tab is component-only; fall back when leaving a component.
            panelMode: state.panelMode === 'data' ? 'ui' : state.panelMode,
            // Collapse state is keyed by element id, and ids are scoped to their
            // own page, so carrying it to a DIFFERENT page would collapse an
            // unrelated element. Only clear on an actual target change —
            // `loadPage` is also the reload path (external edits, a theme-panel
            // round trip), and wiping the user's tree view on those would be a
            // bug in itself. see docs/archive/2026-08-11-tree-collapse-plan.md
            collapsedIds: state.activePage?.tsxPath === page.tsxPath ? state.collapsedIds : {},
            activeVariantKey: null,
        }));
        useHistoryStore.getState().setActivePageId(page.tsxPath);
        // Seed the history bucket so Cmd+Z can return to this state.
        useHistoryStore.getState().commitInitialIfEmpty(elements);
    },
    loadComponent: (component, elements, source, customMediaBlocks, keyframesBlocks, cssDuplicates) => {
        set((state) => ({
            activeComponent: component,
            // Same mutual-exclusivity rule as loadPage. We don't carry
            // a "returnTo page" in store state for Phase 2 — the
            // ProjectShell tracks the entry-point page in its own
            // React state since that's a UI concern.
            activePage: null,
            elements,
            pageSource: source,
            pageCustomMediaBlocks: customMediaBlocks ?? [],
            pageKeyframesBlocks: keyframesBlocks ?? [],
            cssDuplicates: cssDuplicates ?? {},
            selectedElementIds: [],
            isLoading: true,
            lastLoadKind: 'initial',
            // Entering a component voids any snapshot-preview lock (snapshots.md).
            snapshotPreview: null,
            // Same reasoning as loadPage — only clear on a real target change.
            collapsedIds: state.activeComponent?.tsxPath === component.tsxPath
                ? state.collapsedIds
                : {},
            activeVariantKey: state.activeComponent?.tsxPath === component.tsxPath &&
                state.activeVariantKey !== null &&
                isVariantKeyLive(elements, state.activeVariantKey)
                ? state.activeVariantKey
                : null,
        }));
        // Components get their own per-target history bucket keyed by
        // their tsxPath — same shape as pages so the history slice
        // doesn't need component-aware code.
        useHistoryStore.getState().setActivePageId(component.tsxPath);
        useHistoryStore.getState().commitInitialIfEmpty(elements);
    },
    reloadElements: (elements, source, customMediaBlocks, keyframesBlocks, cssDuplicates) => {
        set((state) => ({
            elements,
            pageSource: source,
            pageCustomMediaBlocks: customMediaBlocks ?? state.pageCustomMediaBlocks,
            pageKeyframesBlocks: keyframesBlocks ?? state.pageKeyframesBlocks,
            cssDuplicates: cssDuplicates ?? state.cssDuplicates,
            // Drop any selection that no longer exists in the new tree (the file
            // could have been edited externally to remove an element).
            selectedElementIds: state.selectedElementIds.filter((id) => id in elements),
            // An external edit can remove the value being edited.
            activeVariantKey: state.activeVariantKey !== null && isVariantKeyLive(elements, state.activeVariantKey)
                ? state.activeVariantKey
                : null,
            isLoading: true,
            lastLoadKind: 'external',
            // An external edit replacing the canvas voids any snapshot-preview
            // lock — drop it so the reloaded content stays editable (snapshots.md).
            snapshotPreview: null,
        }));
        // syncBridge is responsible for pushing the `external-edit`
        // history entry (it calls enqueueExternalEdit AFTER reloadElements
        // settles); we don't push from here so initial-format-migration
        // reloads don't pollute the history.
    },
    setPageSource: (source) => set({ pageSource: source }),
    setComponentTrees: (trees) => set({ componentTrees: trees }),
    resetForNewPage: () => set({
        elements: { [ROOT_ELEMENT_ID]: makeRootElement() },
        selectedElementIds: [],
        editingElementId: null,
        activePage: null,
        activeComponent: null,
        pageSource: null,
        // Clearing the target voids any snapshot-preview lock (snapshots.md).
        snapshotPreview: null,
        isLoading: false,
        // Drop the manual zoom too — we want a fresh project to start in
        // fit-to-container mode regardless of the previous session.
        userZoom: null,
        // Ratio locks are keyed by element id; drop them so ids from the
        // old page can't collide with the new page's elements.
        ratioLocks: {},
    }),
});

import { create } from 'zustand';
import { COALESCE_WINDOW_MS, MAX_HISTORY_ENTRIES, } from './historyTypes';
/**
 * Generate a stable id for an entry. Not cryptographic — just
 * unique enough to use as a React key within a single session.
 */
let _entryCounter = 0;
const nextEntryId = () => {
    _entryCounter += 1;
    return `h${Date.now().toString(36)}_${_entryCounter}`;
};
const emptyPageHistory = () => ({ entries: [], cursor: -1 });
const arraysEqual = (a, b) => {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
};
const propertyKeysEqual = (a, b) => {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    // Order-insensitive — `[bg, opacity]` matches `[opacity, bg]`.
    const sa = new Set(a);
    for (const k of b) {
        if (!sa.has(k))
            return false;
    }
    return true;
};
/**
 * Decide whether to coalesce `input` into the previous entry.
 * Same kind ('patch'), same element ids, same property keys,
 * within the coalesce window. Other kinds never coalesce.
 */
const shouldCoalesce = (prev, input, now) => {
    if (input.kind !== 'patch' || prev.kind !== 'patch')
        return false;
    if (!arraysEqual(prev.elementIds, input.elementIds ?? []))
        return false;
    if (!propertyKeysEqual(prev.propertyKeys, input.propertyKeys))
        return false;
    if (now - prev.timestamp > COALESCE_WINDOW_MS)
        return false;
    return true;
};
export const useHistoryStore = create((set, get) => ({
    perPage: {},
    activePageId: null,
    transactionDepth: 0,
    pendingExternalEdit: null,
    restoreSnapshot: null,
    setActivePageId: (pageId) => {
        set((state) => {
            if (pageId === state.activePageId)
                return state;
            if (pageId === null)
                return { activePageId: null };
            const existing = state.perPage[pageId];
            if (existing)
                return { activePageId: pageId };
            return {
                activePageId: pageId,
                perPage: { ...state.perPage, [pageId]: emptyPageHistory() },
            };
        });
    },
    setRestoreSnapshot: (fn) => set({ restoreSnapshot: fn }),
    commitHistory: (input, snapshot) => {
        const state = get();
        // Inside a transaction: skip individual commits. The wrapping
        // `endHistoryTransaction` will commit one entry covering the
        // net change.
        if (state.transactionDepth > 0)
            return;
        const pageId = state.activePageId;
        if (pageId === null)
            return;
        const page = state.perPage[pageId] ?? emptyPageHistory();
        const now = Date.now();
        const prev = page.cursor >= 0 ? page.entries[page.cursor] : undefined;
        // Identity short-circuit: a `set()` that produced the same
        // elements map reference shouldn't push.
        if (prev && prev.snapshot === snapshot)
            return;
        if (prev && shouldCoalesce(prev, input, now)) {
            // Replace the previous entry's snapshot and bump its
            // timestamp. Cursor stays put.
            const nextEntries = page.entries.slice();
            nextEntries[page.cursor] = {
                ...prev,
                snapshot,
                timestamp: now,
            };
            set({
                perPage: {
                    ...state.perPage,
                    [pageId]: { entries: nextEntries, cursor: page.cursor },
                },
            });
            return;
        }
        // Trim forward entries (anything after the cursor) — a new
        // change discards the redo stack.
        const trimmed = page.entries.slice(0, page.cursor + 1);
        const entry = {
            id: nextEntryId(),
            timestamp: now,
            kind: input.kind,
            elementIds: input.elementIds ?? [],
            propertyKeys: input.propertyKeys,
            previousName: input.previousName,
            pageName: input.pageName,
            toggleGroup: input.toggleGroup,
            toggleGroupOn: input.toggleGroupOn,
            snapshot,
        };
        trimmed.push(entry);
        // Enforce the per-page cap by dropping the oldest entries.
        let nextEntries = trimmed;
        let nextCursor = trimmed.length - 1;
        if (trimmed.length > MAX_HISTORY_ENTRIES) {
            const drop = trimmed.length - MAX_HISTORY_ENTRIES;
            nextEntries = trimmed.slice(drop);
            nextCursor = nextEntries.length - 1;
        }
        set({
            perPage: {
                ...state.perPage,
                [pageId]: { entries: nextEntries, cursor: nextCursor },
            },
        });
    },
    jumpToHistory: (targetIndex) => {
        const state = get();
        const pageId = state.activePageId;
        if (pageId === null)
            return;
        const page = state.perPage[pageId];
        if (!page)
            return;
        if (targetIndex < 0 || targetIndex >= page.entries.length)
            return;
        if (targetIndex === page.cursor)
            return;
        const entry = page.entries[targetIndex];
        if (!entry)
            return;
        set({
            perPage: {
                ...state.perPage,
                [pageId]: { entries: page.entries, cursor: targetIndex },
            },
        });
        state.restoreSnapshot?.(entry.snapshot);
    },
    commitInitialIfEmpty: (snapshot) => {
        const state = get();
        const pageId = state.activePageId;
        if (pageId === null)
            return;
        const page = state.perPage[pageId];
        if (page && page.entries.length > 0)
            return;
        const entry = {
            id: nextEntryId(),
            timestamp: Date.now(),
            kind: 'load',
            elementIds: [],
            snapshot,
        };
        set({
            perPage: {
                ...state.perPage,
                [pageId]: { entries: [entry], cursor: 0 },
            },
        });
    },
    undo: () => {
        const state = get();
        const pageId = state.activePageId;
        if (pageId === null)
            return;
        const page = state.perPage[pageId];
        if (!page || page.cursor <= 0)
            return;
        get().jumpToHistory(page.cursor - 1);
    },
    redo: () => {
        const state = get();
        const pageId = state.activePageId;
        if (pageId === null)
            return;
        const page = state.perPage[pageId];
        if (!page || page.cursor >= page.entries.length - 1)
            return;
        get().jumpToHistory(page.cursor + 1);
    },
    beginHistoryTransaction: () => {
        set((state) => ({ transactionDepth: state.transactionDepth + 1 }));
    },
    endHistoryTransaction: (input, snapshot) => {
        const state = get();
        if (state.transactionDepth === 0)
            return;
        const nextDepth = state.transactionDepth - 1;
        set({ transactionDepth: nextDepth });
        // Only the outermost end commits.
        if (nextDepth > 0)
            return;
        // Commit the transaction's entry. The commit path runs as if
        // no transaction was open — guarded by the temporary depth = 0.
        get().commitHistory(input, snapshot);
        // Drain any external edit that arrived during the transaction.
        const pending = get().pendingExternalEdit;
        if (pending) {
            set({ pendingExternalEdit: null });
            const restore = get().restoreSnapshot;
            restore?.(pending.snapshot);
            get().commitHistory({ kind: 'external-edit' }, pending.snapshot);
        }
    },
    cancelHistoryTransaction: () => {
        const state = get();
        if (state.transactionDepth === 0)
            return;
        const nextDepth = state.transactionDepth - 1;
        set({ transactionDepth: nextDepth });
        if (nextDepth > 0)
            return;
        // No entry: the caller has already put the canvas back where it
        // started, so committing would leave an undo step that does nothing.
        // An external edit that arrived mid-transaction still has to be
        // drained, though — dropping it would silently lose a file change.
        const pending = get().pendingExternalEdit;
        if (pending) {
            set({ pendingExternalEdit: null });
            const restore = get().restoreSnapshot;
            restore?.(pending.snapshot);
            get().commitHistory({ kind: 'external-edit' }, pending.snapshot);
        }
    },
    enqueueExternalEdit: (snapshot) => {
        const state = get();
        if (state.transactionDepth > 0) {
            // Defer until the transaction ends. The latest event wins
            // if multiple fire — the watcher's debounce means we're
            // already only seeing settled snapshots.
            set({ pendingExternalEdit: { snapshot } });
            return;
        }
        // No transaction: apply now. Caller (syncBridge) has already
        // updated canvas state; we just record the entry. Skip the
        // restore-callback path because the canvas is already at the
        // new state.
        get().commitHistory({ kind: 'external-edit' }, snapshot);
    },
    clearHistory: () => {
        const state = get();
        const pageId = state.activePageId;
        if (pageId === null)
            return;
        set({
            perPage: { ...state.perPage, [pageId]: emptyPageHistory() },
        });
    },
    clearAllHistory: () => {
        set({ perPage: {}, transactionDepth: 0, pendingExternalEdit: null });
    },
    forgetPage: (id) => {
        set((state) => {
            if (!(id in state.perPage))
                return state;
            const next = { ...state.perPage };
            delete next[id];
            return { perPage: next };
        });
    },
    rekeyPage: (oldId, newId) => {
        set((state) => {
            const existing = state.perPage[oldId];
            if (!existing)
                return state;
            const next = { ...state.perPage };
            next[newId] = existing;
            delete next[oldId];
            return {
                perPage: next,
                activePageId: state.activePageId === oldId ? newId : state.activePageId,
            };
        });
    },
}));
/** Read the active page's history. Returns an empty stack when no page is active. */
export const selectActivePageHistory = (state) => {
    if (state.activePageId === null)
        return emptyPageHistory();
    return state.perPage[state.activePageId] ?? emptyPageHistory();
};

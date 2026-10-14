import type { PropertyGroup, ScampElement } from '@lib/element';
import { type HistoryActionKind, type PageHistory } from './historyTypes';
/**
 * Metadata for a new entry. `id`, `timestamp`, and `snapshot` are
 * filled in by the slice when committing.
 */
export type HistoryCommitInput = {
    kind: HistoryActionKind;
    elementIds?: ReadonlyArray<string>;
    propertyKeys?: ReadonlyArray<keyof ScampElement>;
    previousName?: string;
    pageName?: string;
    toggleGroup?: PropertyGroup;
    toggleGroupOn?: boolean;
};
/**
 * Callback the canvas store registers so the history slice can
 * apply a snapshot when the user navigates (undo / redo / jump).
 * The history slice never mutates canvas state directly — it
 * delegates to this callback, which keeps the slice testable in
 * isolation.
 */
export type RestoreSnapshotFn = (snapshot: Record<string, ScampElement>) => void;
type HistoryState = {
    /** Keyed by `activePage.tsxPath` (or any stable page identifier). */
    perPage: Record<string, PageHistory>;
    /**
     * The page id whose history is currently visible / active. Set
     * by the canvas store when the active page changes. `null` when
     * no project / page is loaded.
     */
    activePageId: string | null;
    /**
     * Open-transaction counter. While > 0, `commitHistory` calls
     * suppress entry creation and only update the in-memory
     * elements map (the canvas slice is responsible for the actual
     * mutation; we just track that a transaction is open so
     * external-edit reloads can be deferred).
     */
    transactionDepth: number;
    /**
     * Queue of external-edit reloads received while a transaction
     * was open. Drained on transaction end. At most one entry —
     * multiple rapid fires collapse, the latest replaces the
     * pending one.
     */
    pendingExternalEdit: {
        snapshot: Record<string, ScampElement>;
    } | null;
    /**
     * Callback to apply a snapshot when navigating. Set by the
     * canvas store on app start; null in tests by default.
     */
    restoreSnapshot: RestoreSnapshotFn | null;
    /** Set the active page; ensures an entry exists in `perPage`. */
    setActivePageId: (pageId: string | null) => void;
    /** Register the snapshot-application callback. */
    setRestoreSnapshot: (fn: RestoreSnapshotFn | null) => void;
    /**
     * Commit a new entry to the active page. Subject to the
     * coalesce window for `kind: 'patch'` entries. Trims forward
     * entries beyond the current cursor before appending.
     *
     * `snapshot` is the post-mutation elements map. The caller has
     * already applied the mutation to canvas state; this just
     * records it.
     *
     * No-op when a transaction is open (the wrapping
     * `endHistoryTransaction` will commit one entry instead).
     */
    commitHistory: (input: HistoryCommitInput, snapshot: Record<string, ScampElement>) => void;
    /**
     * Seed the active page's bucket with a single `'load'` entry
     * (the freshly-loaded elements snapshot). No-op if the bucket
     * already has entries — page-switch back to a previously-loaded
     * page must NOT clobber existing history. This is what makes
     * `Cmd+Z` after a single draw able to return to the loaded
     * state instead of bottoming out at "nothing to undo".
     */
    commitInitialIfEmpty: (snapshot: Record<string, ScampElement>) => void;
    /**
     * Restore the active page's snapshot at `targetIndex` and move
     * the cursor there. No-op when out of range.
     */
    jumpToHistory: (targetIndex: number) => void;
    /** Convenience: cursor − 1. No-op when cursor <= 0. */
    undo: () => void;
    /** Convenience: cursor + 1. No-op at the head. */
    redo: () => void;
    /** Begin a transaction; entries committed inside are suppressed. */
    beginHistoryTransaction: () => void;
    /**
     * End the outermost transaction; commit one entry covering the
     * net change. `snapshot` is the post-transaction elements map.
     * No-op when called without a matching begin.
     *
     * After committing the transaction's entry, drain any pending
     * external-edit reload (Option B from the plan — defer
     * external edits during a drag).
     */
    endHistoryTransaction: (input: HistoryCommitInput, snapshot: Record<string, ScampElement>) => void;
    /**
     * Close the outermost transaction WITHOUT committing an entry — for a
     * gesture the user abandoned (Escape mid-drag). The caller is
     * responsible for restoring the pre-gesture state first.
     * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
     */
    cancelHistoryTransaction: () => void;
    /**
     * Queue an external edit for application after the current
     * transaction ends. Called by syncBridge when a file-watcher
     * event arrives during a drag. The snapshot is the parsed
     * elements map from the new on-disk state.
     *
     * When no transaction is open, applies immediately (and
     * commits a single `external-edit` entry).
     */
    enqueueExternalEdit: (snapshot: Record<string, ScampElement>) => void;
    /** Drop the active page's stack entirely. */
    clearHistory: () => void;
    /** Drop all per-page stacks (project switch). */
    clearAllHistory: () => void;
    /** Rekey a page's history (page rename). */
    rekeyPage: (oldId: string, newId: string) => void;
};
export declare const useHistoryStore: import("zustand").UseBoundStore<import("zustand").StoreApi<HistoryState>>;
/** Read the active page's history. Returns an empty stack when no page is active. */
export declare const selectActivePageHistory: (state: HistoryState) => PageHistory;
export {};

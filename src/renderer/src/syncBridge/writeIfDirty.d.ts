import { cssWriteFor } from './cssWrite';
import { tsxWriteFor } from './tsxWrite';
import type { KeyframesBlock, ScampElement } from '@lib/element';
import { type EditTarget } from './editTarget';
import type { SaveContext, WriteConflict, WriteIntent } from './saveContext';
/**
 * Resync the canvas to a competing on-disk version when main rejects our
 * write with a conflict. See docs/notes/agent-coexistence.md. Adopts the
 * actual disk content as the new synced state, parses + reloads elements,
 * and surfaces a one-line app-log message.
 *
 * `silent: true` is set by the initial-load canonical migration — the
 * reload still happens (we adopt disk content), but we suppress the
 * `reloaded-from-disk` indicator and the "your in-flight edit was dropped"
 * app-log line, because the user had NO in-flight edit.
 *
 * Phase 4 of docs/plans/incremental-writes-plan.md puts a merge in
 * front of all that: with `intent` — what the refused write was trying
 * to do — a drift that touches other lines is merged and written,
 * and only a real overlap reaches the reload below. The merged write
 * carries no intent of its own, so a second conflict adopts disk.
 */
export declare const makeOnWriteConflict: (ctx: SaveContext) => (target: EditTarget, conflict: WriteConflict, silent?: boolean, intent?: WriteIntent) => void;
/**
 * The files a save would write for this canvas: the generated code, laid
 * over what's on disk (`lastSerialized`) so only changed rules are
 * rewritten. Shared by the save and by the merge an external edit runs
 * when the canvas has unsaved changes.
 */
export declare const serializeCanvas: (ctx: SaveContext, elements: Record<string, ScampElement>, rootElementId: string, target: EditTarget, customMediaBlocks: ReadonlyArray<string>, pageKeyframesBlocks: ReadonlyArray<KeyframesBlock>) => {
    code: {
        tsx: string;
        css: string;
    };
    tsxOut: ReturnType<typeof tsxWriteFor>;
    cssOut: ReturnType<typeof cssWriteFor>;
};
/**
 * Generate code for the given (elements, rootId, page) tuple and write
 * it to disk if it differs from the last-written cache. Pure with
 * respect to its arguments — used by the debounced flush, the page-
 * switch flush, and the beforeunload flush, all of which need to write a
 * SPECIFIC snapshot rather than whatever the store currently holds.
 *
 * `customMediaBlocks` and `pageKeyframesBlocks` are passed in (not read
 * from the store) because the page-switch flush fires AFTER `loadPage(B)`
 * has swapped the store's per-page CSS into B's values.
 *
 * `silent` is set by the canonical-migration call site (initial load). It
 * propagates through to `onWriteConflict` so a conflict adopts disk
 * without flashing the "Reloaded" indicator.
 */
export declare const makeWriteIfDirty: (ctx: SaveContext) => (elements: Record<string, ScampElement>, rootElementId: string, target: EditTarget, customMediaBlocks: ReadonlyArray<string>, pageKeyframesBlocks: ReadonlyArray<KeyframesBlock>, silent?: boolean, evenIfPaused?: boolean) => void;

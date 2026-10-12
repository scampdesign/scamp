// The two reactive subscriptions that drive the save pipeline: the canvas
// store subscription (target-swap flush, load-cache refresh + canonical
// migration, and the debounced write on a genuine edit) and the terminal
// activity subscription (pause/resume when an agent appears/finishes).
// Lifted out of initSyncBridge (Phase 5.4); shares the cache via `ctx`.
import { generateCode } from '@lib/generateCode';
import { useCanvasStore, type CanvasState } from '@store/canvasSlice';
import { useSaveStatusStore } from '@store/saveStatusSlice';
import { selectSyncPaused, useTerminalActivityStore } from '@store/terminalActivitySlice';

import {
  WRITE_DEBOUNCE_MS,
  importNameForTarget,
  toEditTarget,
} from './editTarget';
import { consumeTargetSwapSuppression } from './targetSwapSuppression';
import type { SaveContext } from './saveContext';

type TerminalActivityState = ReturnType<
  typeof useTerminalActivityStore.getState
>;

/**
 * React when the user pauses or resumes sync. Pause: cancel the debounce
 * so nothing lands mid-pause. Resume: if the quiet window is also clear,
 * reconcile now; otherwise the quiet-resume timer does it when it expires.
 */
export const makeAgentSubscriptionHandler = (ctx: SaveContext) => {
  let prevPaused = selectSyncPaused(useTerminalActivityStore.getState());
  return (s: TerminalActivityState): void => {
    const nextPaused = selectSyncPaused(s);
    if (nextPaused === prevPaused) return;
    prevPaused = nextPaused;
    if (nextPaused) {
      ctx.cancelWriteTimer();
      useSaveStatusStore.getState().markPaused('manual');
      return;
    }
    if (!ctx.quietWindow.isQuiet()) {
      ctx.reconcileAfterQuiet();
    }
  };
};

/**
 * The canvas-store subscription: detects target swaps (flush outgoing,
 * reset the write cache), refreshes the cache + canonically migrates on
 * load, and schedules the debounced disk write on a genuine canvas edit.
 */
export const makeStoreSubscriptionHandler =
  (ctx: SaveContext) =>
  (state: CanvasState, prev: CanvasState): void => {
    try {
      // A read-only snapshot preview holds snapshot content in the canvas
      // in memory only — never persist it. Also covers the exit
      // transition (prev was previewing) so restoring the real state
      // doesn't dispatch a write. See docs/notes/snapshots.md.
      if (state.snapshotPreview !== null || prev.snapshotPreview !== null) {
        return;
      }

      // Detect target change against the STABLE underlying refs.
      // `toEditTarget` returns a fresh object each call, so
      // comparing its return values directly would always trip
      // "target changed" and tank performance — every Zustand
      // mutation (selection, hover, etc.) would flush, regen,
      // and re-arm the debounce timer.
      const targetChanged =
        state.activePage !== prev.activePage ||
        state.activeComponent !== prev.activeComponent;
      const currentTarget = toEditTarget(
        state.activePage,
        state.activeComponent
      );

      // Target swap — flush outgoing, then transition.
      // see docs/notes/components-sync.md
      if (targetChanged) {
        ctx.cancelWriteTimer();
        const consumeSuppress = consumeTargetSwapSuppression();
        const prevTarget = toEditTarget(
          prev.activePage,
          prev.activeComponent
        );
        if (prevTarget && !consumeSuppress) {
          // Pass the OUTGOING page's per-page CSS — loadPage() has
          // already swapped the store's pageCustomMediaBlocks /
          // pageKeyframesBlocks to the incoming page's values, so
          // reading from the store here would write A's elements
          // paired with B's @media / @keyframes to A's file.
          ctx.writeIfDirty(
            prev.elements,
            prev.rootElementId,
            prevTarget,
            prev.pageCustomMediaBlocks,
            prev.pageKeyframesBlocks
          );
        }
        ctx.lastSerializedTsx = null;
        ctx.lastSerializedCss = null;
      }

      // Nothing relevant changed.
      if (state.elements === prev.elements && !targetChanged) {
        return;
      }

      if (!currentTarget) return;

      // The change came from a load — refresh the write cache. For
      // initial page loads (`'initial'`), if the re-generated code
      // differs from what's on disk (e.g. old-format data-scamp-id,
      // `<div></div>` vs `<div />`), write the canonical version back
      // to migrate the file to the current format.
      //
      // For external edits (`'external'`, fired from chokidar when an
      // agent / hand edit landed on disk), we NEVER auto-write back.
      // Even when generateCode would produce something slightly
      // different — declaration ordering, whitespace, comments —
      // the agent's content is the source of truth on disk. Auto-
      // writing here would clobber agent-written formatting and
      // preserved customProperties values, which is the bug Track C
      // exists to fix. The next user-driven canvas edit will write a
      // canonical version on its own debounce cycle.
      if (state.isLoading) {
        const onDisk = state.pageSource;
        const isExternal = state.lastLoadKind === 'external';
        // Anchor `lastSerialized` to whatever is ACTUALLY on disk,
        // regardless of load kind. The previous behaviour optimistically
        // pinned it to the regenerated `code.tsx` before the
        // format-migration write landed — so if the user edited the
        // canvas and navigated away while that write was still in
        // flight, the follow-up flush would dispatch with
        // `expectedTsxContent = code.tsx` while disk still held
        // `onDisk.tsx`. The conflict path then ran for a no-longer-
        // active target and dropped the edit.
        if (onDisk) {
          ctx.lastSerializedTsx = onDisk.tsx;
          ctx.lastSerializedCss = onDisk.css;
        } else {
          ctx.lastSerializedTsx = null;
          ctx.lastSerializedCss = null;
        }
        // Initial loads: if the parsed-and-regenerated form differs
        // from disk (legacy format, whitespace drift, etc.), dispatch
        // a canonical write through the tracked path. `writeIfDirty`
        // will diff the code against `lastSerialized` (set above to
        // `onDisk`), capture the right expected baseline, and update
        // `lastSerialized` to the new content via the normal flow.
        //
        // External edits skip this entirely — the agent's content on
        // disk is the source of truth and round-tripping through
        // generateCode could clobber preserved formatting / customProps.
        if (!isExternal && onDisk) {
          // silent=true: this is Scamp's own canonical migration of
          // whatever just landed on disk, not a user edit. If an
          // agent races us during a project open and the optimistic-
          // concurrency check rejects, we adopt disk silently rather
          // than scaring the user with "Reloaded — your edit was
          // dropped" (they made no edit).
          ctx.writeIfDirty(
            state.elements,
            state.rootElementId,
            currentTarget,
            state.pageCustomMediaBlocks,
            state.pageKeyframesBlocks,
            true
          );
        }
        // Defer clearing the flag so any in-flight subscribers also see it.
        queueMicrotask(() => {
          useCanvasStore.setState({ isLoading: false, lastLoadKind: null });
        });
        return;
      }

      // Genuine canvas edit — mark the indicator and update the code
      // preview immediately so the user sees changes reflected without
      // waiting for the debounced write.
      useSaveStatusStore.getState().markUnsaved();
      if (ctx.quietWindow.isQuiet()) {
        // The actual `writeIfDirty` won't fire until after the quiet
        // window expires (or it'll bail when the debounce flushes
        // inside the window). Remember that the user did edit the
        // canvas so `reconcileAfterQuiet` knows to flush instead of
        // silently dropping the change.
        ctx.canvasChangedDuringQuiet = true;
      }
      const previewCode = generateCode({
        elements: state.elements,
        rootId: state.rootElementId,
        pageName: currentTarget.name,
        breakpoints: state.breakpoints,
        customMediaBlocks: state.pageCustomMediaBlocks,
        pageKeyframesBlocks: state.pageKeyframesBlocks,
        cssModuleImportName: importNameForTarget(
          currentTarget,
          state.projectFormat
        ),
        isComponent: currentTarget.kind === 'component',
      });
      state.setPageSource({ tsx: previewCode.tsx, css: previewCode.css });

      // Schedule the debounced disk write.
      ctx.cancelWriteTimer();
      ctx.writeTimer = setTimeout(ctx.flushDebouncedWrite, WRITE_DEBOUNCE_MS);
    } catch (err) {
      console.warn('[syncBridge] store subscription error:', err);
    }
  };

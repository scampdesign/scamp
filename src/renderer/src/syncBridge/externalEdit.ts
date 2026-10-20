// The chokidar `file:changed` handler — the branch that reacts to an
// external editor / agent writing the active page or component on disk.
// Lifted out of initSyncBridge (Phase 5.4); shares the cache + quiet
// window via `ctx`. see docs/notes/agent-coexistence.md
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { useSaveStatusStore } from '@store/saveStatusSlice';
import type { FileChangedPayload } from '@shared/types';

import { externalEditTracker } from '../lib/externalEditTracker';
import { importNameForTarget, toEditTarget } from './editTarget';
import type { SaveContext } from './saveContext';
import { serializeCanvas } from './writeIfDirty';

export const makeFileChangedHandler =
  (ctx: SaveContext) =>
  (payload: FileChangedPayload): void => {
    const state = useCanvasStore.getState();
    const target = toEditTarget(state.activePage, state.activeComponent);
    if (!target) return;
    if (
      payload.path !== target.tsxPath &&
      payload.path !== target.cssPath
    ) {
      return;
    }
    if (payload.tsxContent === null || payload.cssContent === null) return;

    // Late-echo guard: if the incoming payload byte-matches what
    // we last wrote, this is chokidar replaying our own save past
    // the main-side pending-write expiry. Ignore it — re-parsing
    // would either no-op (best case) or clobber an in-memory edit
    // the user made since the save (worst case).
    // see docs/notes/agent-coexistence.md — late-chokidar echo race.
    if (
      payload.tsxContent === ctx.lastSerializedTsx &&
      payload.cssContent === ctx.lastSerializedCss
    ) {
      return;
    }

    // Phase 1.1: mark this path as actively being reloaded so any
    // concurrent canvas-side `writeIfDirty` bails until we've
    // refreshed `lastSerialized`. We mark both sibling paths even
    // though chokidar only reported one — they ride together
    // through `dispatchPageWrite` so the protection should too.
    externalEditTracker.markPair(target.tsxPath, target.cssPath);

    // Scamp's own CSS-panel patch comes back through this same event
    // on purpose — the panel relies on the reload — but it is not an
    // external edit. Treating it as one paused sync for 2.5s after
    // every Cmd+S ("an external editor is writing…") and then resumed,
    // which read as "nothing was saved". Main tags it; reload only.
    // see docs/notes/save-status-machine.md
    const isOwnWrite = payload.ownWriteId !== undefined;
    // Canvas edits not yet on disk: a save waiting on its debounce, or one
    // the quiet window or a pause deferred. Read before they're cleared
    // below, so the edit can be merged with this one instead of replaced.
    const hadUnsavedEdit = ctx.writeTimer !== null || ctx.canvasChangedDuringQuiet;
    if (!isOwnWrite) {
      // Phase 3.2: open / extend the quiet window. Agents typically
      // write the same file multiple times in a burst; the window
      // absorbs the rest of the burst so we don't race the in-between
      // writes. Each chokidar event rolls the deadline forward, so a
      // long agent task keeps Scamp paused until the agent settles.
      ctx.quietWindow.extend();
      ctx.cancelWriteTimer();
      // Reset the canvas-changed-during-quiet flag at the start of
      // (or extension to) the quiet window. We're now watching for
      // canvas edits arriving DURING this window — anything before
      // doesn't count.
      ctx.canvasChangedDuringQuiet = false;
      useSaveStatusStore.getState().markPaused('external-edit');
      ctx.scheduleQuietResume();
    }

    // External editors (Claude Code, vim, etc.) can trigger chokidar
    // mid-write — the file content may be truncated or malformed. Guard
    // the entire parse → diff → reload pipeline so a transient bad read
    // logs a warning instead of crashing the renderer process.
    try {
      const parsed = parseCode(payload.tsxContent, payload.cssContent, {
        breakpoints: state.breakpoints,
        isComponent: target.kind === 'component',
      });

      // Always mirror the new on-disk source into the store so the code
      // panel reflects exactly what the agent / external editor wrote
      // (including comments, ordering, etc.) — even if the parsed tree
      // round-trips to the same canvas state.
      const nextSource = { tsx: payload.tsxContent, css: payload.cssContent };
      state.setPageSource(nextSource);

      // The canvas is not the only reader of this file. `componentTrees`
      // is what `scamp_check_view` and `scamp_get_view_props` answer
      // from, and it is built once, from `project.components`, when the
      // project loads. Nothing rebuilt it on an external edit — so after
      // an agent rewrote a view the canvas showed the new structure
      // while those two reported on the old one, byte-for-byte
      // identical, which is exactly how it was found.
      //
      // Refreshed from the same parse, and before the round-trip bail
      // below: that bail means the CANVAS needs no reload, not that
      // these trees were already current.
      if (target.kind === 'component') {
        const trees = useCanvasStore.getState().componentTrees;
        state.setComponentTrees({
          ...trees,
          [target.name]: {
            elements: parsed.elements,
            rootId: parsed.rootId,
            kind: trees[target.name]?.kind ?? 'component',
          },
        });
      }

      // Skip the canvas reload when the parsed tree round-trips to the
      // same code — prevents flicker during agent edits that don't actually
      // change a canvas-mappable property.
      const importName = importNameForTarget(target, state.projectFormat);
      const isComponent = target.kind === 'component';
      const currentCode = generateCode({
        elements: state.elements,
        rootId: state.rootElementId,
        pageName: target.name,
        breakpoints: state.breakpoints,
        customMediaBlocks: state.pageCustomMediaBlocks,
        pageKeyframesBlocks: state.pageKeyframesBlocks,
        cssModuleImportName: importName,
        isComponent,
      });
      const nextCode = generateCode({
        elements: parsed.elements,
        rootId: parsed.rootId,
        pageName: target.name,
        breakpoints: state.breakpoints,
        customMediaBlocks: parsed.customMediaBlocks,
        pageKeyframesBlocks: parsed.keyframesBlocks,
        cssModuleImportName: importName,
        isComponent,
      });
      if (currentCode.tsx === nextCode.tsx && currentCode.css === nextCode.css) {
        // The element tree is unchanged, so there is nothing to reload —
        // that is what this bail is for, and it is what keeps agent edits
        // from flickering the canvas.
        //
        // But `cssDuplicates` is not part of the tree. It describes the
        // file's raw TEXT, and a declaration repeated with the same
        // winning value regenerates to identical code — so bailing
        // outright threw away the one signal the user has that the
        // duplicate exists.
        //
        // Routed through `reloadElements` rather than a bespoke setter:
        // that is the audited path, and it flags the update as an
        // external load so the sync bridge treats it as "this came from
        // disk" instead of as a user edit. Two earlier attempts with a
        // plain store write failed exactly there — one marked the
        // document unsaved and scheduled a write, the other left the load
        // flags set and swallowed the user's next edit.
        //
        // A SHALLOW COPY of the existing elements, deliberately — not the
        // same reference, and not `parsed.elements`.
        //
        // Not the same reference: the store subscription bails early on
        // `state.elements === prev.elements`, before it reaches the
        // branch that clears the load flags. Passing the identical
        // reference leaves `isLoading` set forever, and every later edit
        // is then treated as a load and never written to disk. That is
        // the exact failure that killed two previous attempts at this,
        // and it is invisible until you edit something afterwards.
        //
        // Not `parsed.elements`: that is a fresh tree of fresh element
        // objects, so every canvas node re-renders. The copy keeps every
        // element reference identical, so the render is a no-op —
        // preserving the no-flicker guarantee this bail exists for.
        state.reloadElements(
          { ...state.elements },
          nextSource,
          parsed.customMediaBlocks,
          parsed.keyframesBlocks,
          parsed.cssDuplicates
        );
        return;
      }

      // If a canvas drag is in flight (transactionDepth > 0), defer
      // the reload until the transaction ends — option B from the
      // history-panel plan. The history slice queues the snapshot
      // and applies it via `restoreSnapshot` once the user releases
      // the mouse.
      const history = useHistoryStore.getState();
      if (history.transactionDepth > 0) {
        history.enqueueExternalEdit(parsed.elements);
        // The page source still needs to update so the bottom code
        // panel reflects the disk content; we update the source but
        // leave the canvas elements alone until the drag ends.
        return;
      }
      // The canvas has edits the file doesn't: merge the two, as a refused
      // save does, rather than reload over them. Overlapping edits still
      // adopt the file, and say so. see docs/notes/agent-coexistence.md
      if (!isOwnWrite && hadUnsavedEdit && ctx.lastSerializedTsx !== null && ctx.lastSerializedCss !== null) {
        const ours = serializeCanvas(
          ctx,
          state.elements,
          state.rootElementId,
          target,
          state.pageCustomMediaBlocks,
          state.pageKeyframesBlocks
        );
        ctx.onWriteConflict(
          target,
          { actualTsxContent: payload.tsxContent, actualCssContent: payload.cssContent },
          false,
          {
            baseTsx: ctx.lastSerializedTsx,
            baseCss: ctx.lastSerializedCss,
            oursTsx: ours.tsxOut.tsx,
            oursCss: ours.cssOut.css,
          }
        );
        return;
      }
      state.reloadElements(
        parsed.elements,
        nextSource,
        parsed.customMediaBlocks,
        parsed.keyframesBlocks,
        parsed.cssDuplicates
      );
      // Push an `external-edit` entry rather than clearing — the
      // history panel surfaces the agent's edit as a navigable
      // step. Future entries can undo past it; new user actions
      // discard the forward history as usual.
      history.enqueueExternalEdit(parsed.elements);
    } catch (err) {
      // Transient parse failure — the next chokidar event (once the
      // external write settles) will deliver valid content and succeed.
      console.warn('[syncBridge] skipping malformed file change:', err);
    } finally {
      // Phase 1.1: clear the per-path "external edit pending" flag
      // for both sibling files regardless of which paths through
      // the handler we took (success, no-op round-trip, transaction
      // defer, parse failure). `writeIfDirty` will now proceed again.
      externalEditTracker.clearPair(target.tsxPath, target.cssPath);
    }
  };

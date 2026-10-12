// The core "serialize the canvas and write it to disk if it changed"
// logic, plus the write-conflict resolver it dispatches with. Lifted out
// of initSyncBridge (Phase 5.4); reads/writes the shared cache via `ctx`.
import { generateCode } from '@lib/generateCode';
import { reportShadowEdits } from './shadowEdits';
import { recordPatch } from './patchStream';
import { cssWriteFor } from './cssWrite';
import { tsxWriteFor } from './tsxWrite';
import { parseCode } from '@lib/parseCode';
import { useCanvasStore } from '@store/canvasSlice';
import { useSaveStatusStore } from '@store/saveStatusSlice';
import { useAppLogStore } from '@store/appLogSlice';
import { errorMessage } from '@shared/errorMessage';
import type { KeyframesBlock, ScampElement } from '@lib/element';
import { selectSyncPaused, useTerminalActivityStore } from '@store/terminalActivitySlice';

import { externalEditTracker } from '../lib/externalEditTracker';
import { captureAndPersistComponentThumbnail } from '../lib/componentThumbnail';
import {
  captureAndPersistProjectThumbnail,
  thumbnailNameFor,
} from '../lib/projectThumbnail';
import { importNameForTarget, toEditTarget, type EditTarget } from './editTarget';
import { notifyWriteAborted } from './pendingSaves';
import { dispatchPageWrite } from './writeDispatch';
import { mergeWrite } from './mergeWrite';
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
export const makeOnWriteConflict =
  (ctx: SaveContext) =>
  (
    target: EditTarget,
    conflict: WriteConflict,
    silent: boolean = false,
    intent?: WriteIntent
  ): void => {
    const store = useCanvasStore.getState();
    // The write was kicked off against `target`, but the user may have
    // navigated away since — a page left mid-pause writes on the way out.
    // The merge and its write still run (they only touch that target's
    // files), but the store belongs to another page now: touching its
    // elements / pageSource / cache would show page B with A's design.
    const currentTarget = toEditTarget(store.activePage, store.activeComponent);
    const stale =
      !currentTarget ||
      currentTarget.tsxPath !== target.tsxPath ||
      currentTarget.cssPath !== target.cssPath;
    if (intent !== undefined) {
      const merged = mergeWrite({
        baseTsx: intent.baseTsx,
        baseCss: intent.baseCss,
        oursTsx: intent.oursTsx,
        oursCss: intent.oursCss,
        theirsTsx: conflict.actualTsxContent,
        theirsCss: conflict.actualCssContent,
        breakpoints: store.breakpoints,
        isComponent: target.kind === 'component',
      });
      if (merged) {
        if (!stale) {
          ctx.lastSerializedTsx = merged.tsx;
          ctx.lastSerializedCss = merged.css;
          store.setPageSource({ tsx: merged.tsx, css: merged.css });
          store.reloadElements(
            merged.parsed.elements,
            { tsx: merged.tsx, css: merged.css },
            merged.parsed.customMediaBlocks,
            merged.parsed.keyframesBlocks,
            merged.parsed.cssDuplicates
          );
        }
        dispatchPageWrite(
          {
            kind: 'write',
            tsxPath: target.tsxPath,
            cssPath: target.cssPath,
            tsxContent: merged.tsx,
            cssContent: merged.css,
            expectedTsxContent: conflict.actualTsxContent,
            expectedCssContent: conflict.actualCssContent,
          },
          (next) => ctx.onWriteConflict(target, next, silent)
        );
        if (!silent) {
          useAppLogStore
            .getState()
            .log(
              'info',
              `${target.name} was edited outside Scamp; merged that edit with yours.`
            );
        }
        return;
      }
    }
    if (stale) {
      const message = `${target.name} changed outside Scamp after you left it, in the same places you edited; your edits to it weren't saved.`;
      useAppLogStore.getState().log('warn', message);
      useSaveStatusStore.getState().showToast(message);
      return;
    }
    ctx.lastSerializedTsx = conflict.actualTsxContent;
    ctx.lastSerializedCss = conflict.actualCssContent;
    store.setPageSource({
      tsx: conflict.actualTsxContent,
      css: conflict.actualCssContent,
    });
    try {
      const parsed = parseCode(
        conflict.actualTsxContent,
        conflict.actualCssContent,
        { breakpoints: store.breakpoints, isComponent: target.kind === 'component' }
      );
      store.reloadElements(
        parsed.elements,
        { tsx: conflict.actualTsxContent, css: conflict.actualCssContent },
        parsed.customMediaBlocks,
        parsed.keyframesBlocks,
        parsed.cssDuplicates
      );
    } catch (err) {
      const message = errorMessage(err);
      useAppLogStore
        .getState()
        .log(
          'warn',
          `External edit on ${target.name}.tsx couldn't be parsed: ${message}`
        );
      return;
    }
    // Phase 1.2: surface the conflict through the status indicator
    // rather than as a transient app-log message. `reloaded-from-disk`
    // is a terminal state — there's nothing to retry against — so
    // the indicator shows it until the next successful save cycle
    // (markSaving will transition out). The app-log line stays as a
    // secondary audit trail.
    //
    // Silent mode (initial-load canonical migration): adopt disk
    // content but transition straight back to `saved`. The user had
    // no in-flight edit — surfacing "Reloaded" here is misleading.
    if (silent) {
      useSaveStatusStore.setState({
        state: { kind: 'saved' },
        toast: null,
        dirtyDuringSave: false,
      });
      return;
    }
    useSaveStatusStore.getState().markReloadedFromDisk(target.name);
    useAppLogStore
      .getState()
      .log(
        'warn',
        `${target.name} was edited outside Scamp; reloaded to that version. Your in-flight edit was dropped.`
      );
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
export const makeWriteIfDirty =
  (ctx: SaveContext) =>
  (
    elements: Record<string, ScampElement>,
    rootElementId: string,
    target: EditTarget,
    customMediaBlocks: ReadonlyArray<string>,
    pageKeyframesBlocks: ReadonlyArray<KeyframesBlock>,
    silent: boolean = false,
    evenIfPaused: boolean = false
  ): void => {
    // Phase 1.1: bail when chokidar is mid-event for this target.
    // `lastSerialized` is stale until the chokidar handler finishes
    // its reload; dispatching now would race the agent's edit. The
    // canvas state stays in memory — when the handler completes, the
    // user's next interaction triggers a fresh `writeIfDirty` with a
    // correct expected baseline.
    if (externalEditTracker.isPending(target.tsxPath, target.cssPath)) {
      useSaveStatusStore.getState().markPaused('external-edit');
      notifyWriteAborted(target.name);
      return;
    }
    // Phase 3.2: even outside the synchronous chokidar handler, if
    // we're inside the quiet window (an external edit landed in the
    // last QUIET_WINDOW_MS), defer the write. Agents typically write
    // the same file 2-5 times back-to-back; the window absorbs the
    // burst so we don't race the in-between writes. The user's own
    // pause defers it the same way.
    //
    // Leaving the target writes anyway (`evenIfPaused`): the edit would
    // otherwise exist only in memory, and the conflict check + merge
    // keep it from overwriting an agent's write.
    // see docs/notes/agent-coexistence.md
    if (!evenIfPaused) {
      if (ctx.quietWindow.isQuiet()) {
        useSaveStatusStore.getState().markPaused('external-edit');
        // Remembered so the reconcile after the window flushes it.
        ctx.canvasChangedDuringQuiet = true;
        // Don't toast here — the toast was already shown when the
        // window opened or when a write was aborted at the start of
        // the burst. Subsequent aborts inside the same window are silent.
        return;
      }
      if (selectSyncPaused(useTerminalActivityStore.getState())) {
        useSaveStatusStore.getState().markPaused('manual');
        // Without this, resuming found nothing flagged and said "Saved".
        ctx.canvasChangedDuringQuiet = true;
        return;
      }
    }
    const store = useCanvasStore.getState();
    const code = generateCode({
      elements,
      rootId: rootElementId,
      // generateCode uses `pageName` for the function name AND the
      // CSS-module import basename. For components the name IS the
      // PascalCase component name, which generateCode passes through
      // unchanged — both halves come out right.
      pageName: target.name,
      breakpoints: store.breakpoints,
      customMediaBlocks,
      pageKeyframesBlocks,
      cssModuleImportName: importNameForTarget(target, store.projectFormat),
      isComponent: target.kind === 'component',
    });
    // Rewrite only the rules that changed, keeping whatever else the
    // stylesheet on disk holds. see docs/plans/incremental-writes-plan.md
    const cssOut = cssWriteFor({
      baseCss: ctx.lastSerializedCss,
      generatedCss: code.css,
      tsx: code.tsx,
      breakpoints: store.breakpoints,
      isComponent: target.kind === 'component',
    });
    const tsxOut = tsxWriteFor({
      baseTsx: ctx.lastSerializedTsx,
      generatedTsx: code.tsx,
      css: code.css,
      breakpoints: store.breakpoints,
      isComponent: target.kind === 'component',
    });
    if (tsxOut.tsx === ctx.lastSerializedTsx && cssOut.css === ctx.lastSerializedCss) {
      // No-op dedupe: the debounce fired but the generated code matches
      // what's already on disk. Advance the indicator out of "unsaved"
      // anyway so idle canvases don't get stuck showing pending work.
      useSaveStatusStore.getState().markClean();
      return;
    }
    // Capture the OLD lastSerialized for the conflict check —
    // that's what we believe is currently on disk. Then advance to
    // the new content so subsequent dedupes work.
    const expectedTsx = ctx.lastSerializedTsx;
    const expectedCss = ctx.lastSerializedCss;
    // Shadow: derive the edits this save would write instead of the
    // whole file, check them, and measure them. No behaviour change.
    // see docs/plans/incremental-writes-plan.md, phase 1
    reportShadowEdits(target.name, [
      { label: 'tsx', base: expectedTsx, next: tsxOut.tsx },
      { label: 'css', base: expectedCss, next: cssOut.css },
    ]);
    // The patch stream: what this save changed, for anything that
    // wants to read it. see docs/plans/incremental-writes-plan.md
    recordPatch({ name: target.name, kind: target.kind }, store.projectPath, [
      { file: 'tsx', path: target.tsxPath, base: expectedTsx, next: tsxOut.tsx },
      { file: 'css', path: target.cssPath, base: expectedCss, next: cssOut.css },
    ]);
    // The fallback is observable. A patch that failed to verify still
    // writes the file whole, which is safe but loses whatever the file
    // held that Scamp doesn't model — so say so rather than only
    // warning in devtools.
    // see docs/plans/incremental-writes-plan.md
    const fellBack = [
      ...(expectedTsx !== null && !tsxOut.patched ? ['view'] : []),
      ...(expectedCss !== null && !cssOut.patched ? ['stylesheet'] : []),
    ];
    if (fellBack.length > 0) {
      useAppLogStore
        .getState()
        .log(
          'warn',
          `${target.name}: couldn't patch the ${fellBack.join(' or ')} safely; wrote the whole file instead.`
        );
    }
    ctx.lastSerializedTsx = tsxOut.tsx;
    ctx.lastSerializedCss = cssOut.css;
    // Mirror the just-written content into the store so the bottom code
    // panel reflects what's on disk without waiting for chokidar.
    useCanvasStore.getState().setPageSource({ tsx: tsxOut.tsx, css: cssOut.css });
    dispatchPageWrite(
      {
        kind: 'write',
        tsxPath: target.tsxPath,
        cssPath: target.cssPath,
        tsxContent: tsxOut.tsx,
        cssContent: cssOut.css,
        ...(expectedTsx !== null && expectedCss !== null
          ? {
              expectedTsxContent: expectedTsx,
              expectedCssContent: expectedCss,
            }
          : {}),
      },
      (conflict) =>
        ctx.onWriteConflict(
          target,
          conflict,
          silent,
          expectedTsx !== null && expectedCss !== null
            ? {
                baseTsx: expectedTsx,
                baseCss: expectedCss,
                oursTsx: tsxOut.tsx,
                oursCss: cssOut.css,
              }
            : undefined
        ),
      // The cache was advanced before the write, so it must follow what
      // actually reached disk: back to the old content on a failure (or the
      // next save is refused and its merge undoes this edit), forward again
      // when a retry succeeds. Only while the cache still holds this
      // target's content — a later save or a page switch owns it otherwise.
      (written) => {
        const current = useCanvasStore.getState();
        const stillHere = toEditTarget(current.activePage, current.activeComponent)?.cssPath === target.cssPath;
        if (!stillHere) return;
        const [fromTsx, fromCss, toTsx, toCss] = written
          ? [expectedTsx, expectedCss, tsxOut.tsx, cssOut.css]
          : [tsxOut.tsx, cssOut.css, expectedTsx, expectedCss];
        if (ctx.lastSerializedTsx === fromTsx && ctx.lastSerializedCss === fromCss) {
          ctx.lastSerializedTsx = toTsx;
          ctx.lastSerializedCss = toCss;
        }
      }
    );
    // Sidebar thumbnail capture for component saves.
    // see docs/notes/components-thumbnails.md
    if (target.kind === 'component') {
      const projectPath = store.projectPath;
      if (projectPath) {
        // rAF so React commits the latest paint before we rasterise.
        requestAnimationFrame(() => {
          captureAndPersistComponentThumbnail({
            projectPath,
            componentName: target.name,
          });
        });
      }
    }
    // Start-screen card capture, home page only. A framework project
    // has no pages — its home is a view — so this asks the rule rather
    // than the kind. see docs/notes/project-thumbnails.md
    const thumbName = thumbnailNameFor(
      target,
      store.componentTrees[target.name]?.kind
    );
    if (thumbName !== null) {
      const projectPath = store.projectPath;
      if (projectPath) {
        requestAnimationFrame(() => {
          captureAndPersistProjectThumbnail({
            projectPath,
            pageName: thumbName,
          });
        });
      }
    }
  };

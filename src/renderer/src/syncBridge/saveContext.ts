// The mutable per-bridge save cache + the cross-referencing handler set,
// lifted out of `initSyncBridge`'s closure so the save pipeline can span
// files (Phase 5.4 deep split). One `SaveContext` is created per
// `initSyncBridge` call; its fields are mutated in place exactly as the
// original closure variables were, so behaviour is unchanged. Handlers
// call each other through `ctx.*` (late-bound) so construction order
// doesn't matter.
import type { KeyframesBlock, ScampElement } from '@lib/element';
import type { QuietWindow } from '../lib/quietWindow';

import type { EditTarget } from './editTarget';

export type WriteConflict = {
  actualTsxContent: string;
  actualCssContent: string;
};

/**
 * What a refused write was trying to do, so the conflict handler can
 * merge instead of discarding it. Absent means fall back to adopting
 * disk, which is also what a second conflict on the merged write does.
 * see docs/plans/incremental-writes-plan.md, phase 4
 */
export type WriteIntent = {
  /** The version the write claimed was on disk. */
  baseTsx: string;
  baseCss: string;
  /** What it carried. */
  oursTsx: string;
  oursCss: string;
};

export type SaveContext = {
  // ---- Mutable cache (was initSyncBridge's closure vars) ----
  writeTimer: ReturnType<typeof setTimeout> | null;
  lastSerializedTsx: string | null;
  lastSerializedCss: string | null;
  /**
   * Set when a canvas edit lands while the quiet window is open, or when
   * a pause defers a write (`writeIfDirty`). `reconcileAfterQuiet` consults this
   * to decide whether to flush the pending canvas change after the
   * window expires, or to leave disk alone. Cleared on chokidar event
   * (start of quiet window) and after `reconcileAfterQuiet` runs.
   */
  canvasChangedDuringQuiet: boolean;
  quietResumeTimer: ReturnType<typeof setTimeout> | null;

  // ---- Shared collaborator bound for the bridge's lifetime ----
  readonly quietWindow: QuietWindow;

  // ---- Handler functions, wired during init (see syncBridge.ts) ----
  cancelWriteTimer: () => void;
  onWriteConflict: (
    target: EditTarget,
    conflict: WriteConflict,
    silent?: boolean,
    intent?: WriteIntent
  ) => void;
  writeIfDirty: (
    elements: Record<string, ScampElement>,
    rootElementId: string,
    target: EditTarget,
    customMediaBlocks: ReadonlyArray<string>,
    pageKeyframesBlocks: ReadonlyArray<KeyframesBlock>,
    silent?: boolean,
    evenIfPaused?: boolean
  ) => void;
  flushDebouncedWrite: (evenIfPaused?: boolean) => void;
  reconcileAfterQuiet: () => void;
  scheduleQuietResume: () => void;
};

const noop = (): void => {};

/** Build a fresh save context with placeholder handlers (wired by init). */
export const createSaveContext = (quietWindow: QuietWindow): SaveContext => ({
  writeTimer: null,
  lastSerializedTsx: null,
  lastSerializedCss: null,
  canvasChangedDuringQuiet: false,
  quietResumeTimer: null,
  quietWindow,
  cancelWriteTimer: noop,
  onWriteConflict: noop,
  writeIfDirty: noop,
  flushDebouncedWrite: noop,
  reconcileAfterQuiet: noop,
  scheduleQuietResume: noop,
});

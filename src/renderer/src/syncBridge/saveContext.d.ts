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
    readonly quietWindow: QuietWindow;
    cancelWriteTimer: () => void;
    onWriteConflict: (target: EditTarget, conflict: WriteConflict, silent?: boolean, intent?: WriteIntent) => void;
    writeIfDirty: (elements: Record<string, ScampElement>, rootElementId: string, target: EditTarget, customMediaBlocks: ReadonlyArray<string>, pageKeyframesBlocks: ReadonlyArray<KeyframesBlock>, silent?: boolean, evenIfPaused?: boolean) => void;
    flushDebouncedWrite: (evenIfPaused?: boolean) => void;
    reconcileAfterQuiet: () => void;
    scheduleQuietResume: () => void;
};
/** Build a fresh save context with placeholder handlers (wired by init). */
export declare const createSaveContext: (quietWindow: QuietWindow) => SaveContext;

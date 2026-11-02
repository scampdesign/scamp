export type Spread = {
    p50: number;
    p95: number;
    max: number;
};
/** Time from a background change in the store to the next paint, `count` times. */
export declare const benchEdits: (count: number) => Promise<{
    elementCount: number;
    editToPaint: Spread;
}>;
/**
 * `count` read-only copies of the iframe canvas's current document, under one
 * `translate() scale()` transform as the workspace would draw them.
 */
export declare const benchFrames: (count: number, keep?: boolean) => Promise<{
    count: number;
    loadMs: number;
    heapBeforeMb: number | null;
    heapAfterMb: number | null;
    panAt025: Spread;
    panAt02AllOnScreen: Spread;
}>;
export declare const removeFrames: () => void;

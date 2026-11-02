/**
 * The canvas draws the page in an iframe (`IframeCanvas`). For one release
 * today's canvas stays reachable as a fallback, from the developer tools:
 * `__scampIframeCanvas.set(false)`, remembered on this machine.
 * see docs/notes/iframe-canvas.md
 */
type IframeCanvasFlag = {
    on: boolean;
    set: (on: boolean) => void;
};
export declare const useIframeCanvasFlag: import("zustand").UseBoundStore<import("zustand").StoreApi<IframeCanvasFlag>>;
/** Timings the iframe canvas reports, read by the e2e speed measurements. */
export type IframeCanvasStats = {
    firstDrawMs: number | null;
    /** Each update: building the HTML and CSS, then patching the DOM. */
    updates: Array<{
        buildMs: number;
        patchMs: number;
    }>;
};
export declare const iframeCanvasStats: IframeCanvasStats;
export {};

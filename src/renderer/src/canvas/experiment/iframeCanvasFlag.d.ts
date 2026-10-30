/**
 * Experiment only: draw the page canvas as the HTML export inside a
 * same-origin iframe (option C1). see docs/plans/canvas-rendering-options.md
 */
type IframeCanvasFlag = {
    on: boolean;
    set: (on: boolean) => void;
};
export declare const useIframeCanvasFlag: import("zustand").UseBoundStore<import("zustand").StoreApi<IframeCanvasFlag>>;
/** Timings the experiment reports, read by the e2e measurements. */
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

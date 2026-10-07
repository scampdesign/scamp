/**
 * What overflows on a rendered view — measured by the browser, not
 * guessed from styles. Runs in a hidden window over the view's HTML
 * export (main/agent/overflowRender.ts); the renderer maps each class
 * back to an element (@lib/overflowReport).
 * see docs/notes/agent-overflow-check.md
 */
export type OverflowKind = 
/** Past an edge of the page: off-screen, or widening it. */
'off-page'
/** Outside its parent, which lets it show. */
 | 'outside-parent'
/** Outside its parent, which cuts it off (overflow: hidden / clip). */
 | 'clipped'
/** Outside its parent, which scrolls to it (overflow: auto / scroll). */
 | 'scrolls'
/** Its own text runs past its box. */
 | 'text-spills';
export type OverflowFinding = {
    kind: OverflowKind;
    /** The element's first class, as exported (`inst__child_x` inside an instance). */
    cls: string;
    /** The box it overflows: its parent's first class, or null for the page. */
    parentCls: string | null;
    /** How far past each side, in px; 0 when inside. */
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
    position: string;
    /** The overflow setting that decides how it shows: the parent's, or its own for text. */
    overflow: string;
    whiteSpace: string;
    /** Elements with this class and finding — rows of a list share one. */
    count: number;
};
export type OverflowReport = {
    /** The window's width, which the view was laid out at. */
    viewportWidth: number;
    pageWidth: number;
    pageHeight: number;
    findings: OverflowFinding[];
    /** Findings past the cap, left out. */
    more: number;
};
/** Self-contained: serialized with `toString()` and run in the page. */
export declare const measureOverflowFn: (limit: number) => OverflowReport;

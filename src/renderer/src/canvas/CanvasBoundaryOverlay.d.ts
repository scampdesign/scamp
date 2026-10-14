type Props = {
    /** Current effective canvas scale (frame transform). */
    scale: number;
    /** Canvas boundary width in logical px (where the right edge sits). */
    boundaryWidth: number;
    /** Canvas boundary height in logical px (where the bottom edge sits). */
    boundaryHeight: number;
    /** Logical px content extends past the canvas width (0 when none). */
    overflowX: number;
    /** Logical px content extends past a fixed canvas height (0 when none). */
    overflowY: number;
    /** Logical natural content height (bottommost element edge). */
    naturalHeight: number;
    /** Whether the active canvas clips content at its edges. */
    clip: boolean;
    /** Whether the page canvas is in fixed-height mode. */
    fixedHeight: boolean;
};
/**
 * Canvas-view chrome that marks the viewport boundary when content
 * overflows it. Rendered as a sibling of the frame inside the frameShell
 * (which may be larger than the canvas when clip is off, to reserve the
 * spilling content) — so the boundary lines are positioned at the canvas
 * bounds (`boundaryWidth`/`boundaryHeight` × scale), NOT the shell edges.
 * Purely informational — pointer-events are disabled, and it's excluded
 * from exports.
 *
 * - Horizontal overflow (clip off): amber dashed line at the right edge +
 *   a "+ Npx overflow" label.
 * - Vertical overflow (clip off, fixed height): amber dashed line at the
 *   bottom edge + label.
 * - Natural-height rule (clip on): a subtle line marking where content
 *   actually ends.
 *
 * see docs/archive/2026-07-13-canvas-overflow-boundary-plan.md
 */
export declare const CanvasBoundaryOverlay: ({ scale, boundaryWidth, boundaryHeight, overflowX, overflowY, naturalHeight, clip, fixedHeight, }: Props) => JSX.Element | null;
export {};

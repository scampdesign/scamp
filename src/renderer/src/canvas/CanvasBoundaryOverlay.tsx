import { formatOverflowLabel } from '@lib/canvasOverflow';
import styles from './CanvasBoundaryOverlay.module.css';

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
export const CanvasBoundaryOverlay = ({
  scale,
  boundaryWidth,
  boundaryHeight,
  overflowX,
  overflowY,
  naturalHeight,
  clip,
  fixedHeight,
}: Props): JSX.Element | null => {
  const showX = !clip && overflowX > 0;
  const showY = !clip && fixedHeight && overflowY > 0;
  const showNatural = clip && naturalHeight > 0;
  if (!showX && !showY && !showNatural) return null;

  const rightEdge = boundaryWidth * scale;
  const bottomEdge = boundaryHeight * scale;
  // The natural-height rule sits where content ends, clamped within the
  // canvas bounds (when content overflows a fixed height it coincides with
  // the bottom edge).
  const naturalTop = Math.min(naturalHeight, boundaryHeight) * scale;

  return (
    <div
      className={styles.overlay}
      // Inline `pointer-events: none` beats the frameShell's
      // `> * { pointer-events: auto }` rule (same specificity, order-
      // dependent) so this full-cover overlay never eats canvas clicks.
      style={{ pointerEvents: 'none' }}
      data-canvas-chrome="true"
      aria-hidden="true"
    >
      {showNatural && (
        <div className={styles.naturalRule} style={{ top: naturalTop }} />
      )}
      {showX && (
        <div
          className={styles.edgeRight}
          style={{ left: rightEdge }}
          data-testid="overflow-indicator"
        >
          <span className={styles.label}>{formatOverflowLabel(overflowX)}</span>
        </div>
      )}
      {showY && (
        <div className={styles.edgeBottom} style={{ top: bottomEdge }}>
          <span className={styles.label}>{formatOverflowLabel(overflowY)}</span>
        </div>
      )}
    </div>
  );
};

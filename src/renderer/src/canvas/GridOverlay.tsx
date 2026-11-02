import { useLayoutEffect, useState } from 'react';
import styles from './GridOverlay.module.css';
import { canvasNodeById } from './canvasDom';

type Props = {
  /** The selected grid container's `data-element-id`. */
  elementId: string;
  /**
   * The frame's getBoundingClientRect-derived rect in unscaled
   * coordinates — used to translate the absolute browser-coordinate
   * lines into frame-local positions for rendering.
   */
  frameRect: { left: number; top: number };
  /** Frame scale factor — same value the interaction layer computes. */
  scale: number;
};

type Lines = {
  /** Cumulative pixel offsets where vertical track-lines should sit. */
  columns: number[];
  /** Cumulative pixel offsets where horizontal track-lines should sit. */
  rows: number[];
  /** Frame-local x/y of the container's top-left, plus its width/height. */
  rect: { x: number; y: number; w: number; h: number };
};

/**
 * Parse a resolved-style track list (e.g. `"100px 200px 100px"`) into
 * cumulative pixel offsets. Browsers always return resolved tracks as
 * a space-separated list of px values, even for `repeat()`, `1fr`,
 * `minmax()` etc., so the parsing is straightforward.
 */
const parseResolvedTracks = (raw: string): number[] => {
  if (!raw || raw === 'none') return [];
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  const offsets: number[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const m = token.match(/^(-?\d+(?:\.\d+)?)px$/);
    if (!m || m[1] === undefined) continue;
    cursor += Number(m[1]);
    offsets.push(cursor);
  }
  // The last cumulative offset is the container's content size — it's
  // also the position of the trailing edge, which we DON'T want to
  // render as an interior line. Drop it.
  if (offsets.length > 0) offsets.pop();
  return offsets;
};

/**
 * Dashed-line overlay that visualises the column/row tracks of a grid
 * container. Lives outside the container itself (it renders next to
 * the SelectionOverlay so it's not affected by `overflow:hidden` on
 * the grid). Position is recomputed via getComputedStyle on every
 * canvas state change + ResizeObserver.
 */
export const GridOverlay = ({
  elementId,
  frameRect,
  scale,
}: Props): JSX.Element | null => {
  const [lines, setLines] = useState<Lines | null>(null);

  useLayoutEffect(() => {
    const node = canvasNodeById(elementId);
    if (!node) {
      setLines(null);
      return;
    }

    const measure = (): void => {
      const computed = window.getComputedStyle(node);
      // Resolved track sizes — pixels in source order.
      const columns = parseResolvedTracks(computed.gridTemplateColumns);
      const rows = parseResolvedTracks(computed.gridTemplateRows);

      const r = node.getBoundingClientRect();
      // Translate viewport coords back into frame-local logical
      // coords. The interaction layer divides by scale the same way.
      setLines({
        columns,
        rows,
        rect: {
          x: (r.left - frameRect.left) / scale,
          y: (r.top - frameRect.top) / scale,
          w: r.width / scale,
          h: r.height / scale,
        },
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [elementId, frameRect.left, frameRect.top, scale]);

  if (!lines) return null;
  const { rect, columns, rows } = lines;

  return (
    <div
      className={styles.overlay}
      data-testid="grid-overlay"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
      }}
    >
      {columns.map((offset, i) => (
        <div
          key={`c${i}`}
          className={styles.line}
          style={{ left: offset, top: 0, width: 0, height: rect.h }}
        />
      ))}
      {rows.map((offset, i) => (
        <div
          key={`r${i}`}
          className={styles.line}
          style={{ left: 0, top: offset, width: rect.w, height: 0 }}
        />
      ))}
    </div>
  );
};

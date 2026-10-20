import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID, type VariantAxis } from '@lib/element';
import { variantGrid, type VariantCell } from '@lib/variantAxes';

import { ElementRenderer } from './ElementRenderer';
import { VariantFrameContext } from './variantFrame';
import styles from './VariantSet.module.css';

type Props = {
  componentName: string;
  /** The component's artboard: a root that fills its container fills this. */
  artboardWidth: number;
  artboardHeight: number;
  /** The set's natural width, so the canvas frame can take it. */
  onWidth: (width: number) => void;
};

const EMPTY_AXES: ReadonlyArray<VariantAxis> = [];

/**
 * Figma's component set: every variant of the component as a frame,
 * the first axis down the rows and the second across. The frame being
 * edited is live where it sits; the others are read-only renders, and
 * clicking one makes it live (`variantCellAt` in the interaction
 * layer). Each frame hugs the component, except along an axis where the
 * root fills its container, which takes the artboard's size.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export const VariantSet = ({ componentName, artboardWidth, artboardHeight, onWidth }: Props): JSX.Element => {
  const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
  const fillsWidth = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.widthMode === 'stretch');
  const fillsHeight = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.heightMode === 'stretch');
  const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
  const blocks = useMemo(() => variantGrid(axes), [axes]);
  const setRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef(new Map<string, HTMLDivElement>());
  const [reach, setReach] = useState<Record<string, { w: number; h: number }>>({});

  // A root with only absolutely placed children is 0 tall, and what's
  // drawn hangs outside its frame. Each frame is sized to reach its
  // furthest element, measured after every render; the state only
  // changes when a reach does, so this settles.
  useLayoutEffect(() => {
    const next: Record<string, { w: number; h: number }> = {};
    for (const [key, frame] of frameRefs.current) {
      const rect = frame.getBoundingClientRect();
      const scale = frame.offsetWidth > 0 ? rect.width / frame.offsetWidth : 1;
      let w = 0;
      let h = 0;
      for (const node of frame.querySelectorAll('[data-scamp-id]')) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        w = Math.max(w, Math.ceil((r.right - rect.left) / scale));
        h = Math.max(h, Math.ceil((r.bottom - rect.top) / scale));
      }
      next[key] = { w, h };
    }
    const same =
      Object.keys(next).length === Object.keys(reach).length &&
      Object.entries(next).every(([k, v]) => reach[k]?.w === v.w && reach[k]?.h === v.h);
    if (!same) setReach(next);
  });

  useLayoutEffect(() => {
    const node = setRef.current;
    if (!node) return;
    const report = (): void => onWidth(node.offsetWidth);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
  }, [onWidth]);

  const renderCell = (cell: VariantCell): JSX.Element => {
    const live = cell.key === activeVariantKey;
    const id = cell.key ?? '';
    return (
      <div
        key={cell.key ?? 'default'}
        className={`${styles.cell} ${live ? styles.cellLive : ''}`}
        data-variant-cell={cell.key ?? ''}
        data-variant-live={live ? 'true' : 'false'}
      >
        <div className={styles.label} title={axes.map((a) => `${a.prop}: ${cell.picks[a.prop]}`).join(', ')}>
          {cell.label}
          {cell.key === null && <span className={styles.defaultTag}>default</span>}
        </div>
        <div
          ref={(node) => {
            if (node === null) frameRefs.current.delete(id);
            else frameRefs.current.set(id, node);
          }}
          className={styles.frame}
          style={{
            width: fillsWidth ? `${artboardWidth}px` : 'max-content',
            height: fillsHeight ? `${artboardHeight}px` : undefined,
            // Not along a side the root fills: growing the frame would grow
            // the root, move what hangs past it, and grow the frame again.
            minWidth: reach[id] !== undefined && !fillsWidth ? `${reach[id].w}px` : undefined,
            minHeight: reach[id] !== undefined && !fillsHeight ? `${reach[id].h}px` : undefined,
          }}
        >
          <VariantFrameContext.Provider value={{ variantKey: cell.key, displayOnly: !live }}>
            <ElementRenderer elementId={ROOT_ELEMENT_ID} />
          </VariantFrameContext.Provider>
        </div>
      </div>
    );
  };

  return (
    <div ref={setRef} className={styles.set} data-testid="variant-set">
      <div className={styles.name}>{componentName}</div>
      {blocks.map((block, b) => (
        <div key={block.heading ?? b} className={styles.block}>
          {block.heading !== null && <div className={styles.heading}>{block.heading}</div>}
          {block.rows.map((row, r) => (
            <div key={r} className={styles.row}>
              {row.map(renderCell)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

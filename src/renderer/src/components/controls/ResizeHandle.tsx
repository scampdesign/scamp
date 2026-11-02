import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import styles from './ResizeHandle.module.css';

const KEY_STEP = 16;

type Props = {
  /** `vertical` sits on a left or right edge and drags sideways; `horizontal` sits on a top edge. */
  orientation: 'vertical' | 'horizontal';
  /** 1 when dragging right or down grows the panel, -1 when left or up does. */
  direction: 1 | -1;
  /** The size the panel draws at now. */
  value: number;
  min: number;
  max: number;
  /** A size the user asked for, unclamped, while dragging. */
  onChange: (size: number) => void;
  /** The size asked for when a drag or key press ends, and the size it started from. */
  onCommit: (size: number, startSize: number) => void;
  /** Double-click: back to the default. */
  onReset: () => void;
  label: string;
  className?: string;
};

/**
 * The draggable edge of a panel, also a focusable separator the arrow
 * keys move. see docs/plans/resizable-sidebar-plan.md
 */
export const ResizeHandle = ({
  orientation,
  direction,
  value,
  min,
  max,
  onChange,
  onCommit,
  onReset,
  label,
  className,
}: Props): JSX.Element => {
  const drag = useRef<{ start: number; startSize: number } | null>(null);
  const frame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const vertical = orientation === 'vertical';

  const sizeAt = (e: PointerEvent<HTMLDivElement>, from: { start: number; startSize: number }): number =>
    from.startSize + ((vertical ? e.clientX : e.clientY) - from.start) * direction;

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: vertical ? e.clientX : e.clientY, startSize: value };
    setDragging(true);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const from = drag.current;
    if (from === null) return;
    const size = sizeAt(e, from);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onChange(size);
    });
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    const from = drag.current;
    if (from === null) return;
    drag.current = null;
    setDragging(false);
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    onCommit(sizeAt(e, from), from.startSize);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const deltas: Record<string, number> = vertical
      ? { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }
      : { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP };
    const delta = deltas[e.key];
    let next: number | null = null;
    if (delta !== undefined) next = value + delta * direction;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    onCommit(Math.max(min, Math.min(max, next)), value);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      className={`${styles.handle} ${vertical ? styles.vertical : styles.horizontal} ${
        dragging ? styles.dragging : ''
      } ${className ?? ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
};

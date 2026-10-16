import { useCanvasStore } from '@store/canvasSlice';

import styles from './CanvasNotice.module.css';

/**
 * A short message over the canvas about something that just didn't work,
 * such as an image drop that couldn't be used. It sits outside the zoomed,
 * scrolling frame so it reads the same at any zoom.
 * see docs/plans/image-drop-plan.md
 */
export const CanvasNotice = (): JSX.Element | null => {
  const notice = useCanvasStore((s) => s.canvasNotice);
  if (notice === null) return null;
  return (
    <div className={styles.notice} role="status" data-testid="canvas-notice">
      {notice}
    </div>
  );
};

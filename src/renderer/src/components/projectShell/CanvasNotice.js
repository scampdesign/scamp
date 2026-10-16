import { jsx as _jsx } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import styles from './CanvasNotice.module.css';
/**
 * A short message over the canvas about something that just didn't work,
 * such as an image drop that couldn't be used. It sits outside the zoomed,
 * scrolling frame so it reads the same at any zoom.
 * see docs/plans/image-drop-plan.md
 */
export const CanvasNotice = () => {
    const notice = useCanvasStore((s) => s.canvasNotice);
    if (notice === null)
        return null;
    return (_jsx("div", { className: styles.notice, role: "status", "data-testid": "canvas-notice", children: notice }));
};

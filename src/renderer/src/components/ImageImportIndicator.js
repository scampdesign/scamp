import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import styles from './ImageImportIndicator.module.css';
/**
 * "Optimising image…" while an import converts.
 *
 * The conversion runs in a child process, so nothing is actually
 * blocked — but a large photo takes a second or two, and silence for
 * that long reads as a hang rather than as work.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
export const ImageImportIndicator = () => {
    const busy = useCanvasStore((s) => s.imageImportBusy);
    if (!busy)
        return null;
    return (_jsxs("div", { className: styles.pill, role: "status", "data-testid": "image-import-busy", children: [_jsx("span", { className: styles.spinner, "aria-hidden": "true" }), "Optimising image\u2026"] }));
};

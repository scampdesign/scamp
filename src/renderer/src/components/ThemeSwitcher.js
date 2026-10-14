import { jsx as _jsx } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import styles from './ThemeSwitcher.module.css';
/**
 * Compact theme selector for the canvas toolbar. Switches the previewed
 * theme (`activeThemeId`), which re-derives `themeTokens` so the canvas
 * repaints in that theme's semantic colours — a quick toggle without
 * opening the theme panel. Hidden when a project has only the Light
 * theme (nothing to switch). see docs/archive/2026-07-23-design-system-plan.md
 */
export const ThemeSwitcher = () => {
    const themes = useCanvasStore((s) => s.themes);
    const activeThemeId = useCanvasStore((s) => s.activeThemeId);
    const setActiveTheme = useCanvasStore((s) => s.setActiveTheme);
    if (themes.length <= 1)
        return null;
    return (_jsx("select", { className: styles.switcher, value: activeThemeId, "aria-label": "Preview theme", "data-testid": "canvas-theme-switcher", onChange: (e) => setActiveTheme(e.target.value), children: themes.map((t) => (_jsx("option", { value: t.id, children: t.label }, t.id))) }));
};

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { classifyToken } from '@lib/tokenClassify';
import { isTextStyleToken } from '@lib/typographyModel';
import { isDesignRoleToken } from '@lib/tokenRoles';
import styles from './ThemeSectionNav.module.css';
const SECTIONS = [
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'spacing', label: 'Spacing' },
    { id: 'border', label: 'Border widths' },
    { id: 'radius', label: 'Radius' },
    { id: 'shadow', label: 'Shadows' },
    { id: 'documentation', label: 'Documentation' },
];
/**
 * Left-sidebar nav for the theme editor. Clicking a section scroll-jumps the
 * main theme editor to that section's `data-theme-section` anchor. Shown in
 * the sidebar panel when the Design System rail icon is active.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export const ThemeSectionNav = () => {
    const themeTokens = useCanvasStore((s) => s.themeTokens);
    const [active, setActive] = useState('colors');
    // Tokens owned by a named section (colours, text styles, spacing/border/
    // radius/shadow) never count toward "Unknown" — a semantic colour or a
    // text-style family reads as `unknown` by value, and shadows do too.
    // Mirrors ThemePanel's grouping so the nav link matches a real section.
    const hasUnknown = themeTokens.some((t) => !t.name.startsWith('--color-') &&
        !isTextStyleToken(t.name) &&
        !isDesignRoleToken(t.name) &&
        classifyToken(t.value) === 'unknown');
    const sections = hasUnknown
        ? [...SECTIONS, { id: 'unknown', label: 'Unknown' }]
        : SECTIONS;
    const go = (id) => {
        setActive(id);
        const el = document.querySelector(`[data-theme-section="${id}"]`);
        if (el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    return (_jsxs("nav", { className: styles.nav, "data-testid": "theme-section-nav", "aria-label": "Theme sections", children: [_jsx("h2", { className: styles.title, children: "Theme" }), sections.map((s) => (_jsx("button", { type: "button", "data-theme-nav": s.id, "aria-current": active === s.id, className: `${styles.item} ${active === s.id ? styles.itemActive : ''}`, onClick: () => go(s.id), children: s.label }, s.id)))] }));
};

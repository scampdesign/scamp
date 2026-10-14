import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import { DESIGN_MD_SECTIONS } from '@lib/designMd';
import styles from './DesignDocSection.module.css';
/**
 * The Design System documentation forms — the authored prose that Scamp
 * writes into DESIGN.md alongside the auto-generated token YAML. Bound
 * directly to the store's `designProse`; the debounced `useDesignMdSync`
 * coalesces edits into DESIGN.md writes, and reflects external edits back.
 * Only this component subscribes to `designProse`, so per-keystroke updates
 * don't re-render the rest of the panel. see docs/archive/2026-07-23-design-system-plan.md
 */
export const DesignDocSection = () => {
    const designProse = useCanvasStore((s) => s.designProse);
    const setDesignProse = useCanvasStore((s) => s.setDesignProse);
    return (_jsxs("section", { className: styles.section, "data-theme-section": "documentation", children: [_jsx("h3", { className: styles.sectionTitle, children: "Documentation" }), _jsxs("div", { className: styles.hint, children: ["Written to ", _jsx("code", { children: "DESIGN.md" }), " for agents. Token values are auto-generated from your theme; these fields are the human-readable rationale and usage guidance."] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.label, children: "Project name" }), _jsx("input", { type: "text", className: styles.input, value: designProse.name ?? '', "data-testid": "design-doc-name", onChange: (e) => setDesignProse({ ...designProse, name: e.target.value }) })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.label, children: "Description" }), _jsx("textarea", { className: styles.textarea, value: designProse.description ?? '', rows: 2, placeholder: "One-line summary of the product\u2026", onChange: (e) => setDesignProse({ ...designProse, description: e.target.value }) })] }), DESIGN_MD_SECTIONS.map((title) => (_jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.label, children: title }), _jsx("textarea", { className: styles.textarea, value: designProse.sections[title] ?? '', rows: 3, placeholder: `${title} guidance…`, "data-design-doc-section": title, onChange: (e) => setDesignProse({
                            ...designProse,
                            sections: { ...designProse.sections, [title]: e.target.value },
                        }) })] }, title)))] }));
};

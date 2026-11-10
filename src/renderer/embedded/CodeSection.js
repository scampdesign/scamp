import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useEmbeddedStore } from './embeddedStore';
import styles from './CodeSection.module.css';
/** A rule's text, one declaration a line. */
const pretty = (css) => css.replace(/\{\s*/, '{\n  ').replace(/;\s*(?!$)/g, ';\n  ').replace(/\s*\}$/, '\n}');
/**
 * The selection's JSX and the CSS rules that style it, read-only, at the
 * bottom of the Style tab. see docs/plans/embedded-canvas-gaps.md (gap 14)
 */
export const CodeSection = () => {
    const selection = useEmbeddedStore((s) => s.selection);
    const [open, setOpen] = useState(false);
    const [jsx, setJsx] = useState(null);
    const source = selection?.element.source ?? null;
    useEffect(() => {
        setJsx(null);
        if (!open || source === null)
            return;
        let live = true;
        void window.scampEmbedded.readSource(source).then((found) => {
            if (live)
                setJsx(found);
        });
        return () => {
            live = false;
        };
    }, [open, source]);
    if (selection === null)
        return null;
    return (_jsxs("details", { className: styles.section, open: open, onToggle: (e) => setOpen(e.currentTarget.open), "data-testid": "embedded-code", children: [_jsx("summary", { className: styles.title, children: "Code" }), jsx !== null && (_jsxs("figure", { className: styles.block, children: [_jsx("figcaption", { className: styles.caption, children: jsx.file }), _jsx("pre", { className: styles.code, "data-testid": "embedded-code-jsx", children: jsx.lines.map((line, i) => (_jsxs("span", { className: styles.line, children: [_jsx("span", { className: styles.number, children: jsx.start + i }), line] }, i))) })] })), source === null && _jsx("p", { className: styles.note, children: "Scamp couldn\u2019t map this element to a line." }), selection.rules.length === 0 && _jsx("p", { className: styles.note, children: "No CSS rules match this element." }), selection.rules.map((rule, i) => (_jsxs("figure", { className: styles.block, children: [_jsx("figcaption", { className: styles.caption, children: rule.sheet }), _jsx("pre", { className: styles.code, "data-testid": "embedded-code-rule", children: pretty(rule.text) })] }, i)))] }));
};

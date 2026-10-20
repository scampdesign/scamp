import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { CANVAS_SCOPE_ATTR } from '@lib/canvasStylesheet';
import { classNameFor } from '@lib/generateCode';
import { keyFor } from '@lib/variantAxes';
import { afterTrigger, shownPicks } from '@lib/variantInteractions';
import { ElementRenderer } from './ElementRenderer';
import { CanvasPageStylesheet } from './Viewport';
import { VariantFrameContext } from './variantFrame';
import { useCanvasTheme } from './useCanvasTheme';
import styles from './TryInteractions.module.css';
const EMPTY_AXES = [];
const NONE = [];
/**
 * The component, read-only, reacting to its interactions as it will in
 * the browser: hover, press, focus, a click, a click outside, and
 * Escape change the value drawn. Outside the editing frame, so trying it
 * never selects or edits anything. The canvas draws with inline styles,
 * which CSS `:hover` can't reach, so the values are tracked here.
 * see docs/plans/component-variants-plan.md, phase 7
 */
export const TryInteractions = ({ scale }) => {
    const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
    const interactions = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantInteractions ?? NONE);
    const elements = useCanvasStore((s) => s.elements);
    const { themeCssVars, themeFontFamily } = useCanvasTheme();
    const defaults = useMemo(() => Object.fromEntries(axes.map((a) => [a.prop, a.defaultValue])), [axes]);
    const [picks, setPicks] = useState(defaults);
    const [pointer, setPointer] = useState({ hover: false, press: false, focus: false });
    const wrapRef = useRef(null);
    // A changed property starts the try over from the defaults.
    useEffect(() => setPicks(defaults), [defaults]);
    useEffect(() => {
        // The click that opened this preview is still bubbling when it mounts.
        const since = performance.now();
        const handleOutside = (e) => {
            const wrap = wrapRef.current;
            if (e.timeStamp < since)
                return;
            if (wrap === null || (e.target instanceof Node && wrap.contains(e.target)))
                return;
            setPicks((current) => afterTrigger(current, interactions, 'outside'));
        };
        const handleKey = (e) => {
            if (e.key === 'Escape')
                setPicks((current) => afterTrigger(current, interactions, 'escape'));
        };
        document.addEventListener('click', handleOutside);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('click', handleOutside);
            document.removeEventListener('keydown', handleKey);
        };
    }, [interactions]);
    /** The element clicked, as the handler finds it: the nearest with a click of its own, else the root. */
    const handleClick = (e) => {
        const targets = new Set(interactions.filter((i) => i.trigger === 'click').map((i) => i.target ?? ROOT_ELEMENT_ID));
        const byClass = new Map(Object.values(elements).map((el) => [classNameFor(el), el.id]));
        let node = e.target instanceof Element ? e.target.closest('[data-scamp-id]') : null;
        let target = ROOT_ELEMENT_ID;
        while (node !== null && wrapRef.current?.contains(node)) {
            const id = byClass.get(node.getAttribute('data-scamp-id') ?? '');
            if (id !== undefined && targets.has(id)) {
                target = id;
                break;
            }
            node = node.parentElement?.closest('[data-scamp-id]') ?? null;
        }
        setPicks((current) => afterTrigger(current, interactions, 'click', target));
    };
    const shown = shownPicks(picks, interactions, pointer);
    return (_jsxs("div", { className: styles.try, "data-testid": "try-interactions", children: [_jsxs("span", { className: styles.label, children: ["Try it: ", axes.map((a) => shown[a.prop]).join(' · ')] }), _jsxs("div", { ref: wrapRef, className: styles.frame, tabIndex: 0, [CANVAS_SCOPE_ATTR]: '', style: { ...themeCssVars, fontFamily: themeFontFamily, zoom: scale }, onPointerEnter: () => setPointer((p) => ({ ...p, hover: true })), onPointerLeave: () => setPointer((p) => ({ ...p, hover: false, press: false })), onPointerDown: () => setPointer((p) => ({ ...p, press: true })), onPointerUp: () => setPointer((p) => ({ ...p, press: false })), onFocus: () => setPointer((p) => ({ ...p, focus: true })), onBlur: () => setPointer((p) => ({ ...p, focus: false })), onClick: handleClick, children: [_jsx(CanvasPageStylesheet, {}), _jsx(VariantFrameContext.Provider, { value: { variantKey: keyFor(axes, shown), displayOnly: true }, children: _jsx(ElementRenderer, { elementId: ROOT_ELEMENT_ID }) })] })] }));
};

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID, variantKey } from '@lib/element';
import { CANVAS_SCOPE_ATTR } from '@lib/canvasStylesheet';
import { ElementRenderer } from './ElementRenderer';
import { CanvasPageStylesheet } from './Viewport';
import { VariantFrameContext } from './variantFrame';
import { useCanvasTheme } from './useCanvasTheme';
import styles from './VariantFrames.module.css';
const EMPTY_AXES = [];
/** The base look, then every other value of every axis. */
const framesFor = (axes) => [
    { key: null, label: axes.map((a) => a.defaultValue).join(' · ') },
    ...axes.flatMap((axis) => axis.values
        .filter((value) => value !== axis.defaultValue)
        .map((value) => ({ key: variantKey(axis.prop, value), label: `${axis.prop}: ${value}` }))),
];
/**
 * Every variant value but the one being edited, drawn read-only beside
 * the live frame. Clicking one edits it.
 * see docs/plans/component-variants-plan.md
 */
export const VariantFrames = ({ width, minHeight, scale }) => {
    const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
    const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
    const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
    const { themeCssVars, themeFontFamily } = useCanvasTheme();
    if (axes.length === 0)
        return null;
    const frames = framesFor(axes).filter((f) => f.key !== activeVariantKey);
    return (_jsx("div", { className: styles.frames, "data-testid": "variant-frames", children: frames.map((frame) => (
        // A div, not a <button>: the component drawn inside may be a button itself.
        _jsxs("div", { role: "button", tabIndex: 0, className: styles.frameButton, onClick: () => setActiveVariant(frame.key), onKeyDown: (e) => {
                if (e.key !== 'Enter' && e.key !== ' ')
                    return;
                e.preventDefault();
                setActiveVariant(frame.key);
            }, "aria-label": `Edit ${frame.label}`, "data-variant-frame": frame.key ?? 'base', children: [_jsx("span", { className: styles.label, children: frame.label }), _jsxs("div", { className: styles.frame, [CANVAS_SCOPE_ATTR]: '', style: {
                        ...themeCssVars,
                        width: `${width}px`,
                        minHeight: `${minHeight}px`,
                        fontFamily: themeFontFamily,
                        zoom: scale,
                    }, children: [_jsx(CanvasPageStylesheet, {}), _jsx(VariantFrameContext.Provider, { value: { variantKey: frame.key }, children: _jsx(ElementRenderer, { elementId: ROOT_ELEMENT_ID }) })] })] }, frame.key ?? 'base'))) }));
};

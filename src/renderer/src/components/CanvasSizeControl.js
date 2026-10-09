import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { componentCanvasSizeFor, DESKTOP_BREAKPOINT_ID, MAX_CANVAS_WIDTH, MAX_COMPONENT_CANVAS_DIM, MIN_CANVAS_WIDTH, MIN_COMPONENT_CANVAS_DIM, } from '@shared/types';
import { clampCanvasHeight, clampCanvasWidth, resolveClip, } from '@shared/projectConfig';
import { useCanvasStore } from '@store/canvasSlice';
import { NumberInput } from './controls/NumberInput';
import { Tooltip } from './controls/Tooltip';
import styles from './CanvasSizeControl.module.css';
/** Seed height when the user first enables page fixed-height mode. */
const DEFAULT_PAGE_FIXED_HEIGHT = 900;
/**
 * Toolbar control for the canvas viewport size + active breakpoint.
 *
 * The button's label reflects the active breakpoint (or a custom-
 * width readout when no preset matches). Clicking opens a popover
 * with:
 *   - A segmented list of the project's breakpoints. Clicking one
 *     sets canvas width AND active breakpoint — so subsequent
 *     property-panel edits land inside that breakpoint's @media
 *     block.
 *   - A custom-width input. Typing a value that doesn't match any
 *     breakpoint drops the active breakpoint to `desktop` so edits
 *     apply to the base CSS.
 *   - A "Clip content" toggle (per breakpoint for pages) and a
 *     "Fixed height" toggle + input. All viewport-frame preview
 *     helpers — never written to CSS.
 */
export const CanvasSizeControl = ({ config, onChange, componentName, componentKind, }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const activeBreakpointId = useCanvasStore((s) => s.activeBreakpointId);
    const setActiveBreakpoint = useCanvasStore((s) => s.setActiveBreakpoint);
    useEffect(() => {
        if (!open)
            return;
        const handleDocClick = (e) => {
            const node = wrapRef.current;
            if (!node)
                return;
            if (!node.contains(e.target))
                setOpen(false);
        };
        const handleKey = (e) => {
            if (e.key !== 'Escape')
                return;
            setOpen(false);
            // Esc closes the popover and nothing else — in the component
            // editor, the window's Esc handler would exit the editor too.
            e.stopPropagation();
        };
        document.addEventListener('mousedown', handleDocClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleDocClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);
    /** Pick a preset: updates canvas width AND active breakpoint. */
    const selectBreakpoint = (bp) => {
        onChange({ ...config, canvasWidth: clampCanvasWidth(bp.width) });
        setActiveBreakpoint(bp.id);
    };
    const setOverflow = (overflow) => {
        onChange({ ...config, canvasOverflowHidden: overflow });
    };
    // Page-canvas clip is stored per breakpoint (the active one). Deleting
    // the key when turning it off keeps the map minimal / text-stable.
    const pageClip = resolveClip(config, activeBreakpointId);
    const setPageClip = (clip) => {
        const map = { ...(config.canvasClipByBreakpoint ?? {}) };
        if (clip)
            map[activeBreakpointId] = true;
        else
            delete map[activeBreakpointId];
        onChange({
            ...config,
            canvasClipByBreakpoint: Object.keys(map).length > 0 ? map : undefined,
        });
    };
    // Fixed page-canvas height. Enabling seeds a default when none is set.
    const setFixedHeightOn = (on) => {
        onChange({
            ...config,
            canvasFixedHeight: on ? true : undefined,
            canvasHeight: on
                ? config.canvasHeight ?? DEFAULT_PAGE_FIXED_HEIGHT
                : config.canvasHeight,
        });
    };
    const setCanvasHeight = (next) => {
        if (next === undefined)
            return;
        onChange({ ...config, canvasHeight: clampCanvasHeight(next) });
    };
    const handleCustomChange = (next) => {
        if (next === undefined)
            return;
        const clamped = clampCanvasWidth(next);
        onChange({ ...config, canvasWidth: clamped });
        // A custom width means we're NOT editing a specific breakpoint —
        // drop back to desktop so panel edits target the base CSS.
        const match = config.breakpoints.find((b) => b.width === clamped);
        setActiveBreakpoint(match ? match.id : DESKTOP_BREAKPOINT_ID);
    };
    // Component-mode helpers. Component canvases store both
    // dimensions explicitly (vs. page canvases where height grows
    // with content), so we compute the current size with a
    // fallback to DEFAULT_COMPONENT_CANVAS_SIZE for components the
    // user hasn't resized yet.
    const componentSize = componentName
        ? componentCanvasSizeFor(config, componentName, componentKind ?? 'component')
        : null;
    const clampComponentDim = (n) => Math.round(Math.max(MIN_COMPONENT_CANVAS_DIM, Math.min(MAX_COMPONENT_CANVAS_DIM, n)));
    const setComponentSize = (next) => {
        if (!componentName)
            return;
        const clamped = {
            width: clampComponentDim(next.width),
            height: clampComponentDim(next.height),
        };
        onChange({
            ...config,
            componentCanvas: {
                ...(config.componentCanvas ?? {}),
                [componentName]: clamped,
            },
        });
    };
    const activeBreakpoint = config.breakpoints.find((b) => b.id === activeBreakpointId);
    const buttonLabel = componentSize
        ? `${activeBreakpoint?.label ?? 'Desktop'} · ${componentSize.width} × ${componentSize.height}`
        : activeBreakpoint
            ? `${activeBreakpoint.label} · ${config.canvasWidth}`
            : `${config.canvasWidth}px`;
    return (_jsxs("div", { className: styles.wrap, ref: wrapRef, children: [_jsx(Tooltip, { label: componentSize ? 'Active breakpoint · canvas size' : 'Canvas width · active breakpoint', children: _jsxs("button", { className: styles.button, type: "button", onClick: () => setOpen((v) => !v), "aria-haspopup": "dialog", "aria-expanded": open, "data-testid": "canvas-size-button", "data-active-breakpoint": activeBreakpointId, children: [buttonLabel, _jsx("span", { className: styles.caret, "aria-hidden": "true", children: "\u25BE" })] }) }), open && (_jsx("div", { className: styles.popover, role: "dialog", "data-testid": "canvas-size-popover", children: componentSize ? (
                // Component-mode popover. A component's own CSS carries
                // breakpoint rules (an imported sidebar collapses at
                // Tablet), so the presets choose the screen size it's shown
                // and edited at. They don't resize the canvas: that's the
                // component's own box, set below.
                // see docs/notes/canvas-injected-stylesheet.md
                _jsxs(_Fragment, { children: [_jsx("div", { className: styles.sectionLabel, children: "Breakpoint" }), _jsx("div", { className: styles.presetGrid, children: config.breakpoints.map((bp) => (_jsxs("button", { className: `${styles.presetButton} ${bp.id === activeBreakpointId ? styles.presetActive : ''}`, type: "button", onClick: () => setActiveBreakpoint(bp.id), children: [_jsx("span", { className: styles.presetName, children: bp.label }), _jsx("span", { className: styles.presetWidth, children: bp.width })] }, bp.id))) }), _jsx("p", { className: styles.hint, children: "The screen size the component is shown and edited at. Its canvas keeps the size below." }), _jsx("div", { className: styles.sectionLabel, children: "Canvas size" }), _jsxs("div", { className: styles.customRow, children: [_jsx(NumberInput, { value: componentSize.width, onChange: (next) => {
                                        if (next === undefined)
                                            return;
                                        setComponentSize({
                                            width: next,
                                            height: componentSize.height,
                                        });
                                    }, min: MIN_COMPONENT_CANVAS_DIM, max: MAX_COMPONENT_CANVAS_DIM, suffix: "W" }), _jsx(NumberInput, { value: componentSize.height, onChange: (next) => {
                                        if (next === undefined)
                                            return;
                                        setComponentSize({
                                            width: componentSize.width,
                                            height: next,
                                        });
                                    }, min: MIN_COMPONENT_CANVAS_DIM, max: MAX_COMPONENT_CANVAS_DIM, suffix: "H" })] }), _jsxs("label", { className: styles.toggleRow, children: [_jsx("input", { type: "checkbox", checked: config.canvasOverflowHidden, onChange: (e) => setOverflow(e.target.checked) }), _jsx("span", { children: "Clip content" })] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: styles.sectionLabel, children: "Breakpoint" }), _jsx("div", { className: styles.presetGrid, children: config.breakpoints.map((bp) => (_jsxs("button", { className: `${styles.presetButton} ${bp.id === activeBreakpointId ? styles.presetActive : ''}`, type: "button", onClick: () => selectBreakpoint(bp), children: [_jsx("span", { className: styles.presetName, children: bp.label }), _jsx("span", { className: styles.presetWidth, children: bp.width })] }, bp.id))) }), _jsx("div", { className: styles.sectionLabel, children: "Custom width" }), _jsx("div", { className: styles.customRow, children: _jsx(NumberInput, { value: config.canvasWidth, onChange: handleCustomChange, min: MIN_CANVAS_WIDTH, max: MAX_CANVAS_WIDTH, suffix: "px" }) }), _jsxs("label", { className: styles.toggleRow, children: [_jsx("input", { type: "checkbox", checked: pageClip, onChange: (e) => setPageClip(e.target.checked) }), _jsx("span", { children: "Clip content" })] }), _jsxs("label", { className: styles.toggleRow, children: [_jsx("input", { type: "checkbox", checked: config.canvasFixedHeight === true, onChange: (e) => setFixedHeightOn(e.target.checked) }), _jsx("span", { children: "Fixed height" })] }), config.canvasFixedHeight === true && (_jsx("div", { className: styles.customRow, children: _jsx(NumberInput, { value: config.canvasHeight ?? DEFAULT_PAGE_FIXED_HEIGHT, onChange: setCanvasHeight, min: MIN_CANVAS_WIDTH, max: MAX_CANVAS_WIDTH, suffix: "H" }) }))] })) }))] }));
};

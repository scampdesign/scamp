import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { nextZoomFromWheel } from '@lib/zoom';
import { DEFAULT_BODY_FONT_FAMILY, } from '@shared/agentMd';
import { MAX_COMPONENT_CANVAS_DIM, MIN_COMPONENT_CANVAS_DIM, } from '@shared/types';
import { overflowExtent, settleExtent } from '@lib/canvasOverflow';
import { ElementRenderer } from './ElementRenderer';
import { buildCanvasStylesheet, CANVAS_SCOPE_ATTR } from '@lib/canvasStylesheet';
import { animatedSubtreePredicate, layoutEdges } from './animatedExtent';
import { generateCode } from '@lib/generateCode';
import { collectExpandedInstances } from '@lib/generateHtml';
import { assemblePageCss } from '@lib/htmlExportCss';
import { CanvasInteractionLayer } from './CanvasInteractionLayer';
import { CanvasBoundaryOverlay } from './CanvasBoundaryOverlay';
import styles from './Viewport.module.css';
// Padding subtracted from the scroll container's inner width when
// computing fit-to-width zoom. Mirrors the artboard's horizontal
// padding so the fitted frame doesn't sit flush against the
// scrollbar.
const FRAME_FIT_INSET = 40;
/**
 * Floor on the canvas frame's rendered height. Purely a design-tool
 * convenience — the frame grows past this as content is added, but
 * this keeps an empty project looking like a blank page rather than
 * a thin strip. Also used by `ElementRenderer` as the root element's
 * canvas-only min-height so flex-column centering has vertical space
 * to distribute within.
 */
export const EMPTY_FRAME_MIN_HEIGHT = 900;
/**
 * Opt-in tracing for the canvas extent -> fit-zoom loop, enabled with
 * `localStorage.setItem('scamp.debugZoom', '1')` and a reload.
 *
 * The extent feeds the fit scale and the fit scale is the basis the extent
 * is measured against, so when the two disagree the canvas alternates
 * between two zoom levels on every edit. Which element sets the widest
 * edge is the fact that identifies the cause, and it can only be read from
 * a running canvas with a real project in it.
 */
const extentDebugEnabled = () => {
    try {
        return globalThis.localStorage?.getItem('scamp.debugZoom') === '1';
    }
    catch {
        return false;
    }
};
export const Viewport = ({ canvasWidth, canvasHeight, heightIsFixed = false, clipContent, scrollContainerRef, onResize, }) => {
    const frameRef = useRef(null);
    const [scale, setScale] = useState(1);
    // Tracks the frame's natural (pre-scale) height so the frameShell
    // reserves the correct scrolled-space footprint after the frame's
    // own content grows.
    const [frameH, setFrameH] = useState(0);
    // Logical content extent (rightmost / bottommost rendered edge)
    // measured from element bounding boxes. Drives the boundary overlay
    // AND the frameShell expansion that keeps off-canvas content visible
    // and scrollable when clip is off. Measured from getBoundingClientRect
    // (not scrollWidth) because `overflow: visible` reports scrollWidth ===
    // clientWidth, so a scroll-box measure would miss overflow while clip
    // is off — exactly when we need it.
    const [content, setContent] = useState({ right: 0, bottom: 0 });
    const rootElementId = useCanvasStore((s) => s.rootElementId);
    // Subscribe to the element tree so overflow is re-measured after any
    // edit — a child overflowing horizontally doesn't change the frame's
    // own box, so a ResizeObserver on the frame alone wouldn't fire.
    const elements = useCanvasStore((s) => s.elements);
    const activeTool = useCanvasStore((s) => s.activeTool);
    const userZoom = useCanvasStore((s) => s.userZoom);
    const setFitScale = useCanvasStore((s) => s.setFitScale);
    const themeTokens = useCanvasStore((s) => s.themeTokens);
    // Resolve the body-level default font from the project's theme.css
    // tokens. Mirrors what the preview / `next dev` would inherit from
    // the `body { font-family: var(--font-sans) }` rule in theme.css —
    // so the canvas and the deployed page render the same default font.
    // Falls back to the constant when the project hasn't defined a
    // `--font-sans` token (e.g. older projects pre-dating this default).
    const themeFontFamily = themeTokens.find((t) => t.name === '--font-sans')?.value ??
        DEFAULT_BODY_FONT_FAMILY;
    // Inject every project theme token as a CSS custom property on the
    // canvas frame so `var(--…)` references inside both typed style and
    // unmapped customProperties resolve natively (same scope rules as
    // the preview, where `theme.css` lives in the page's `<head>`).
    // Without this, only the typed-property path gets `resolveTokenColor`
    // / `resolveTokenValue` substitution; raw shorthand declarations
    // routed through `customProperties` (e.g. `border-bottom: 1px solid
    // var(--color-border)`) silently fall back to currentColor or
    // browser defaults because the Scamp app's `:root` doesn't carry
    // the project tokens.
    const themeCssVars = useMemo(() => {
        const vars = {};
        for (const token of themeTokens) {
            // Skip Scamp chrome variables — only project-declared tokens
            // (the parser only surfaces declarations from theme.css's
            // `:root` so this filter is mostly defensive).
            if (!token.name.startsWith('--'))
                continue;
            vars[token.name] = token.value;
        }
        return vars;
    }, [themeTokens]);
    const frameW = canvasWidth;
    // Auto-fit scale derived from the scroll container's client width.
    const [fitScale, setLocalFitScale] = useState(1);
    // Fit the CONTENT width (canvas + any overflow) when clip is off, so
    // overflowing elements AND the boundary line stay on screen — the user
    // needs to see what's spilling past the canvas to fix it. When clip is
    // on, fit the canvas width only (overflow is hidden anyway). `content`
    // is measured in logical (scale-invariant) px, so this doesn't loop.
    const fitWidth = clipContent ? frameW : Math.max(frameW, content.right);
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container)
            return;
        const measure = () => {
            const w = container.clientWidth - FRAME_FIT_INSET * 2;
            if (w <= 0)
                return;
            // Width-only fit — tall pages scroll vertically inside the
            // artboard instead of squashing. Never scale up past 1.0.
            const next = Math.min(w / fitWidth, 1);
            if (extentDebugEnabled()) {
                console.log('[fit] containerWidth=%s fitWidth=%s (frameW=%s contentRight=%s clip=%s) -> scale=%s', w, fitWidth, frameW, content.right, clipContent, next.toFixed(4));
            }
            setLocalFitScale(next);
            // Mirror into the store so the zoom indicator can show the real
            // percentage in fit mode and the wheel handler can anchor on it.
            setFitScale(next);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(container);
        return () => ro.disconnect();
    }, [fitWidth, scrollContainerRef, setFitScale]);
    // Effective scale: explicit user zoom wins, otherwise auto-fit.
    useLayoutEffect(() => {
        setScale(userZoom ?? fitScale);
    }, [userZoom, fitScale]);
    // Continuous zoom via trackpad pinch / Cmd-Ctrl+wheel. The listener is
    // non-passive so it can preventDefault the browser's native page zoom.
    // Cursor anchoring is applied after commit in the layout effect below,
    // using the point stashed here. see docs/notes/canvas-wheel-zoom.md
    const zoomAnchorRef = useRef(null);
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container)
            return;
        const handleWheel = (e) => {
            if (!(e.ctrlKey || e.metaKey))
                return;
            e.preventDefault();
            const state = useCanvasStore.getState();
            const old = state.userZoom ?? state.fitScale;
            const next = nextZoomFromWheel(old, e.deltaY);
            if (next === old)
                return;
            const frame = frameRef.current;
            if (frame) {
                const rect = frame.getBoundingClientRect();
                zoomAnchorRef.current = {
                    logicalX: (e.clientX - rect.left) / old,
                    logicalY: (e.clientY - rect.top) / old,
                    delta: next - old,
                };
            }
            state.setZoom(next);
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [scrollContainerRef]);
    // Cursor anchoring: once the new scale is committed to the DOM (so the
    // frame's transform is live), shift the scroll so the logical point the
    // pointer was over stays under the pointer. see docs/notes/canvas-wheel-zoom.md
    useLayoutEffect(() => {
        const anchor = zoomAnchorRef.current;
        if (!anchor)
            return;
        zoomAnchorRef.current = null;
        const container = scrollContainerRef.current;
        if (!container)
            return;
        container.scrollLeft += anchor.logicalX * anchor.delta;
        container.scrollTop += anchor.logicalY * anchor.delta;
    }, [scale, scrollContainerRef]);
    // see extentDebugEnabled above for the tracing flag
    // Measure the frame's natural (pre-scale) height AND its overflow past
    // the canvas bounds. `transform: scale` doesn't affect layout, so we
    // need frameH to reserve the right scrolled-space footprint; the scroll
    // box gives overflow (`scrollWidth`/`scrollHeight` include overflowing
    // descendants even under `overflow: hidden`).
    const measureFrame = useCallback(() => {
        const frame = frameRef.current;
        if (!frame)
            return;
        setFrameH(frame.offsetHeight);
        // Content extent = the furthest right/bottom rendered element edge,
        // in the frame's LOGICAL (pre-scale) coordinates. The applied scale
        // is recovered from the frame's own client rect vs its layout width
        // so we don't depend on the `scale` state (avoids a stale closure).
        const frameRect = frame.getBoundingClientRect();
        const appliedScale = frame.offsetWidth > 0 ? frameRect.width / frame.offsetWidth : 1;
        let right = frame.clientWidth;
        let bottom = frame.clientHeight;
        // Which element set the widest edge. Only read when the extent debug
        // flag is on; naming the culprit is the whole point of that log.
        let widest = '';
        // A running animation moves an element's bounding box, so measuring it
        // reads whatever frame the animation is on — which flips the extent,
        // and with it the fit zoom, on every edit. Those elements are measured
        // by their transform-free layout box instead.
        // see src/renderer/src/canvas/animatedExtent.ts
        const isAnimated = animatedSubtreePredicate(frame);
        for (const node of frame.querySelectorAll('[data-element-id]')) {
            if (!(node instanceof HTMLElement))
                continue;
            let nodeRight;
            let nodeBottom;
            if (isAnimated(node)) {
                const edges = layoutEdges(node, frame);
                if (edges === null)
                    continue;
                nodeRight = edges.right;
                nodeBottom = edges.bottom;
            }
            else {
                const r = node.getBoundingClientRect();
                nodeRight = (r.right - frameRect.left) / appliedScale;
                nodeBottom = (r.bottom - frameRect.top) / appliedScale;
            }
            if (nodeRight > right) {
                right = nodeRight;
                widest = node.getAttribute('data-element-id') ?? '';
            }
            bottom = Math.max(bottom, nodeBottom);
        }
        if (extentDebugEnabled()) {
            console.log('[extent] scale=%s frameClientWidth=%s rawRight=%s settled=%s widest=%s', appliedScale.toFixed(4), frame.clientWidth, right.toFixed(2), settleExtent(right, frame.clientWidth), widest || '(none — nothing past the frame)');
        }
        // `settleExtent` absorbs the sub-pixel wobble an exactly-frame-width
        // element produces, and the identity bail keeps an unchanged
        // measurement from re-rendering — the extent feeds the zoom, so a
        // no-op re-render here is a lap around the whole sizing loop.
        // see docs/notes/canvas-extent-oscillation.md
        const nextRight = settleExtent(right, frame.clientWidth);
        const nextBottom = settleExtent(bottom, frame.clientHeight);
        setContent((prev) => prev.right === nextRight && prev.bottom === nextBottom
            ? prev
            : { right: nextRight, bottom: nextBottom });
    }, []);
    // Tight bounding box of the root's descendants, in logical px — the size the
    // artboard should be to "hug" its content. Unlike `measureFrame` this SKIPS
    // the root (which fills the frame) and isn't floored by the frame, so it can
    // shrink. Includes each child's outer margin and the root's own padding so
    // the hug keeps the component's breathing room. Returns null when there's no
    // non-root content.
    //
    // Uses `offsetLeft/Top/Width/Height` (already logical, scale-free) rather
    // than `getBoundingClientRect()/scale`: at a fractional zoom (e.g. Fit ≈ 0.5)
    // dividing client px by the scale AMPLIFIES sub-pixel rounding, which left a
    // ~2px gap below the hugged content. see docs/plans/component-canvas-sizing-plan.md
    const measureContentSize = useCallback(() => {
        const frame = frameRef.current;
        if (!frame)
            return null;
        let right = 0;
        let bottom = 0;
        let found = false;
        for (const node of frame.querySelectorAll('[data-element-id]')) {
            if (!(node instanceof HTMLElement))
                continue;
            if (node.dataset['elementId'] === rootElementId)
                continue;
            found = true;
            // Accumulate the element's offset up the offsetParent chain to the
            // frame — logical (unscaled) coordinates, matching measureElementInFrame.
            let offLeft = 0;
            let offTop = 0;
            let cur = node;
            while (cur && cur !== frame) {
                offLeft += cur.offsetLeft;
                offTop += cur.offsetTop;
                cur = cur.offsetParent;
            }
            const cs = getComputedStyle(node);
            const marginRight = parseFloat(cs.marginRight) || 0;
            const marginBottom = parseFloat(cs.marginBottom) || 0;
            right = Math.max(right, offLeft + node.offsetWidth + marginRight);
            bottom = Math.max(bottom, offTop + node.offsetHeight + marginBottom);
        }
        if (!found)
            return null;
        // Per axis: a FIXED-size root already has a definite box (its own size IS
        // the component's size), so hug to the root's rendered extent — content
        // that overflows a fixed box (e.g. text line-height in a fixed-height,
        // padded header) must NOT push the canvas past the root's edge. For
        // non-fixed axes the root fills the canvas, so hug to the content bounds
        // plus the root's own padding (breathing room). see docs/plans/component-canvas-sizing-plan.md
        const rootNode = frame.querySelector(`[data-element-id="${rootElementId}"]`);
        const rootEl = elements[rootElementId];
        const rs = rootNode instanceof HTMLElement ? getComputedStyle(rootNode) : null;
        const widthFixed = rootEl?.widthMode === 'fixed' && rootNode instanceof HTMLElement;
        const heightFixed = rootEl?.heightMode === 'fixed' && rootNode instanceof HTMLElement;
        const width = widthFixed
            ? rootNode.offsetWidth
            : right + (rs ? parseFloat(rs.paddingRight) || 0 : 0);
        const height = heightFixed
            ? rootNode.offsetHeight
            : bottom + (rs ? parseFloat(rs.paddingBottom) || 0 : 0);
        const clamp = (n) => Math.max(MIN_COMPONENT_CANVAS_DIM, Math.min(MAX_COMPONENT_CANVAS_DIM, Math.round(n)));
        return { width: clamp(width), height: clamp(height) };
    }, [rootElementId, elements]);
    // Double-clicking a resize handle fits the artboard to its content. Persists
    // through the same `onResize` path as a drag (→ componentCanvas[name]).
    const handleFitToContent = useCallback(() => {
        const fit = measureContentSize();
        if (fit && onResize)
            onResize(fit.width, fit.height);
    }, [measureContentSize, onResize]);
    useEffect(() => {
        const frame = frameRef.current;
        if (!frame)
            return;
        measureFrame();
        const ro = new ResizeObserver(measureFrame);
        ro.observe(frame);
        return () => ro.disconnect();
    }, [measureFrame]);
    // Horizontal overflow doesn't change the frame's own box, so the
    // ResizeObserver above won't fire on it — re-measure on tree / size
    // changes too.
    useLayoutEffect(() => {
        measureFrame();
    }, [elements, frameW, canvasHeight, heightIsFixed, clipContent, measureFrame]);
    const SIGN = {
        br: { w: 1, h: 1 },
        bl: { w: -1, h: 1 },
        tr: { w: 1, h: -1 },
        tl: { w: -1, h: -1 },
    };
    // Pointer-based corner resize. `setPointerCapture` keeps the
    // drag attached to the handle even when the cursor leaves it.
    // Each move emits a (width, height) snapshot scaled by the
    // frame's transform so logical pixels match the stored canvas
    // size.
    const makeResizePointerDown = (corner) => (e) => {
        if (!onResize)
            return;
        e.preventDefault();
        e.stopPropagation();
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const startWidth = canvasWidth;
        // `canvasHeight` is the user-set MIN height; the frame
        // grows past it when content overflows. Resizing should
        // start from the user-set value (not the measured value)
        // so dragging is predictable when content is taller than
        // the min.
        const startHeight = canvasHeight ?? frameH;
        const signs = SIGN[corner];
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
            const dx = (ev.clientX - startClientX) / scale;
            const dy = (ev.clientY - startClientY) / scale;
            const nextWidth = Math.max(MIN_COMPONENT_CANVAS_DIM, Math.min(MAX_COMPONENT_CANVAS_DIM, Math.round(startWidth + dx * signs.w)));
            const nextHeight = Math.max(MIN_COMPONENT_CANVAS_DIM, Math.min(MAX_COMPONENT_CANVAS_DIM, Math.round(startHeight + dy * signs.h)));
            onResize(nextWidth, nextHeight);
        };
        const onUp = (ev) => {
            try {
                target.releasePointerCapture(ev.pointerId);
            }
            catch {
                // Pointer capture already released by the runtime — ignore.
            }
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerup', onUp);
            target.removeEventListener('pointercancel', onUp);
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
        target.addEventListener('pointercancel', onUp);
    };
    // Frame-shell reserved height:
    //   - page fixed-height → EXACTLY `canvasHeight` (content clips /
    //     overflows past it rather than growing the frame).
    //   - component mode → LARGER of the user-set min and measured content
    //     (grows as elements are added past the min).
    //   - page auto-height → `frameH` (grows with content).
    const reservedHeight = heightIsFixed && canvasHeight !== undefined
        ? canvasHeight
        : canvasHeight !== undefined
            ? Math.max(canvasHeight, frameH)
            : frameH;
    // Overflow past the canvas boundary (logical px). The vertical figure
    // is only surfaced in fixed-height mode; the overlay gates on that.
    const overflowX = overflowExtent(content.right, frameW);
    const overflowY = overflowExtent(content.bottom, reservedHeight);
    // When clip is OFF, the frameShell must reserve the overflowing content
    // so the artboard can scroll to it (otherwise it's visually clipped by
    // the scroll container). When clip is ON, the shell stays at the canvas
    // bounds and the frame's `overflow: hidden` does the clipping.
    const shellWidth = (clipContent ? frameW : Math.max(frameW, content.right)) * scale;
    const shellHeight = (clipContent ? reservedHeight : Math.max(reservedHeight, content.bottom)) *
        scale;
    return (_jsxs("div", { className: styles.frameShell, style: {
            width: shellWidth,
            height: shellHeight,
        }, children: [_jsxs("div", { ref: frameRef, className: styles.frame, "data-testid": "canvas-frame", [CANVAS_SCOPE_ATTR]: '', "data-canvas-width": frameW, "data-canvas-scale": scale, "data-cursor": activeTool === 'rectangle' || activeTool === 'image'
                    ? 'crosshair'
                    : activeTool === 'text'
                        ? 'text'
                        : 'default', style: {
                    // Project theme tokens live on the frame as real CSS custom
                    // properties, so `var(--…)` references inside any descendant
                    // (typed inline styles, customProperties, hand-written CSS
                    // in CodeMirror) resolve natively. MUST spread first so the
                    // explicit style properties below win on key collisions.
                    ...themeCssVars,
                    width: `${frameW}px`,
                    // Page fixed-height mode pins an EXACT height. Otherwise
                    // `canvasHeight` is a MIN (component mode grows past it), and
                    // page mode falls back to the EMPTY_FRAME_MIN_HEIGHT floor so
                    // blank pages have a visible canvas to draw on.
                    ...(heightIsFixed && canvasHeight !== undefined
                        ? { height: `${canvasHeight}px` }
                        : { minHeight: `${canvasHeight ?? EMPTY_FRAME_MIN_HEIGHT}px` }),
                    overflow: clipContent ? 'hidden' : undefined,
                    // Makes the frame the container width-based `@media` blocks are
                    // rewritten to query, so breakpoints resolve against the artboard
                    // rather than the app window.
                    // see docs/notes/canvas-injected-stylesheet.md
                    containerType: 'inline-size',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    // Mirror the project's `body { font-family: var(--font-sans) }`
                    // rule from theme.css so an unstyled element on the canvas
                    // renders in the same font as in preview / `next dev` /
                    // production. Without this, the canvas inherits Scamp's
                    // chrome font (Ubuntu Mono on Linux, San Francisco on
                    // macOS, etc.) and visually disagrees with the preview.
                    fontFamily: themeFontFamily,
                    position: 'relative',
                }, children: [_jsx(CanvasKeyframes, {}), _jsx(CanvasPageStylesheet, {}), _jsx(ElementRenderer, { elementId: rootElementId }), _jsx(CanvasInteractionLayer, { frameRef: frameRef, scale: scale }), onResize && (_jsxs(_Fragment, { children: [_jsx("div", { className: `${styles.canvasResizeHandle} ${styles.canvasResizeHandleTL}`, onPointerDown: makeResizePointerDown('tl'), onDoubleClick: handleFitToContent, "aria-label": "Resize canvas (top-left)", title: "Drag to resize \u00B7 double-click to fit content" }), _jsx("div", { className: `${styles.canvasResizeHandle} ${styles.canvasResizeHandleTR}`, onPointerDown: makeResizePointerDown('tr'), onDoubleClick: handleFitToContent, "aria-label": "Resize canvas (top-right)", title: "Drag to resize \u00B7 double-click to fit content" }), _jsx("div", { className: `${styles.canvasResizeHandle} ${styles.canvasResizeHandleBL}`, onPointerDown: makeResizePointerDown('bl'), onDoubleClick: handleFitToContent, "aria-label": "Resize canvas (bottom-left)", title: "Drag to resize \u00B7 double-click to fit content" }), _jsx("div", { className: `${styles.canvasResizeHandle} ${styles.canvasResizeHandleBR}`, onPointerDown: makeResizePointerDown('br'), onDoubleClick: handleFitToContent, "aria-label": "Resize canvas (bottom-right)", title: "Drag to resize \u00B7 double-click to fit content" })] }))] }), _jsx(CanvasBoundaryOverlay, { scale: scale, boundaryWidth: frameW, boundaryHeight: reservedHeight, overflowX: overflowX, overflowY: overflowY, naturalHeight: content.bottom, clip: clipContent, fixedHeight: heightIsFixed })] }));
};
/**
 * Mounts a `<style>` element inside the canvas frame containing the
 * page's `@keyframes` blocks. Without this, the inline `animation`
 * declarations the renderer applies during preview can't resolve
 * their keyframe names — Scamp renders into the Electron renderer's
 * own document, not via the user's CSS module file.
 *
 * Re-renders only when `pageKeyframesBlocks` changes; otherwise the
 * `<style>` tag's textContent stays stable and doesn't churn.
 */
/**
 * Mounts the page's own generated CSS inside the canvas frame.
 *
 * The canvas translates the element model into inline styles, which cannot
 * express `::before` / `::after` or any hand-written selector — those
 * rendered in the preview and not here. Loading the same stylesheet the
 * generator writes to disk supplies exactly what the translation can't.
 * Inline styles still win on the properties they set, so this only adds.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */
const CanvasPageStylesheet = () => {
    const elements = useCanvasStore((s) => s.elements);
    const rootElementId = useCanvasStore((s) => s.rootElementId);
    const breakpoints = useCanvasStore((s) => s.breakpoints);
    const customMediaBlocks = useCanvasStore((s) => s.pageCustomMediaBlocks);
    const pageKeyframesBlocks = useCanvasStore((s) => s.pageKeyframesBlocks);
    const componentTrees = useCanvasStore((s) => s.componentTrees);
    // A component's frame is its own size, not a viewport; its `@media`
    // follow the breakpoint picked instead, as its inline styles do.
    const viewportWidth = useCanvasStore((s) => s.activeComponent?.kind === 'component'
        ? s.breakpoints.find((b) => b.id === s.activeBreakpointId)?.width
        : undefined);
    const sheet = useMemo(() => {
        // `pageName` only names the generated function and the CSS-module
        // import; neither reaches the CSS half, so a placeholder is fine.
        const { css } = generateCode({
            elements,
            rootId: rootElementId,
            pageName: 'canvas',
            breakpoints,
            customMediaBlocks,
            pageKeyframesBlocks,
        });
        // Each instance gets its own prefixed copy of its component's rules,
        // which is what keeps a component's `.root` off the page's and off
        // every other instance's — the job CSS Modules do on disk. Same
        // transform the HTML exporter uses, so the two can't disagree about
        // what a prefix looks like.
        const instances = collectExpandedInstances(elements, rootElementId, componentTrees).map((instance) => {
            const tree = componentTrees[instance.componentName];
            if (!tree)
                return { prefix: instance.prefix, css: '' };
            return {
                prefix: instance.prefix,
                css: generateCode({
                    elements: tree.elements,
                    rootId: tree.rootId,
                    pageName: instance.componentName,
                    breakpoints,
                    isComponent: true,
                }).css,
            };
        });
        return buildCanvasStylesheet(assemblePageCss(css, instances), undefined, viewportWidth);
    }, [
        viewportWidth,
        elements,
        rootElementId,
        breakpoints,
        customMediaBlocks,
        pageKeyframesBlocks,
        componentTrees,
    ]);
    if (sheet.length === 0)
        return null;
    return _jsx("style", { children: sheet });
};
const CanvasKeyframes = () => {
    const keyframes = useCanvasStore((s) => s.pageKeyframesBlocks);
    if (keyframes.length === 0)
        return null;
    const css = keyframes
        .map((block) => `@keyframes ${block.name} {\n${block.body}\n}`)
        .join('\n\n');
    return _jsx("style", { children: css });
};

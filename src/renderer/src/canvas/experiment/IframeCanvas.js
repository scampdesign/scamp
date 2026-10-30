import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { classNameFor, generateCode } from '@lib/generateCode';
import { collectExpandedInstances, generateHtml, INSTANCE_CLASS_SEPARATOR } from '@lib/generateHtml';
import { assemblePageCss, rewriteCssUrls } from '@lib/htmlExportCss';
import { iframeCanvasStats } from './iframeCanvasFlag';
import { morphDom } from './morphDom';
import styles from './IframeCanvas.module.css';
/**
 * Experiment only (option C1): the open page drawn as the HTML export, in a
 * same-origin iframe with the page's real stylesheet, theme.css and fonts.
 * Selection and a move drag are drawn and handled from this document.
 * see docs/plans/canvas-rendering-options.md
 */
const SHELL = '<!doctype html><html><head><meta charset="utf-8" />' +
    '<style data-sheet="theme"></style><style data-sheet="page"></style></head>' +
    '<body style="margin: 0; min-height: 100vh"></body></html>';
const assetUrlFor = (projectPath, legacy) => (url) => {
    if (projectPath === null)
        return url;
    const base = projectPath.replace(/\\/g, '/');
    const asset = (abs) => `scamp-asset://localhost/${encodeURI(abs.replace(/^\/+/, ''))}`;
    if (url.startsWith('./'))
        return asset(`${base}/${url.slice(2)}`);
    if (!legacy && url.startsWith('/') && !url.startsWith('//'))
        return asset(`${base}/public${url}`);
    return url;
};
/** The page element a node inside the iframe belongs to. */
const pageClassOf = (node) => {
    for (let el = node; el !== null; el = el.parentElement) {
        const first = el.classList[0];
        if (first === undefined)
            continue;
        const cut = first.indexOf(INSTANCE_CLASS_SEPARATOR);
        return cut === -1 ? first : first.slice(0, cut);
    }
    return null;
};
/** The node that draws a page element: itself, or an instance's expanded root. */
const nodeFor = (doc, el) => {
    const cls = classNameFor(el);
    return el.type === 'component-instance'
        ? doc.querySelector(`[class^="${CSS.escape(cls)}${INSTANCE_CLASS_SEPARATOR}"]`)
        : doc.querySelector(`.${CSS.escape(cls)}`);
};
export const IframeCanvas = ({ minHeight }) => {
    const elements = useCanvasStore((s) => s.elements);
    const rootId = useCanvasStore((s) => s.rootElementId);
    const breakpoints = useCanvasStore((s) => s.breakpoints);
    const customMediaBlocks = useCanvasStore((s) => s.pageCustomMediaBlocks);
    const pageKeyframesBlocks = useCanvasStore((s) => s.pageKeyframesBlocks);
    const componentTrees = useCanvasStore((s) => s.componentTrees);
    const themeCssRaw = useCanvasStore((s) => s.themeCssRaw);
    const projectPath = useCanvasStore((s) => s.projectPath);
    const legacy = useCanvasStore((s) => s.projectFormat === 'legacy');
    const selectedIds = useCanvasStore((s) => s.selectedElementIds);
    const iframeRef = useRef(null);
    const [doc, setDoc] = useState(null);
    const [height, setHeight] = useState(minHeight);
    const [rects, setRects] = useState([]);
    const mountedAt = useRef(performance.now());
    const lastBody = useRef(null);
    const toAsset = useMemo(() => assetUrlFor(projectPath, legacy), [projectPath, legacy]);
    const built = useMemo(() => {
        const start = performance.now();
        const { css } = generateCode({
            elements,
            rootId,
            pageName: 'canvas',
            breakpoints,
            customMediaBlocks,
            pageKeyframesBlocks,
        });
        const instances = collectExpandedInstances(elements, rootId, componentTrees).map((instance) => {
            const tree = componentTrees[instance.componentName];
            return {
                prefix: instance.prefix,
                css: tree
                    ? generateCode({
                        elements: tree.elements,
                        rootId: tree.rootId,
                        pageName: instance.componentName,
                        breakpoints,
                        isComponent: true,
                    }).css
                    : '',
            };
        });
        const pageCss = rewriteCssUrls(assemblePageCss(css, instances), toAsset);
        const body = generateHtml(elements, rootId, { componentTrees, rewriteAssetUrl: toAsset });
        return { pageCss, body, buildMs: performance.now() - start };
    }, [elements, rootId, breakpoints, customMediaBlocks, pageKeyframesBlocks, componentTrees, toAsset]);
    const themeCss = useMemo(() => rewriteCssUrls(themeCssRaw ?? '', toAsset), [themeCssRaw, toAsset]);
    const handleLoad = () => {
        const loaded = iframeRef.current?.contentDocument ?? null;
        if (loaded === null)
            return;
        // The app loads project fonts as <link>s in its own head; the iframe needs its own copies.
        for (const link of document.head.querySelectorAll('link[data-scamp-font-import]')) {
            const copy = loaded.createElement('link');
            copy.rel = 'stylesheet';
            copy.href = link.href;
            loaded.head.appendChild(copy);
        }
        setDoc(loaded);
    };
    const measureSelection = (target) => {
        const state = useCanvasStore.getState();
        const next = [];
        for (const id of state.selectedElementIds) {
            const el = state.elements[id];
            const node = el === undefined ? null : nodeFor(target, el);
            if (node === null)
                continue;
            const r = node.getBoundingClientRect();
            next.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
        setRects(next);
    };
    useLayoutEffect(() => {
        if (doc === null)
            return;
        const start = performance.now();
        const theme = doc.querySelector('style[data-sheet="theme"]');
        const page = doc.querySelector('style[data-sheet="page"]');
        if (theme !== null && theme.textContent !== themeCss)
            theme.textContent = themeCss;
        if (page !== null && page.textContent !== built.pageCss)
            page.textContent = built.pageCss;
        // A style-only edit leaves the markup as it was, so there's nothing to patch.
        if (lastBody.current !== built.body) {
            lastBody.current = built.body;
            const next = doc.createElement('body');
            next.setAttribute('style', 'margin: 0; min-height: 100vh');
            const template = doc.createElement('template');
            template.innerHTML = built.body;
            next.append(template.content);
            morphDom(doc.body, next);
        }
        const patchMs = performance.now() - start;
        if (iframeCanvasStats.firstDrawMs === null)
            iframeCanvasStats.firstDrawMs = performance.now() - mountedAt.current;
        else
            iframeCanvasStats.updates.push({ buildMs: built.buildMs, patchMs });
        // shortcut: the frame only grows, since `100vh` follows the iframe; shrink on reload.
        setHeight((h) => Math.max(h, minHeight, doc.documentElement.scrollHeight));
        measureSelection(doc);
    }, [doc, built, themeCss, minHeight]);
    useLayoutEffect(() => {
        if (doc !== null)
            measureSelection(doc);
    }, [doc, selectedIds]);
    // Selection and a move drag, from this document.
    const drag = useRef(null);
    const handlePointerDown = (e) => {
        if (doc === null || e.button !== 0)
            return;
        const box = e.currentTarget.getBoundingClientRect();
        const scale = e.currentTarget.offsetWidth > 0 ? box.width / e.currentTarget.offsetWidth : 1;
        const hit = doc.elementFromPoint((e.clientX - box.left) / scale, (e.clientY - box.top) / scale);
        const cls = pageClassOf(hit);
        const state = useCanvasStore.getState();
        const id = cls === null ? null : (Object.values(state.elements).find((el) => classNameFor(el) === cls)?.id ?? null);
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            if (id !== null)
                state.toggleSelectElement(id);
            return;
        }
        state.selectElement(id);
        const el = id === null ? undefined : state.elements[id];
        const node = el === undefined ? null : nodeFor(doc, el);
        // Only what the browser lays out as absolute moves by x / y; the model's `auto` can be either.
        // The node is from the iframe's window, so `instanceof HTMLElement` here would always fail.
        if (el === undefined || el.id === ROOT_ELEMENT_ID || node === null || !('style' in node))
            return;
        if (doc.defaultView?.getComputedStyle(node).position !== 'absolute')
            return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: el.id, node: node, x0: e.clientX, y0: e.clientY, scale, dx: 0, dy: 0 };
    };
    const handlePointerMove = (e) => {
        const d = drag.current;
        if (d === null)
            return;
        d.dx = Math.round((e.clientX - d.x0) / d.scale);
        d.dy = Math.round((e.clientY - d.y0) / d.scale);
        // Optimistic: move the drawn node now; the model and the file follow on release.
        d.node.style.translate = `${d.dx}px ${d.dy}px`;
        if (doc !== null)
            measureSelection(doc);
    };
    const handlePointerUp = () => {
        const d = drag.current;
        drag.current = null;
        if (d === null || (d.dx === 0 && d.dy === 0))
            return;
        const state = useCanvasStore.getState();
        const el = state.elements[d.id];
        if (el === undefined)
            return;
        useHistoryStore.getState().beginHistoryTransaction();
        state.moveElement(d.id, el.x + d.dx, el.y + d.dy);
        useHistoryStore
            .getState()
            .endHistoryTransaction({ kind: 'move', elementIds: [d.id] }, useCanvasStore.getState().elements);
    };
    return (_jsxs("div", { className: styles.host, style: { height }, "data-testid": "iframe-canvas", children: [_jsx("iframe", { ref: iframeRef, className: styles.iframe, srcDoc: SHELL, onLoad: handleLoad, title: "Canvas" }), _jsx("div", { className: styles.layer, onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, children: rects.map((r, i) => (_jsx("div", { className: styles.outline, style: { left: r.x, top: r.y, width: r.w, height: r.h } }, i))) })] }));
};

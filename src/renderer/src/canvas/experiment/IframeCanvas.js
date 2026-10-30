import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { generateCode } from '@lib/generateCode';
import { collectExpandedInstances, generateHtml } from '@lib/generateHtml';
import { assemblePageCss, rewriteCssUrls } from '@lib/htmlExportCss';
import { isHtmlNode, setCanvasIframe } from '../canvasDom';
import { selectionOffsetsWithin } from '../textSelectionOffsets';
import { useCanvasTheme } from '../useCanvasTheme';
import { iframeCanvasStats } from './iframeCanvasFlag';
import { morphDom } from './morphDom';
import styles from './IframeCanvas.module.css';
/**
 * Experiment only (option C1): the open page drawn as the HTML export, in a
 * same-origin iframe with the page's real stylesheet, theme.css and fonts.
 * The canvas's interaction layer sits over it and reaches it through
 * `canvasDom`. see docs/plans/canvas-rendering-options.md, "The full test"
 */
const SHELL = '<!doctype html><html><head><meta charset="utf-8" />' +
    '<style data-sheet="viewport"></style><style data-sheet="theme"></style><style data-sheet="page"></style></head>' +
    '<body style="margin: 0; min-height: 100vh"></body></html>';
const FONT_LINK = 'link[data-scamp-font-import]';
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
/**
 * `vh` follows the iframe's height, and the iframe is as tall as the page so
 * the whole page shows. Pinning `vh` to the viewport height keeps a `100vh`
 * hero the height of a window, not of the page. A lossless rewrite of one
 * unit, like the `@media` to `@container` one the canvas does today.
 */
const VH_RE = /(-?\d*\.?\d+)(?:[dsl])?vh\b/g;
const pinViewportUnits = (css) => css.replace(VH_RE, 'calc($1 * var(--scamp-vh))');
export const IframeCanvas = ({ viewportHeight }) => {
    const elements = useCanvasStore((s) => s.elements);
    const rootId = useCanvasStore((s) => s.rootElementId);
    const breakpoints = useCanvasStore((s) => s.breakpoints);
    const customMediaBlocks = useCanvasStore((s) => s.pageCustomMediaBlocks);
    const pageKeyframesBlocks = useCanvasStore((s) => s.pageKeyframesBlocks);
    const componentTrees = useCanvasStore((s) => s.componentTrees);
    const themeCssRaw = useCanvasStore((s) => s.themeCssRaw);
    const projectPath = useCanvasStore((s) => s.projectPath);
    const legacy = useCanvasStore((s) => s.projectFormat === 'legacy');
    const editingElementId = useCanvasStore((s) => s.editingElementId);
    const { themeCssVars } = useCanvasTheme();
    const hostRef = useRef(null);
    const iframeRef = useRef(null);
    const [doc, setDoc] = useState(null);
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
        const pageCss = pinViewportUnits(rewriteCssUrls(assemblePageCss(css, instances), toAsset));
        const body = generateHtml(elements, rootId, { componentTrees, rewriteAssetUrl: toAsset, editorIds: true });
        return { pageCss, body, buildMs: performance.now() - start };
    }, [elements, rootId, breakpoints, customMediaBlocks, pageKeyframesBlocks, componentTrees, toAsset]);
    const themeCss = useMemo(() => pinViewportUnits(rewriteCssUrls(themeCssRaw ?? '', toAsset)), [themeCssRaw, toAsset]);
    useEffect(() => () => setCanvasIframe(null), []);
    const handleLoad = () => {
        const loaded = iframeRef.current?.contentDocument ?? null;
        if (loaded === null)
            return;
        setCanvasIframe(iframeRef.current);
        setDoc(loaded);
    };
    /** As tall as the page, and never shorter than the viewport. */
    const fitHeight = (target) => {
        const host = hostRef.current;
        if (host === null)
            return;
        host.style.height = `${viewportHeight}px`;
        host.style.height = `${Math.max(viewportHeight, target.documentElement.scrollHeight)}px`;
    };
    useLayoutEffect(() => {
        if (doc === null)
            return;
        const start = performance.now();
        const viewport = doc.querySelector('style[data-sheet="viewport"]');
        const vh = `:root { --scamp-vh: ${viewportHeight / 100}px; }`;
        if (viewport !== null && viewport.textContent !== vh)
            viewport.textContent = vh;
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
        fitHeight(doc);
    }, [doc, built, themeCss, viewportHeight]);
    // The active theme's tokens, as the canvas frame carries them today.
    useLayoutEffect(() => {
        if (doc === null)
            return;
        const root = doc.documentElement;
        root.removeAttribute('style');
        for (const [name, value] of Object.entries(themeCssVars))
            root.style.setProperty(name, value);
    }, [doc, themeCssVars]);
    // Project fonts load as <link>s in the app's head; the iframe keeps its own copies in step.
    useEffect(() => {
        if (doc === null)
            return;
        const sync = () => {
            const wanted = new Set(Array.from(document.head.querySelectorAll(FONT_LINK), (l) => l.href));
            for (const link of doc.head.querySelectorAll('link[rel="stylesheet"]')) {
                if (!wanted.has(link.href))
                    link.remove();
                else
                    wanted.delete(link.href);
            }
            for (const href of wanted) {
                const link = doc.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                doc.head.appendChild(link);
            }
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.head, { childList: true });
        return () => observer.disconnect();
    }, [doc]);
    // Images and fonts that finish loading change the page's height.
    useEffect(() => {
        if (doc === null)
            return;
        const observer = new ResizeObserver(() => fitHeight(doc));
        observer.observe(doc.body);
        return () => observer.disconnect();
    }, [doc, viewportHeight]);
    // Text editing, in the iframe: the interaction layer stops taking pointer
    // events while an element edits, so clicks reach the text directly.
    useEffect(() => {
        if (doc === null || editingElementId === null)
            return;
        const node = doc.querySelector(`[data-element-id="${editingElementId}"]`);
        if (!isHtmlNode(node))
            return;
        const before = node.textContent ?? '';
        const view = doc.defaultView;
        const remember = () => {
            const offsets = selectionOffsetsWithin(node, view?.getSelection() ?? null);
            useCanvasStore
                .getState()
                .setTextSelection(offsets === null ? null : { elementId: editingElementId, ...offsets });
        };
        const finish = () => {
            node.removeAttribute('contenteditable');
            const state = useCanvasStore.getState();
            const next = node.textContent ?? '';
            if (next !== before)
                state.setElementText(editingElementId, next);
            state.setEditingElement(null);
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                node.blur();
            }
        };
        node.setAttribute('contenteditable', 'true');
        node.focus();
        const range = doc.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        view?.getSelection()?.removeAllRanges();
        view?.getSelection()?.addRange(range);
        node.addEventListener('blur', finish, { once: true });
        node.addEventListener('keydown', handleKeyDown);
        node.addEventListener('keyup', remember);
        node.addEventListener('pointerup', remember);
        return () => {
            node.removeEventListener('blur', finish);
            node.removeEventListener('keydown', handleKeyDown);
            node.removeEventListener('keyup', remember);
            node.removeEventListener('pointerup', remember);
            node.removeAttribute('contenteditable');
        };
    }, [doc, editingElementId]);
    return (_jsx("div", { ref: hostRef, className: styles.host, style: { height: viewportHeight }, "data-testid": "iframe-canvas", children: _jsx("iframe", { ref: iframeRef, className: styles.iframe, srcDoc: SHELL, onLoad: handleLoad, title: "Canvas" }) }));
};

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useCanvasStore } from '@store/canvasSlice';
import { generateCode } from '@lib/generateCode';
import { collectExpandedInstances, generateHtml } from '@lib/generateHtml';
import { assemblePageCss, rewriteCssUrls } from '@lib/htmlExportCss';
import { mediaForViewport } from '@lib/canvasStylesheet';
import { variantKeyParts } from '@lib/element';

import { useAppTheme } from '../hooks/useAppTheme';
import { animatedSubtreePredicate, layoutEdges } from './animatedExtent';
import { CANVAS_SCROLL_EVENT, isHtmlNode, releaseCanvasIframe, setCanvasIframe } from './canvasDom';
import { selectionOffsetsWithin } from './textSelectionOffsets';
import { useCanvasTheme } from './useCanvasTheme';
import { iframeCanvasStats } from './iframeCanvasFlag';
import { morphDom } from './morphDom';
import styles from './IframeCanvas.module.css';

/**
 * The canvas: the open page drawn as the HTML export, in a same-origin
 * iframe with the page's real stylesheet, theme.css and fonts. The
 * interaction layer sits over it and reaches it through `canvasDom`.
 * see docs/notes/iframe-canvas.md
 */

const SHELL =
  '<!doctype html><html><head><meta charset="utf-8" />' +
  '<style data-sheet="viewport"></style><style data-sheet="theme"></style><style data-sheet="page"></style>' +
  '<style data-sheet="chrome"></style></head>' +
  '<body style="margin: 0; min-height: 100vh"></body></html>';

const FONT_LINK = 'link[data-scamp-font-import]';

const SELECTED_ATTR = 'data-scamp-selected';
const EDITING_ATTR = 'data-scamp-editing';
const PROP_EDIT_ATTR = 'data-scamp-prop-edit';
/** The editor's own attributes on the drawn page, which no capture of it should keep. */
export const EDITOR_MARKS = [SELECTED_ATTR, EDITING_ATTR, PROP_EDIT_ATTR];

/**
 * The editor's marks on the drawn page, as `.element.selected` draws them on
 * today's canvas. Colors come from the app's chrome, which the iframe can't see.
 */
// The iframe is as tall as the page, and today's canvas (a div) never scrolls: content past the edge mustn't add scrollbars.
const NO_SCROLL_CSS = 'html { overflow: hidden !important; }\n';

// A scroll container's scrollbar, quieter than the system's but the same
// width, which is what the preview lays out with. Never in the file.
const scrollbarCss = (muted: string): string =>
  `body * { scrollbar-color: color-mix(in srgb, ${muted} 45%, transparent) transparent; }\n`;

const chromeCss = (accent: string, component: string, muted: string): string =>
  NO_SCROLL_CSS +
  scrollbarCss(muted) +
  `[${SELECTED_ATTR}] { outline: 2px solid ${accent} !important; outline-offset: -2px !important; }\n` +
  `[${SELECTED_ATTR}][data-scamp-instance-id] { outline-color: ${component} !important; }\n` +
  `[${EDITING_ATTR}] { outline: 1px dashed ${accent} !important; outline-offset: 2px !important; cursor: text; }\n` +
  // A selected instance's editable prop texts.
  `[${PROP_EDIT_ATTR}] { outline: 1px dashed ${component} !important; outline-offset: 1px !important; cursor: text; }`;

const PAGE_BODY_STYLE = 'margin: 0; min-height: 100vh';

/** One frame of a variant set. see docs/plans/component-variants-plan.md, phase 6 */
export type IframeVariant = {
  /** The look it draws (`size=large&tone=muted`), or null for the default. */
  key: string | null;
  /** The frame being edited; the others are only looked at. */
  live: boolean;
  /** Sides the frame hugs the component along, rather than taking the artboard's size. */
  hugWidth: boolean;
  hugHeight: boolean;
};

/** The drawn page as a document of its own, without the editor's marks: what a thumbnail shows. */
export const canvasSnapshotHtml = (doc: Document): string => {
  const copy = doc.documentElement.cloneNode(true);
  if (!isHtmlNode(copy)) return '';
  const chrome = copy.querySelector('style[data-sheet="chrome"]');
  if (chrome !== null) chrome.textContent = NO_SCROLL_CSS;
  for (const attr of [...EDITOR_MARKS, 'contenteditable']) {
    for (const node of copy.querySelectorAll(`[${attr}]`)) node.removeAttribute(attr);
  }
  return `<!doctype html>${copy.outerHTML}`;
};

type Props = {
  /** The page's viewport height: what `100vh` means, as the preview's window gives it. */
  viewportHeight: number;
  /** Set for a frame of the component editor's variant set; absent for a page or an artboard. */
  variant?: IframeVariant;
  /**
   * The canvas width, when its content isn't clipped: what runs past it shows,
   * as on today's canvas. The page still lays out at this width.
   */
  overflowWidth?: number;
};

/** How far the drawn nodes reach, in the iframe's own pixels: a root can be 0 tall with what hangs past it. */
const contentExtent = (doc: Document): { w: number; h: number } => {
  const body = doc.body.getBoundingClientRect();
  let w = body.right;
  let h = body.bottom;
  // A running animation is measured where it rests, as the canvas extent does.
  const isAnimated = animatedSubtreePredicate(doc.body);
  for (const node of doc.body.querySelectorAll('[data-scamp-id]')) {
    const r = node.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // A closed menu's panel is there but hidden: the frame hugs what shows.
    if (doc.defaultView?.getComputedStyle(node).visibility === 'hidden') continue;
    const edges = isAnimated(node) && isHtmlNode(node) ? layoutEdges(node, doc.body) : r;
    if (edges === null) continue;
    w = Math.max(w, edges.right);
    h = Math.max(h, edges.bottom);
  }
  return { w: Math.ceil(w), h: Math.ceil(h) };
};

const assetUrlFor =
  (projectPath: string | null, legacy: boolean) =>
  (url: string): string => {
    if (projectPath === null) return url;
    const base = projectPath.replace(/\\/g, '/');
    const asset = (abs: string): string => `scamp-asset://localhost/${encodeURI(abs.replace(/^\/+/, ''))}`;
    if (url.startsWith('./')) return asset(`${base}/${url.slice(2)}`);
    if (!legacy && url.startsWith('/') && !url.startsWith('//')) return asset(`${base}/public${url}`);
    return url;
  };

/**
 * `vh` follows the iframe's height, and the iframe is as tall as the page so
 * the whole page shows. Pinning `vh` to the viewport height keeps a `100vh`
 * hero the height of a window, not of the page. A lossless rewrite of one
 * unit, like the `@media` to `@container` one the canvas does today.
 */
const VH_RE = /(-?\d*\.?\d+)(?:[dsl])?vh\b/g;
// `vw` the same way, for an iframe widened to show what runs past the canvas.
const VW_RE = /(-?\d*\.?\d+)(?:[dsl])?vw\b/g;
const pinViewportUnits = (css: string): string =>
  css.replace(VH_RE, 'calc($1 * var(--scamp-vh))').replace(VW_RE, 'calc($1 * var(--scamp-vw))');

export const IframeCanvas = ({ viewportHeight, variant, overflowWidth }: Props): JSX.Element => {
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
  const selectedElementIds = useCanvasStore((s) => s.selectedElementIds);
  const editingInstanceProp = useCanvasStore((s) => s.editingInstanceProp);
  const appTheme = useAppTheme();
  // A component's frame is its own size, not a viewport; its `@media` follow
  // the breakpoint picked instead, as today's canvas does.
  // Today's canvas-only floor: the root fills the canvas (900px on a page, the
  // artboard in the component editor) and the file never says so. Not in a
  // variant frame, which draws the root at its own size, nor for a component
  // root of fixed height. see elementToStyle.ts
  const canvasMinHeight = useCanvasStore((s) => s.canvasMinHeight);
  const rootKeepsFixedHeight = useCanvasStore(
    (s) => s.activeComponent?.kind === 'component' && s.elements[s.rootElementId]?.heightMode === 'fixed'
  );
  const rootFloor = variant !== undefined || rootKeepsFixedHeight ? null : canvasMinHeight;
  const componentMediaWidth = useCanvasStore((s) =>
    s.activeComponent?.kind === 'component'
      ? s.breakpoints.find((b) => b.id === s.activeBreakpointId)?.width
      : undefined
  );
  // Widened past the canvas to show its overflow: the viewport is no longer
  // the canvas, so `@media` resolve for the canvas width instead.
  const [wide, setWide] = useState(false);
  const mediaWidth = componentMediaWidth ?? (wide ? overflowWidth : undefined);
  const { themeCssVars } = useCanvasTheme();
  const live = variant?.live ?? true;
  const hugWidth = variant?.hugWidth === true;
  const hugHeight = variant?.hugHeight === true;
  const bodyStyle = variant === undefined ? PAGE_BODY_STYLE : `margin: 0;${hugWidth ? ' width: max-content;' : ''}${hugHeight ? '' : ' min-height: 100vh;'}`;

  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const mountedAt = useRef(performance.now());
  const lastBody = useRef<string | null>(null);

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
    const assembled = assemblePageCss(css, instances);
    const sized = mediaWidth === undefined ? assembled : mediaForViewport(assembled, mediaWidth);
    const pageCss = pinViewportUnits(rewriteCssUrls(sized, toAsset));
    const body = generateHtml(elements, rootId, { componentTrees, rewriteAssetUrl: toAsset, editorIds: true });
    return { pageCss, body, buildMs: performance.now() - start };
  }, [elements, rootId, breakpoints, customMediaBlocks, pageKeyframesBlocks, componentTrees, toAsset, mediaWidth]);

  const themeCss = useMemo(() => pinViewportUnits(rewriteCssUrls(themeCssRaw ?? '', toAsset)), [themeCssRaw, toAsset]);

  // Only the editable frame answers the interaction layer's hit tests.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (doc === null || !live || iframe === null) return;
    setCanvasIframe(iframe);
    return () => releaseCanvasIframe(iframe);
  }, [doc, live]);

  const handleLoad = (): void => {
    const loaded = iframeRef.current?.contentDocument ?? null;
    if (loaded === null) return;
    setDoc(loaded);
  };

  /** As tall as the page and never shorter than the viewport; a variant frame hugs the component instead. */
  const fitHeight = (target: Document): void => {
    const host = hostRef.current;
    if (host === null) return;
    if (hugWidth || hugHeight) {
      const reach = contentExtent(target);
      if (hugWidth) host.style.width = `${reach.w}px`;
      if (hugHeight) {
        host.style.height = `${reach.h}px`;
        return;
      }
    } else if (overflowWidth !== undefined) {
      // `scrollWidth` is the cheap test; the drawn nodes are the answer (it counts an
      // animation mid-move, and can't shrink while wide).
      const scrollWidth = target.documentElement.scrollWidth;
      const reach = wide || scrollWidth > overflowWidth + 1 ? contentExtent(target).w : scrollWidth;
      const nextWide = reach > overflowWidth + 1;
      host.style.width = nextWide ? `${reach}px` : '';
      if (nextWide !== wide) setWide(nextWide);
    }
    host.style.height = `${viewportHeight}px`;
    host.style.height = `${Math.max(viewportHeight, target.documentElement.scrollHeight)}px`;
  };

  useLayoutEffect(() => {
    if (doc === null) return;
    const start = performance.now();
    const viewport = doc.querySelector('style[data-sheet="viewport"]');
    const vw = wide && overflowWidth !== undefined ? `${overflowWidth / 100}px` : '1vw';
    const vh =
      `:root { --scamp-vh: ${viewportHeight / 100}px; --scamp-vw: ${vw}; }` +
      (wide && overflowWidth !== undefined ? ` html { width: ${overflowWidth}px; }` : '');
    if (viewport !== null && viewport.textContent !== vh) viewport.textContent = vh;
    const theme = doc.querySelector('style[data-sheet="theme"]');
    const page = doc.querySelector('style[data-sheet="page"]');
    if (theme !== null && theme.textContent !== themeCss) theme.textContent = themeCss;
    if (page !== null && page.textContent !== built.pageCss) page.textContent = built.pageCss;
    // A style-only edit leaves the markup as it was, so there's nothing to patch.
    if (lastBody.current !== built.body + bodyStyle) {
      lastBody.current = built.body + bodyStyle;
      const next = doc.createElement('body');
      next.setAttribute('style', bodyStyle);
      const template = doc.createElement('template');
      template.innerHTML = built.body;
      next.append(template.content);
      morphDom(doc.body, next);
      // A variant draws as an instance with those props would: `data-<axis>` on the root.
      const root = doc.querySelector(`[data-element-id="${CSS.escape(rootId)}"]`);
      for (const { axis, value } of variantKeyParts(variant?.key ?? '') ?? []) root?.setAttribute(`data-${axis}`, value);
    }
    // Inline, as today's canvas sets it, so it wins over the page's own min-height.
    const rootNode = doc.querySelector(`[data-element-id="${CSS.escape(rootId)}"]`);
    if (isHtmlNode(rootNode)) rootNode.style.minHeight = rootFloor === null ? '' : `${rootFloor}px`;
    const patchMs = performance.now() - start;
    if (iframeCanvasStats.firstDrawMs === null) iframeCanvasStats.firstDrawMs = performance.now() - mountedAt.current;
    else iframeCanvasStats.updates.push({ buildMs: built.buildMs, patchMs });
    fitHeight(doc);
  }, [doc, built, themeCss, viewportHeight, bodyStyle, rootId, variant?.key, wide, overflowWidth, rootFloor]);

  // The editor's marks. Runs after the patch above, which drops attributes the markup doesn't have.
  useLayoutEffect(() => {
    if (doc === null) return;
    for (const attr of EDITOR_MARKS) for (const node of doc.querySelectorAll(`[${attr}]`)) node.removeAttribute(attr);
    if (!live) return;
    for (const id of selectedElementIds) {
      const key = CSS.escape(id);
      doc.querySelector(`[data-element-id="${key}"]`)?.setAttribute(SELECTED_ATTR, '');
      for (const prop of doc.querySelectorAll(`[data-scamp-prop][data-scamp-instance-id="${key}"]`)) {
        prop.setAttribute(PROP_EDIT_ATTR, '');
      }
    }
    if (editingElementId !== null) {
      doc.querySelector(`[data-element-id="${CSS.escape(editingElementId)}"]`)?.setAttribute(EDITING_ATTR, '');
    }
  }, [doc, built, bodyStyle, selectedElementIds, editingElementId, live]);

  useLayoutEffect(() => {
    const sheet = doc?.querySelector('style[data-sheet="chrome"]');
    if (sheet === null || sheet === undefined) return;
    const app = getComputedStyle(document.documentElement);
    sheet.textContent = chromeCss(
      app.getPropertyValue('--accent').trim(),
      app.getPropertyValue('--component').trim(),
      app.getPropertyValue('--text-secondary').trim()
    );
  }, [doc, appTheme]);

  // The active theme's tokens, as the canvas frame carries them today.
  useLayoutEffect(() => {
    if (doc === null) return;
    const root = doc.documentElement;
    root.removeAttribute('style');
    for (const [name, value] of Object.entries(themeCssVars)) root.style.setProperty(name, value);
  }, [doc, themeCssVars]);

  // Project fonts load as <link>s in the app's head; the iframe keeps its own copies in step.
  useEffect(() => {
    if (doc === null) return;
    const sync = (): void => {
      const wanted = new Set(Array.from(document.head.querySelectorAll<HTMLLinkElement>(FONT_LINK), (l) => l.href));
      for (const link of doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
        if (!wanted.has(link.href)) link.remove();
        else wanted.delete(link.href);
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

  // The app's shortcuts (undo, delete, copy, …) listen on its own window; a
  // key pressed while the iframe has focus never reaches it. Pass it on,
  // except while something in the page is being typed into.
  useEffect(() => {
    const view = doc?.defaultView;
    const iframe = iframeRef.current;
    if (doc === null || view === null || view === undefined || iframe === null) return;
    const forward = (e: KeyboardEvent): void => {
      const target = e.target;
      if (isHtmlNode(target) && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }
      const copy = new KeyboardEvent(e.type, {
        key: e.key,
        code: e.code,
        location: e.location,
        repeat: e.repeat,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        bubbles: true,
        cancelable: true,
      });
      if (!iframe.dispatchEvent(copy)) e.preventDefault();
    };
    view.addEventListener('keydown', forward);
    view.addEventListener('keyup', forward);
    return () => {
      view.removeEventListener('keydown', forward);
      view.removeEventListener('keyup', forward);
    };
  }, [doc]);

  // A scroll container in the page moved what's inside it: the overlays re-measure.
  useEffect(() => {
    if (doc === null || !live) return;
    const report = (): void => {
      window.dispatchEvent(new Event(CANVAS_SCROLL_EVENT));
    };
    doc.addEventListener('scroll', report, { capture: true, passive: true });
    return () => doc.removeEventListener('scroll', report, { capture: true });
  }, [doc, live]);

  // Images and fonts that finish loading change the page's height.
  useEffect(() => {
    if (doc === null) return;
    const observer = new ResizeObserver(() => fitHeight(doc));
    observer.observe(doc.body);
    return () => observer.disconnect();
  }, [doc, viewportHeight, hugWidth, hugHeight, wide, overflowWidth]);

  // Text editing, in the iframe: the interaction layer stops taking pointer
  // events while an element edits, so clicks reach the text directly.
  useEffect(() => {
    if (doc === null || editingElementId === null || !live) return;
    const node = doc.querySelector(`[data-element-id="${editingElementId}"]`);
    if (!isHtmlNode(node)) return;
    const before = node.textContent ?? '';
    const view = doc.defaultView;
    const remember = (): void => {
      const offsets = selectionOffsetsWithin(node, view?.getSelection() ?? null);
      useCanvasStore
        .getState()
        .setTextSelection(offsets === null ? null : { elementId: editingElementId, ...offsets });
    };
    const finish = (): void => {
      node.removeAttribute('contenteditable');
      const state = useCanvasStore.getState();
      const next = node.textContent ?? '';
      if (next !== before) state.setElementText(editingElementId, next);
      state.setEditingElement(null);
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        node.blur();
      }
    };
    node.setAttribute('contenteditable', 'true');
    // Select it all, as today's canvas does, so typing replaces it.
    node.focus({ preventScroll: true });
    const range = doc.createRange();
    range.selectNodeContents(node);
    view?.getSelection()?.removeAllRanges();
    view?.getSelection()?.addRange(range);
    node.addEventListener('blur', finish, { once: true });
    node.addEventListener('keydown', handleKeyDown);
    node.addEventListener('keyup', remember);
    node.addEventListener('mouseup', remember);
    return () => {
      node.removeEventListener('blur', finish);
      node.removeEventListener('keydown', handleKeyDown);
      node.removeEventListener('keyup', remember);
      node.removeEventListener('mouseup', remember);
      node.removeAttribute('contenteditable');
    };
  }, [doc, editingElementId, live]);

  // An instance's prop text, edited in place: Enter or blur commits it as the
  // instance's override, Escape puts the text back, as on today's canvas.
  useEffect(() => {
    if (doc === null || editingInstanceProp === null || !live) return;
    const { instanceId, propName } = editingInstanceProp;
    const node = doc.querySelector(
      `[data-scamp-instance-id="${CSS.escape(instanceId)}"][data-scamp-prop="${CSS.escape(propName)}"]`
    );
    if (!isHtmlNode(node)) return;
    const before = node.textContent ?? '';
    let done = false;
    const commit = (): void => {
      if (done) return;
      done = true;
      const state = useCanvasStore.getState();
      state.setPropOverride(instanceId, propName, node.textContent ?? '');
      state.setEditingInstanceProp(null);
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done = true;
        node.textContent = before;
        useCanvasStore.getState().setEditingInstanceProp(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    };
    node.setAttribute('contenteditable', 'true');
    node.setAttribute('spellcheck', 'false');
    // Select it all, as today's canvas does, so typing replaces it.
    node.focus({ preventScroll: true });
    const range = doc.createRange();
    range.selectNodeContents(node);
    doc.defaultView?.getSelection()?.removeAllRanges();
    doc.defaultView?.getSelection()?.addRange(range);
    node.addEventListener('blur', commit);
    node.addEventListener('keydown', handleKeyDown);
    return () => {
      node.removeEventListener('blur', commit);
      node.removeEventListener('keydown', handleKeyDown);
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
    };
  }, [doc, editingInstanceProp, live]);

  return (
    <div ref={hostRef} className={styles.host} style={{ height: viewportHeight }} data-testid="iframe-canvas">
      <iframe ref={iframeRef} className={styles.iframe} srcDoc={SHELL} onLoad={handleLoad} title="Canvas" />
    </div>
  );
};

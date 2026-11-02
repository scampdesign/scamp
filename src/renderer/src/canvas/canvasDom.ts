/**
 * The one way canvas code reaches the drawn page. Today's canvas draws into
 * the app's own document; the iframe experiment draws into an iframe's, and
 * registers it here. The canvas's chrome (handles, outlines, drop lines)
 * always stays in the app's document.
 * see docs/plans/canvas-rendering-options.md, "The full test"
 *
 * Nodes from the iframe belong to its own window, so `instanceof HTMLElement`
 * is false for them. Use `isHtmlNode` instead.
 */

let liveIframe: HTMLIFrameElement | null = null;

/**
 * Called by the iframe that draws the editable page: the page's, or the live
 * frame of a variant set. The set's other frames are only looked at.
 */
export const setCanvasIframe = (iframe: HTMLIFrameElement): void => {
  liveIframe = iframe;
};

/** Called when `iframe` stops being the live one; a no-op if another took over. */
export const releaseCanvasIframe = (iframe: HTMLIFrameElement | null): void => {
  if (liveIframe === iframe) liveIframe = null;
};

const iframeDocument = (): Document | null => liveIframe?.contentDocument ?? null;

/** An element node with `dataset` and offsets, from either document. */
export const isHtmlNode = (node: unknown): node is HTMLElement =>
  typeof node === 'object' &&
  node !== null &&
  (node as Node).nodeType === 1 &&
  'dataset' in node &&
  'offsetWidth' in node;

/** An element node with `dataset`, HTML or SVG, from either document. */
export const hasDataset = (node: unknown): node is HTMLElement | SVGElement =>
  typeof node === 'object' && node !== null && (node as Node).nodeType === 1 && 'dataset' in node;

/** The nodes in `iframe` under a client point, topmost first; none outside it. */
export const framedElementsFromPoint = (iframe: HTMLIFrameElement, clientX: number, clientY: number): Element[] => {
  const doc = iframe.contentDocument;
  if (doc === null) return [];
  const rect = iframe.getBoundingClientRect();
  const scale = iframe.offsetWidth > 0 ? rect.width / iframe.offsetWidth : 1;
  const x = (clientX - rect.left) / scale;
  const y = (clientY - rect.top) / scale;
  if (x < 0 || y < 0 || x > iframe.offsetWidth || y > iframe.offsetHeight) return [];
  return doc.elementsFromPoint(x, y);
};

/** A node's box in the app window's client space, from either document. */
export const clientRectOf = (node: Element): Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'> => {
  const r = node.getBoundingClientRect();
  const iframe = node.ownerDocument.defaultView?.frameElement ?? null;
  if (!isHtmlNode(iframe)) return r;
  const outer = iframe.getBoundingClientRect();
  const scale = iframe.offsetWidth > 0 ? outer.width / iframe.offsetWidth : 1;
  return {
    left: outer.left + r.left * scale,
    top: outer.top + r.top * scale,
    right: outer.left + r.right * scale,
    bottom: outer.top + r.bottom * scale,
    width: r.width * scale,
    height: r.height * scale,
  };
};

/**
 * A node's layout offset from `frame`, in logical px: transforms (the zoom,
 * an element's own) don't count. From an iframe, the chain ends at its body
 * and carries on from the iframe, which can sit anywhere in the frame.
 */
export const offsetIn = (node: HTMLElement, frame: HTMLElement): { x: number; y: number } => {
  let x = 0;
  let y = 0;
  let current: Element | null = node;
  while (isHtmlNode(current) && current !== frame) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent ?? current.ownerDocument.defaultView?.frameElement ?? null;
  }
  return { x, y };
};

/** The page's nodes under a client point, topmost first. */
export const canvasElementsFromPoint = (clientX: number, clientY: number): Element[] => {
  const doc = iframeDocument();
  if (liveIframe === null || doc === null) return document.elementsFromPoint(clientX, clientY);
  const hits = framedElementsFromPoint(liveIframe, clientX, clientY);
  if (hits.length === 0) return hits;
  // The whole drawn page is the root's to draw into, as the canvas's floor
  // makes it today; a view's root itself is only as tall as its content.
  const root = doc.querySelector('[data-element-id="root"]');
  if (root !== null && !hits.includes(root)) {
    const at = hits.findIndex((node) => node === doc.body || node === doc.documentElement);
    hits.splice(at === -1 ? hits.length : at, 0, root);
  }
  return hits;
};

/** The first node matching `selector` in the page: in `scope` today, in the iframe when it draws. */
export const canvasQuery = (scope: ParentNode | null, selector: string): Element | null =>
  (iframeDocument() ?? scope)?.querySelector(selector) ?? null;

/** Every node matching `selector` in the page. */
export const canvasQueryAll = (scope: ParentNode | null, selector: string): Element[] =>
  Array.from((iframeDocument() ?? scope)?.querySelectorAll(selector) ?? []);

/** The window whose selection holds text being edited on the canvas. */
export const canvasWindow = (): Window => liveIframe?.contentWindow ?? window;

/** The node that draws a page element, HTML or SVG, in whichever document draws the page. */
export const canvasElementById = (elementId: string): Element | null =>
  canvasQuery(document.querySelector('[data-testid="canvas-frame"]'), `[data-element-id="${CSS.escape(elementId)}"]`);

/** The HTML node that draws a page element; null for an SVG one. */
export const canvasNodeById = (elementId: string): HTMLElement | null => {
  const node = canvasElementById(elementId);
  return isHtmlNode(node) ? node : null;
};

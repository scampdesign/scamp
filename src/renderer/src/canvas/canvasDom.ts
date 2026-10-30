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

/** Called by the iframe canvas when it mounts and unmounts. */
export const setCanvasIframe = (iframe: HTMLIFrameElement | null): void => {
  liveIframe = iframe;
};

const iframeDocument = (): Document | null => liveIframe?.contentDocument ?? null;

/** True when the page draws into an iframe. */
export const canvasInIframe = (): boolean => iframeDocument() !== null;

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

/** The page's nodes under a client point, topmost first. */
export const canvasElementsFromPoint = (clientX: number, clientY: number): Element[] => {
  const doc = iframeDocument();
  if (liveIframe === null || doc === null) return document.elementsFromPoint(clientX, clientY);
  const rect = liveIframe.getBoundingClientRect();
  const scale = liveIframe.offsetWidth > 0 ? rect.width / liveIframe.offsetWidth : 1;
  const x = (clientX - rect.left) / scale;
  const y = (clientY - rect.top) / scale;
  if (x < 0 || y < 0 || x > liveIframe.offsetWidth || y > liveIframe.offsetHeight) return [];
  const hits = doc.elementsFromPoint(x, y);
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

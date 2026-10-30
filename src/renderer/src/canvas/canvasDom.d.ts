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
/** Called by the iframe canvas when it mounts and unmounts. */
export declare const setCanvasIframe: (iframe: HTMLIFrameElement | null) => void;
/** True when the page draws into an iframe. */
export declare const canvasInIframe: () => boolean;
/** An element node with `dataset` and offsets, from either document. */
export declare const isHtmlNode: (node: unknown) => node is HTMLElement;
/** An element node with `dataset`, HTML or SVG, from either document. */
export declare const hasDataset: (node: unknown) => node is HTMLElement | SVGElement;
/** The page's nodes under a client point, topmost first. */
export declare const canvasElementsFromPoint: (clientX: number, clientY: number) => Element[];
/** The first node matching `selector` in the page: in `scope` today, in the iframe when it draws. */
export declare const canvasQuery: (scope: ParentNode | null, selector: string) => Element | null;
/** Every node matching `selector` in the page. */
export declare const canvasQueryAll: (scope: ParentNode | null, selector: string) => Element[];
/** The window whose selection holds text being edited on the canvas. */
export declare const canvasWindow: () => Window;
/** The node that draws a page element, HTML or SVG, in whichever document draws the page. */
export declare const canvasElementById: (elementId: string) => Element | null;
/** The HTML node that draws a page element; null for an SVG one. */
export declare const canvasNodeById: (elementId: string) => HTMLElement | null;

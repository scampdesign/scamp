/**
 * The one way canvas code reaches the drawn page. The canvas draws into an
 * iframe's document, which registers here; the legacy fallback draws into
 * the app's own. The canvas's chrome (handles, outlines, drop lines)
 * always stays in the app's document.
 * see docs/notes/iframe-canvas.md
 *
 * Nodes from the iframe belong to its own window, so `instanceof HTMLElement`
 * is false for them. Use `isHtmlNode` instead.
 */
/**
 * Called by the iframe that draws the editable page: the page's, or the live
 * frame of a variant set. The set's other frames are only looked at.
 */
export declare const setCanvasIframe: (iframe: HTMLIFrameElement) => void;
/** Called when `iframe` stops being the live one; a no-op if another took over. */
export declare const releaseCanvasIframe: (iframe: HTMLIFrameElement | null) => void;
/** An element node with `dataset` and offsets, from either document. */
export declare const isHtmlNode: (node: unknown) => node is HTMLElement;
/** An element node with `dataset`, HTML or SVG, from either document. */
export declare const hasDataset: (node: unknown) => node is HTMLElement | SVGElement;
/** The nodes in `iframe` under a client point, topmost first; none outside it. */
export declare const framedElementsFromPoint: (iframe: HTMLIFrameElement, clientX: number, clientY: number) => Element[];
/** A node's box in the app window's client space, from either document. */
export declare const clientRectOf: (node: Element) => Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;
/**
 * A node's layout offset from `frame`, in logical px: transforms (the zoom,
 * an element's own) don't count. From an iframe, the chain ends at its body
 * and carries on from the iframe, which can sit anywhere in the frame.
 */
export declare const offsetIn: (node: HTMLElement, frame: HTMLElement) => {
    x: number;
    y: number;
};
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

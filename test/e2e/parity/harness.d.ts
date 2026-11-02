import { type Browser, type Page } from '@playwright/test';
export type Box = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export type Geometry = Record<string, Box>;
/**
 * Measure every Scamp element in the document, relative to the page root
 * and normalised out of any canvas zoom.
 *
 * Elements are keyed by their Scamp class name, which both sides carry:
 * the canvas puts it on `data-scamp-id`, the exporter emits it as `class`.
 *
 * Runs inside the page, so it must be self-contained.
 */
export declare const MEASURE_SCRIPT = "(() => {\n  // Inside a component instance the element names are the COMPONENT's, so\n  // a page root and a component root are both \"root\". Qualify by the\n  // owning instance so the two don't collide \u2014 and so both sides key the\n  // same way, since the browser document marks instances the same way.\n  // A prop text carries the attribute too, for the canvas's hit test; it isn't an instance.\n  const instanceOf = (el) => {\n    const host = el.closest('[data-scamp-instance-id]:not([data-scamp-prop])');\n    return host ? host.getAttribute('data-scamp-instance-id') : null;\n  };\n  const read = (el) => {\n    const own = el.getAttribute('data-scamp-id') || el.className;\n    if (typeof own !== 'string') return own;\n    const inst = instanceOf(el);\n    return inst ? inst + '/' + own : own;\n  };\n  // The iframe canvas experiment draws the page in a document of its own;\n  // the oracle's plain document has no such iframe.\n  const canvasIframe = document.querySelector('[data-testid=\"iframe-canvas\"] iframe');\n  const doc = (canvasIframe && canvasIframe.contentDocument) || document;\n  const nodes = Array.from(\n    doc.querySelectorAll('[data-scamp-id], [class]')\n  ).filter((el) => {\n    const key = read(el);\n    return typeof key === 'string' && key.length > 0;\n  });\n  const root = nodes.find((el) => read(el) === 'root');\n  if (!root) return null;\n  const rootRect = root.getBoundingClientRect();\n  // The canvas renders inside a transformed frame. offsetWidth is the\n  // pre-transform layout width, so their ratio is the zoom factor; in a\n  // plain document it is 1.\n  const scale = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;\n  const out = {};\n  for (const el of nodes) {\n    const key = read(el);\n    if (typeof key !== 'string') continue;\n    // Only Scamp's own classes; ignore app chrome and helper wrappers.\n    if (!/^[a-z][a-z0-9_]*([/][a-z][a-z0-9_]*)?$/i.test(key)) continue;\n    if (out[key]) continue;\n    const r = el.getBoundingClientRect();\n    out[key] = {\n      x: (r.left - rootRect.left) / scale,\n      y: (r.top - rootRect.top) / scale,\n      w: r.width / scale,\n      h: r.height / scale,\n    };\n  }\n  return out;\n})()";
export declare const measure: (page: Page) => Promise<Geometry>;
export declare const launchTruthBrowser: () => Promise<Browser>;
/**
 * Render a fixture's markup the way a browser would, and measure it.
 *
 * `viewport` must match the width the canvas root actually got, since
 * layout depends on it — a different width is a different (valid) layout,
 * not a divergence.
 */
export declare const measureInBrowser: (browser: Browser, source: {
    html: string;
    css: string;
    themeCss: string;
}, viewport: {
    width: number;
    height: number;
}) => Promise<Geometry>;
export type Divergence = {
    element: string;
    field: keyof Box;
    canvas: number;
    browser: number;
    delta: number;
};
/**
 * Compare two geometries. Sub-pixel differences are noise — anything at or
 * above `tolerance` is a real layout difference a user could see.
 */
export declare const compareGeometry: (canvas: Geometry, browser: Geometry, tolerance?: number) => Divergence[];
/** Human-readable failure text — the numbers are the whole point. */
export declare const describeDivergences: (divergences: ReadonlyArray<Divergence>) => string;
/**
 * ---------------------------------------------------------------------------
 * Pixel comparison
 * ---------------------------------------------------------------------------
 *
 * Geometry says the boxes are in the right places; it says nothing about
 * what is painted in them. Colour, gradients, shadows, radii and blend
 * modes all produce identical geometry — the gradient bug in
 * canvas-gradient-backgrounds.md would have passed the geometry harness
 * without a murmur.
 *
 * Two things make a naive pixel diff useless here, so neither is attempted:
 *
 *  - the canvas renders inside a transformed frame, so its screenshot is at
 *    the zoom factor while the browser's is at 1
 *  - Electron's Chromium and the standalone build resolve `system-ui`
 *    differently, so any text differs by a few pixels
 *
 * Both are handled by normalising the two images to the same modest size
 * and comparing with a per-channel tolerance. That is deliberately blunt:
 * it answers "is this block the wrong colour / is this gradient missing"
 * and not "is this edge antialiased identically", which is the question
 * worth asking of a design tool.
 */
export type PixelDiff = {
    /** Fraction of compared pixels that differ beyond the tolerance, 0..1. */
    differingFraction: number;
    /** Largest single-channel difference seen, 0..255. */
    maxChannelDelta: number;
};
/**
 * Compare two PNG screenshots inside a browser page, which avoids adding a
 * PNG decoder dependency — the browser already has one.
 */
export declare const comparePixels: (page: Page, canvasPng: Buffer, browserPng: Buffer) => Promise<PixelDiff>;
/**
 * Render a fixture in the browser and screenshot its page root, leaving the
 * page open so the caller can also use it to run the comparison.
 */
export declare const screenshotInBrowser: (browser: Browser, source: {
    html: string;
    css: string;
    themeCss: string;
}, viewport: {
    width: number;
    height: number;
}) => Promise<{
    png: Buffer;
    page: Page;
}>;
/**
 * Hide everything the browser has no counterpart for, before a paint
 * comparison.
 *
 * `locator.screenshot()` captures whatever is painted over the element's
 * box, so the canvas toolbar and the shortcuts panel landed in the first
 * capture and accounted for the entire difference. Rather than enumerate
 * app chrome — which changes — hide all of it and re-show only the frame,
 * then take out the canvas-only affordances that live *inside* the frame
 * and legitimately have no browser equivalent.
 */
export declare const hideCanvasChrome: (page: Page) => Promise<void>;
/**
 * ---------------------------------------------------------------------------
 * Computed-style comparison
 * ---------------------------------------------------------------------------
 *
 * Typography is invisible to both other modes. It produces no geometry of
 * its own, and pixel comparison is unreliable for text because the two
 * Chromium builds resolve `system-ui` differently — an intrinsic text
 * width already differed by 3.2px once and cost a false alarm.
 *
 * Computed values sidestep both. `getComputedStyle` reports `font-family`
 * as the specified stack rather than the matched font, sizes in px, and
 * colours as `rgb(...)`, so the comparison is about whether the rule
 * applied — which is the actual question for a peel — and not about how
 * glyphs were rasterised.
 */
export type ComputedStyles = Record<string, Record<string, string>>;
export declare const COMPUTED_SCRIPT: (props: ReadonlyArray<string>) => string;
export declare const measureComputed: (page: Page, props: ReadonlyArray<string>) => Promise<ComputedStyles>;
export type ComputedDivergence = {
    element: string;
    property: string;
    canvas: string;
    browser: string;
};
export declare const compareComputed: (canvas: ComputedStyles, browser: ComputedStyles) => ComputedDivergence[];
export declare const describeComputed: (divergences: ReadonlyArray<ComputedDivergence>) => string;
/** Render a fixture in a browser and read its computed styles. */
export declare const computedInBrowser: (browser: Browser, source: {
    html: string;
    css: string;
    themeCss: string;
}, viewport: {
    width: number;
    height: number;
}, props: ReadonlyArray<string>) => Promise<ComputedStyles>;
/**
 * A `scamp dev` server on a project folder, for the framework side of the
 * parity comparison. Spawns the binary the app itself would spawn, from
 * the repo's devDependency, and waits for the readiness line CONTRACT.md
 * fixes. The oracle still imports nothing from `src/`.
 */
export type FrameworkServer = {
    url: string;
    close: () => Promise<void>;
};
export declare const startFrameworkServer: (projectDir: string) => Promise<FrameworkServer>;
/** Measure a served page instead of hand-written HTML. */
export declare const measureUrlInBrowser: (browser: Browser, url: string, viewport: {
    width: number;
    height: number;
}) => Promise<Geometry>;

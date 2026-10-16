import { toPng, toSvg } from 'html-to-image';

import { buildFontEmbedCss } from './embedFonts';
import elementStyles from '../canvas/ElementRenderer.module.css';

/**
 * Inputs for a single capture. The caller resolves the right DOM
 * node beforehand: the canvas frame for page exports, the element
 * node (located via `[data-element-id="…"]`) for element exports.
 */
export type CaptureInputs = {
  node: HTMLElement;
  /** CSS background to paint behind the capture. `null` keeps the
   *  source-element's transparency (typical for PNG element exports). */
  backgroundColor: string | null;
  /** Intrinsic dimensions in CSS px (1× scale). */
  width: number;
  height: number;
};

/**
 * Skip nodes that are part of the editor chrome. The marker
 * `data-canvas-chrome="true"` lives on the `CanvasInteractionLayer`
 * root; descendants (selection overlay, grid overlay, drop indicators,
 * link indicators) inherit by DOM ancestry. We walk up
 * `parentElement` looking for the attribute so a future chrome
 * subtree only needs the marker on its root.
 */
const isChromeNode = (node: Node): boolean => {
  // `html-to-image` calls the filter with every node, including text
  // and other non-element nodes. Only Element nodes can carry the
  // attribute.
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === 1) {
      const el = current as Element;
      if (el.getAttribute && el.getAttribute('data-canvas-chrome') === 'true') {
        return true;
      }
    }
    current = current.parentNode;
  }
  return false;
};

/**
 * The blue selection outline is painted on the element itself via
 * the `.selected` CSS-module class (see
 * `ElementRenderer.module.css` — `outline: 2px solid var(--accent)`).
 * `data-canvas-chrome` filters the canvas interaction layer but
 * can't strip a class from the element being captured. So for the
 * duration of the capture we remove that class from every element
 * in the subtree, then restore it afterwards.
 *
 * Same pattern is used for the dashed `textEditing` outline (in
 * case a user fires an export mid-edit) and the dashed
 * `propEditAffordance` outline that marks editable prop-text on a
 * selected component instance.
 */
const withChromeClassesHidden = async <T>(
  node: HTMLElement,
  fn: () => Promise<T>
): Promise<T> => {
  const chromeClassNames = [
    elementStyles.selected,
    elementStyles.textEditing,
    elementStyles.propEditAffordance,
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  if (chromeClassNames.length === 0) return fn();

  // Capture every element in the subtree (including the root) that
  // currently carries any chrome class, and the specific classes
  // that need restoring. We snapshot only the classes we strip so
  // restoration doesn't clobber any class added between strip and
  // restore (rare, but cheap insurance).
  const restorations: Array<{ el: Element; classes: string[] }> = [];
  const candidates: Element[] = [node, ...node.querySelectorAll('*')];
  for (const el of candidates) {
    const stripped: string[] = [];
    for (const cls of chromeClassNames) {
      if (el.classList.contains(cls)) {
        el.classList.remove(cls);
        stripped.push(cls);
      }
    }
    if (stripped.length > 0) restorations.push({ el, classes: stripped });
  }

  try {
    return await fn();
  } finally {
    for (const { el, classes } of restorations) {
      el.classList.add(...classes);
    }
  }
};

/**
 * `html-to-image` reads each captured element's *applied* transform,
 * so a frame with `transform: scale(0.5)` produces a half-size
 * capture even at `pixelRatio: 1`. The fix: temporarily reset the
 * transform-bearing ancestor's transform to `none` for the duration
 * of the capture, then restore.
 */
const withTransformReset = async <T>(
  node: HTMLElement,
  fn: () => Promise<T>
): Promise<T> => {
  // Walk up looking for the canvas frame, which is the only element
  // we apply `transform: scale(...)` to. Identified by data-testid.
  let target: HTMLElement | null = node;
  while (target && target.getAttribute('data-testid') !== 'canvas-frame') {
    target = target.parentElement;
  }
  if (!target) {
    return fn();
  }
  const original = target.style.transform;
  target.style.transform = 'none';
  try {
    return await fn();
  } finally {
    target.style.transform = original;
  }
};

/**
 * Styles laid over the root of every capture. `html-to-image` copies the
 * node's computed styles onto its root, so an element placed on the page
 * (`position: absolute; inset: 40px …`, a margin, a translate) carried
 * that placement into the image: it drew offset, and squeezed by the far
 * inset, which read as lost padding and broken type. The image's origin
 * is the element's own top-left. see docs/notes/export-element-position.md
 */
const CAPTURE_ROOT_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'static',
  inset: 'auto',
  margin: '0',
  translate: 'none',
};

/**
 * The webfonts on a node, inlined for the capture. A capture renders in an
 * SVG image that can't fetch, and html-to-image's own font walk can't read
 * a cross-origin sheet (Adobe Fonts, Google Fonts), so the text fell back
 * in an export just as it once did in thumbnails. see docs/notes/project-thumbnails.md
 */
const fontOptions = async (node: HTMLElement): Promise<{ fontEmbedCSS: string } | { skipFonts: true }> => {
  const css = await buildFontEmbedCss(node);
  return css.length > 0 ? { fontEmbedCSS: css } : { skipFonts: true };
};

/**
 * Capture a PNG data URL. PNG is rasterised via foreignObject so the
 * output exactly matches what the user sees on the canvas.
 *
 * `pixelRatio` lets us render at 2× / 3× the intrinsic size for
 * crisp images; the resulting data URL decodes to a buffer of
 * `width × scale` × `height × scale` px.
 */
export const capturePng = async (
  inputs: CaptureInputs & { scale: 1 | 2 | 3 }
): Promise<string> => {
  const fonts = await fontOptions(inputs.node);
  return withTransformReset(inputs.node, () =>
    withChromeClassesHidden(inputs.node, () =>
      toPng(inputs.node, {
        width: inputs.width,
        height: inputs.height,
        style: CAPTURE_ROOT_STYLE,
        pixelRatio: inputs.scale,
        cacheBust: true,
        ...fonts,
        filter: (n) => !isChromeNode(n),
        ...(inputs.backgroundColor !== null
          ? { backgroundColor: inputs.backgroundColor }
          : {}),
      })
    )
  );
};

/**
 * Capture without touching the live canvas.
 *
 * `capturePng` above mutates the real DOM for the duration of the shot —
 * it resets the frame's `transform` and strips selection classes. That is
 * fine for an export the user asked for and waits on. It is not fine for
 * an automatic capture on every save: `Viewport.measureFrame` recovers the
 * applied zoom from `getBoundingClientRect().width / offsetWidth`, so
 * blanking the transform makes the canvas visibly jump to 100% and back on
 * every edit.
 *
 * So: clone the frame, fix the clone up off-screen, and rasterise that.
 * The clone keeps `data-scamp-canvas` and the frame's inline theme
 * custom properties, so the injected `@scope`d page stylesheet and every
 * `var(--…)` still resolve exactly as they do on the real canvas.
 *
 * Returns null when the frame has no size — normal during teardown.
 * see docs/notes/project-thumbnails.md
 */
export const captureIsolatedPng = async (inputs: {
  node: HTMLElement;
  backgroundColor: string | null;
}): Promise<string | null> => {
  const width = inputs.node.offsetWidth;
  const height = inputs.node.offsetHeight;
  if (width === 0 || height === 0) return null;

  // The off-screen placement goes on a WRAPPER, never on the captured node
  // itself. `html-to-image` serialises the node with its own inline styles
  // into a foreignObject, so a node carrying `position: fixed; left:
  // -100000px` renders itself straight out of the capture viewport and the
  // result is a blank image. Measured, not guessed: an offscreen-fixed
  // node captures 0 content pixels, the same node inside an
  // offscreen-fixed wrapper captures all of them.
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;top:0;left:-100000px;pointer-events:none;';
  host.style.width = `${width}px`;

  const clone = inputs.node.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.position = 'static';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  // Editor chrome painted as a class on the element itself, stripped from
  // the copy rather than from what the user is looking at.
  for (const cls of [
    elementStyles.selected,
    elementStyles.textEditing,
    elementStyles.propEditAffordance,
  ]) {
    if (typeof cls !== 'string' || cls.length === 0) continue;
    if (clone.classList.contains(cls)) clone.classList.remove(cls);
    for (const el of clone.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
  }

  // Strip the attributes other code finds the canvas and its elements by.
  // A second node answering to `[data-testid="canvas-frame"]` or to any
  // `[data-element-id]` is a live hazard: the size readout, the export
  // helper and the boundary measurement all resolve elements by query, and
  // this copy sits at left:-100000px. `data-scamp-canvas` stays — it is
  // the `@scope` root the page stylesheet needs to apply at all.
  clone.removeAttribute('data-testid');
  clone.removeAttribute('data-element-id');
  for (const el of clone.querySelectorAll('[data-element-id], [data-testid]')) {
    el.removeAttribute('data-element-id');
    el.removeAttribute('data-testid');
  }

  host.appendChild(clone);
  document.body.appendChild(host);
  // After the clone is in the document: the families in use are read
  // from its computed styles, which need the page stylesheet to apply.
  const fontEmbedCss = await buildFontEmbedCss(clone);
  try {
    return await toPng(clone, {
      width,
      height,
      pixelRatio: 1,
      // No cache-busting: this runs on a timer, not on demand, and
      // re-fetching every image on every capture is pure waste.
      cacheBust: false,
      // A capture rasterises inside an `<img src="data:image/svg+xml,…">`,
      // which cannot fetch: a webfont the page loads over the network is
      // unavailable there and the text falls back, so every thumbnail of
      // a design that uses one came out in the wrong typeface.
      //
      // `skipFonts` is still right about html-to-image's own walk — it
      // reads `cssRules` on every sheet and logs a DOMException for each
      // cross-origin one. `fontEmbedCSS` replaces that walk rather than
      // re-enabling it: the sheets it cannot READ are FETCHED by href,
      // and only the families actually on the node are inlined. Empty
      // when the design is on system fonts, and then nothing is fetched
      // at all. see docs/notes/project-thumbnails.md
      ...(fontEmbedCss.length > 0 ? { fontEmbedCSS: fontEmbedCss } : { skipFonts: true }),
      filter: (n) => !isChromeNode(n),
      ...(inputs.backgroundColor !== null
        ? { backgroundColor: inputs.backgroundColor }
        : {}),
    });
  } finally {
    host.remove();
  }
};

/**
 * Capture an SVG string. Resolution-independent — no `pixelRatio`.
 * Some complex CSS effects (filters, blend modes) may not be fully
 * captured; the panel surfaces a one-line warning to set
 * expectations.
 *
 * `html-to-image`'s `toSvg` returns a `data:image/svg+xml;…` URL
 * rather than raw XML. We decode the URL so the file written to
 * disk is real SVG that browsers and downstream tools can read.
 */
export const captureSvg = async (inputs: CaptureInputs): Promise<string> => {
  const fonts = await fontOptions(inputs.node);
  const dataUrl = await withTransformReset(inputs.node, () =>
    withChromeClassesHidden(inputs.node, () =>
      toSvg(inputs.node, {
        width: inputs.width,
        height: inputs.height,
        style: CAPTURE_ROOT_STYLE,
        cacheBust: true,
        ...fonts,
        filter: (n) => !isChromeNode(n),
        ...(inputs.backgroundColor !== null
          ? { backgroundColor: inputs.backgroundColor }
          : {}),
      })
    )
  );
  return decodeSvgDataUrl(dataUrl);
};

/**
 * Decode a `data:image/svg+xml;charset=utf-8,<encoded>` URL into
 * raw SVG XML. `html-to-image` URI-encodes the body, so the inverse
 * is a single `decodeURIComponent`. Tolerant of an upstream change
 * to base64 encoding: if the URL announces base64, decode that path.
 */
const decodeSvgDataUrl = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl;
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    // Browser environment — `atob` is available.
    return atob(body);
  }
  return decodeURIComponent(body);
};

// ---- Pure helpers (testable without DOM) ----------------------------

/**
 * Slugify an export filename. The user can rename in the save dialog;
 * this is just a sane default. Strips path separators and other
 * filename-hostile characters.
 */
export const sanitizeExportFilename = (raw: string): string =>
  raw.replace(/[\\/:*?"<>|]+/g, '').trim() || 'export';

/**
 * Suggest a filename based on the export scope.
 *   - Page scope → the page name (`home`, `about`).
 *   - Element scope → the element's class name (`rect_a1b2`,
 *     `hero-card_a1b2`).
 *
 * The caller passes the resolved name; this helper just sanitises it.
 */
export const suggestExportFilename = (name: string): string =>
  sanitizeExportFilename(name);

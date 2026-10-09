/**
 * The page's own CSS, injected into the canvas.
 *
 * The canvas has always re-derived styles from the element model into
 * inline styles, which means every property is a chance to translate
 * wrongly — and some CSS has no inline form at all, so it never rendered:
 * `::before` / `::after`, `:nth-child`, and any hand-written selector.
 *
 * Rather than teach the translator more tricks, the canvas now also loads
 * the exact stylesheet the generator writes to disk. Inline styles still
 * win on the properties they set, so this is additive: it supplies only
 * what the translation could never express. Later phases move properties
 * out of the inline layer and let these rules take over.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */

/** Attribute marking the canvas frame, used as the `@scope` root. */
export const CANVAS_SCOPE_ATTR = 'data-scamp-canvas';

/** The selector the page's rules are scoped to. */
export const CANVAS_SCOPE_SELECTOR = `[${CANVAS_SCOPE_ATTR}]`;

/**
 * At-rules removed before the sheet is scoped into the canvas.
 *
 * `@keyframes` — the canvas injects these separately (`CanvasKeyframes`),
 * and a non-style at-rule inside `@scope` has no defined meaning; a
 * browser that rejects it could drop the whole scoped block and take
 * every page rule with it.
 *
 * `@media` is NOT stripped — it is rewritten to `@container`, see below.
 * see docs/notes/canvas-injected-stylesheet.md
 */
const STRIPPED_AT_RULE = /@(?:-[a-z]+-)?keyframes\b/iy;

export const stripStrippedAtRules = (css: string): string => {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const match = STRIPPED_AT_RULE;
    match.lastIndex = i;
    if (!match.test(css)) {
      out += css[i] ?? '';
      i += 1;
      continue;
    }
    // Skip to the block's opening brace, then past its matching close.
    let j = css.indexOf('{', i);
    if (j === -1) break;
    let depth = 0;
    for (; j < css.length; j += 1) {
      const c = css[j] ?? '';
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    i = j;
  }
  return out;
};

/**
 * Wrap a page's CSS so it applies only inside the canvas frame.
 *
 * `@scope` rather than a descendant prefix (`#canvas .rect_a1b2`) because
 * a prefix changes specificity, and a rule that outranks its counterpart
 * in the preview is a new way to diverge. Note `@scope` is not entirely
 * cascade-neutral either — scope proximity is considered before source
 * order, so a scoped rule beats an unscoped one of equal specificity
 * regardless of position. That only matters for rules outside this sheet
 * targeting the same page classes, which nothing does.
 *
 * Returns an empty string when there's nothing to inject, so callers can
 * skip mounting a `<style>` at all.
 */

/**
 * Width features a container query can express. Everything else — colour
 * scheme, resolution, print — is a property of the real device and should
 * keep following the window, so those `@media` blocks are left alone.
 */
const WIDTH_FEATURES = new Set(['width', 'min-width', 'max-width']);

/** True when every feature in a media prelude is width-based. */
export const isWidthOnlyQuery = (prelude: string): boolean => {
  const features = [...prelude.matchAll(/\(\s*([a-z-]+)\s*:/gi)].map((m) =>
    (m[1] ?? '').toLowerCase()
  );
  if (features.length === 0) return false;
  return features.every((f) => WIDTH_FEATURES.has(f));
};

/**
 * Rewrite width-based `@media` blocks as `@container` queries.
 *
 * A media query is evaluated against the DOCUMENT viewport — the Electron
 * window — while Scamp's breakpoints size the canvas frame. Left as-is,
 * mobile rules fire on a desktop artboard whenever the app window happens
 * to be narrow, and never fire on a mobile artboard in a maximised window.
 *
 * The frame declares `container-type: inline-size`, so the identical
 * conditions evaluated as container queries resolve against the artboard
 * — which is what the preview's viewport means for the design.
 *
 * This is a translation, and worth being honest about that. It is one
 * lossless rewrite of a prelude across the whole sheet, not a re-derivation
 * of each property, and the parity harness checks it at several artboard
 * widths. That is a different kind of risk from the inline translation
 * layer this work exists to remove.
 *
 * Non-width queries are untouched: `prefers-color-scheme` and friends
 * describe the real device and should keep answering for it.
 */
export const mediaToContainer = (css: string): string =>
  css.replace(
    /@media\s*([^{]+)\{/gi,
    (full, prelude: string) =>
      isWidthOnlyQuery(prelude) ? `@container ${prelude.trim()} {` : full
  );

/** A width in px from a media value, or null for a unit it can't resolve. */
const pxOf = (value: string): number | null => {
  const m = value.trim().match(/^(-?\d*\.?\d+)(px|em|rem)?$/i);
  if (m === null || m[1] === undefined) return null;
  const n = Number(m[1]);
  // Media queries resolve em against the initial font size, not the page's.
  return (m[2] ?? 'px').toLowerCase() === 'px' ? n : n * 16;
};

/**
 * Whether a width-only media prelude matches a viewport `width` wide, or
 * null when it says something this can't decide (`not`, `print`, a unit
 * other than px / em / rem).
 */
export const mediaMatchesWidth = (prelude: string, width: number): boolean | null => {
  const alternatives = prelude.split(',');
  let any = false;
  for (const alternative of alternatives) {
    const rest = alternative.replace(/\(\s*([a-z-]+)\s*:\s*([^)]+)\)/gi, '').replace(/\b(?:screen|all|and)\b/gi, '').trim();
    if (rest.length > 0) return null;
    let all = true;
    for (const m of alternative.matchAll(/\(\s*([a-z-]+)\s*:\s*([^)]+)\)/gi)) {
      const value = pxOf(m[2] ?? '');
      if (value === null) return null;
      const feature = (m[1] ?? '').toLowerCase();
      const ok = feature === 'max-width' ? width <= value : feature === 'min-width' ? width >= value : feature === 'width' ? width === value : null;
      if (ok === null) return null;
      all &&= ok;
    }
    any ||= all;
  }
  return any;
};

/**
 * Resolve width-based `@media` blocks for a viewport `width` wide: a block
 * that matches is unwrapped, one that doesn't is dropped. For the component
 * editor, whose frame is the component's own size rather than a viewport —
 * evaluated there as container queries, a 232px sidebar read every
 * `(max-width: 768px)` rule as true while the panel said Desktop. A prelude
 * it can't decide becomes a container query, as on a page.
 * see docs/notes/canvas-injected-stylesheet.md
 */
export const mediaForViewport = (css: string, width: number): string => {
  let out = '';
  let i = 0;
  const at = /@media\s*([^{]+)\{/gi;
  for (let m = at.exec(css); m !== null; m = at.exec(css)) {
    const prelude = m[1] ?? '';
    const open = m.index + m[0].length;
    let depth = 1;
    let j = open;
    for (; j < css.length && depth > 0; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
    }
    const inner = css.slice(open, j - 1);
    const matches = isWidthOnlyQuery(prelude) ? mediaMatchesWidth(prelude, width) : null;
    out += css.slice(i, m.index);
    out += matches === null ? mediaToContainer(css.slice(m.index, j)) : matches ? inner : '';
    i = j;
    at.lastIndex = j;
  }
  return out + css.slice(i);
};

export const buildCanvasStylesheet = (
  css: string,
  scopeSelector: string = CANVAS_SCOPE_SELECTOR,
  /** The viewport width to resolve `@media` for; omit to follow the frame. */
  viewportWidth?: number
): string => {
  const stripped = stripStrippedAtRules(css);
  const body = (viewportWidth === undefined ? mediaToContainer(stripped) : mediaForViewport(stripped, viewportWidth)).trim();
  if (body.length === 0) return '';
  return `@scope (${scopeSelector}) {\n${body}\n}`;
};

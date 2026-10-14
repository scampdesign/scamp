// SVG ingestion + safety helpers. DOM-dependent (DOMPurify + DOMParser),
// so this lives under src/renderer/src/lib (alongside exportCapture)
// rather than the env-agnostic src/renderer/lib core. Used by the
// drop/paste insert flows and by ElementRenderer before injecting svg
// markup into the live canvas DOM. see docs/archive/2026-06-30-svg-improvements-plan.md
import DOMPurify from 'dompurify';

/**
 * Cheap structural check: does this text look like an SVG document?
 * Tolerates a leading XML declaration and/or comments before `<svg>`.
 * Pure string test — safe to call on arbitrary clipboard text.
 */
export const isSvgMarkup = (text: string): boolean =>
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s/>]/i.test(text);

/**
 * Sanitize SVG markup for safe injection into the DOM. DOMPurify's SVG
 * profile drops `<script>`, `<foreignObject>`, `on*` handlers, external
 * `href`s, and other execution/exfiltration vectors. Returns a sanitized
 * `<svg>…</svg>` string, or `''` when the input has no usable svg.
 */
export const sanitizeSvg = (raw: string): string =>
  DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

/**
 * Sanitize the INNER markup of an svg (its shape content, i.e. what
 * `svgSource` stores) for safe injection into a rendered `<svg>` on the
 * canvas via `dangerouslySetInnerHTML`. Wraps the fragment so DOMPurify's
 * svg profile applies, then returns the sanitized inner content.
 */
export const sanitizeSvgInner = (inner: string): string => {
  if (inner.trim().length === 0) return '';
  const clean = sanitizeSvg(`<svg>${inner}</svg>`);
  const open = clean.indexOf('>');
  const close = clean.lastIndexOf('</svg>');
  if (open < 0 || close < 0 || close <= open) return '';
  return clean.slice(open + 1, close);
};

/** Paint-carrying properties we surface as editable colours. `color`
 *  backs `currentColor`; `stop-color` covers gradient stops. */
const PAINT_PROPS = ['fill', 'stroke', 'color', 'stop-color'] as const;

/** Parse a `style="a:b;c:d"` attribute into [prop, value] pairs (trimmed,
 *  lowercased prop). Tolerant of trailing semicolons / empty segments. */
const parseStyleDecls = (style: string): Array<[string, string]> =>
  style
    .split(';')
    .map((seg): [string, string] | null => {
      const idx = seg.indexOf(':');
      if (idx < 0) return null;
      const prop = seg.slice(0, idx).trim().toLowerCase();
      const value = seg.slice(idx + 1).trim();
      if (prop.length === 0 || value.length === 0) return null;
      return [prop, value];
    })
    .filter((d): d is [string, string] => d !== null);

const isSkippablePaint = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return v.length === 0 || v === 'none' || v.startsWith('url(');
};

export type SvgColors = {
  /** Unique concrete colours (first-seen order); `none`/`url(#…)` skipped. */
  colors: string[];
  /** True when any paint uses `currentColor` (edited via CSS `color`). */
  hasCurrentColor: boolean;
};

/**
 * Extract every unique colour used inside an SVG's inner source — from
 * `fill` / `stroke` / `color` / `stop-color` presentation attributes AND
 * inline `style` properties. `currentColor` is flagged separately (it maps
 * to the element's CSS `color`, not a source edit). Pure w.r.t. its input.
 * Returns empty on malformed markup rather than throwing.
 */
export const extractSvgColors = (svgSource: string): SvgColors => {
  const inner = sanitizeSvgInner(svgSource);
  if (inner.trim().length === 0) return { colors: [], hasCurrentColor: false };
  const doc = new DOMParser().parseFromString(
    `<svg>${inner}</svg>`,
    'image/svg+xml'
  );
  if (doc.querySelector('parsererror')) {
    return { colors: [], hasCurrentColor: false };
  }
  const colors: string[] = [];
  const seen = new Set<string>();
  let hasCurrentColor = false;
  const add = (raw: string): void => {
    const value = raw.trim();
    if (isSkippablePaint(value)) return;
    const lower = value.toLowerCase();
    if (lower === 'currentcolor') {
      hasCurrentColor = true;
      return;
    }
    if (seen.has(lower)) return;
    seen.add(lower);
    colors.push(value);
  };
  for (const node of Array.from(doc.querySelectorAll('*'))) {
    for (const prop of PAINT_PROPS) {
      const attr = node.getAttribute(prop);
      if (attr !== null) add(attr);
    }
    const style = node.getAttribute('style');
    if (style) {
      for (const [prop, value] of parseStyleDecls(style)) {
        if ((PAINT_PROPS as ReadonlyArray<string>).includes(prop)) add(value);
      }
    }
  }
  return { colors, hasCurrentColor };
};

/**
 * Rewrite every occurrence of the colour `from` to `to` inside an SVG's
 * inner source — across paint attributes and inline `style` properties.
 * Case-insensitive on `from`. Leaves `none`, `url(#…)`, and unrelated
 * colours untouched. Returns the input unchanged on malformed markup.
 */
export const replaceSvgColor = (
  svgSource: string,
  from: string,
  to: string
): string => {
  const inner = sanitizeSvgInner(svgSource);
  if (inner.trim().length === 0) return svgSource;
  const doc = new DOMParser().parseFromString(
    `<svg>${inner}</svg>`,
    'image/svg+xml'
  );
  if (doc.querySelector('parsererror')) return svgSource;
  const wrapper = doc.querySelector('svg');
  if (!wrapper) return svgSource;
  const fromLower = from.trim().toLowerCase();
  for (const node of Array.from(wrapper.querySelectorAll('*'))) {
    for (const prop of PAINT_PROPS) {
      const attr = node.getAttribute(prop);
      if (attr !== null && attr.trim().toLowerCase() === fromLower) {
        node.setAttribute(prop, to);
      }
    }
    const style = node.getAttribute('style');
    if (style) {
      let changed = false;
      const next = style
        .split(';')
        .map((seg) => {
          const idx = seg.indexOf(':');
          if (idx < 0) return seg;
          const prop = seg.slice(0, idx).trim().toLowerCase();
          const value = seg.slice(idx + 1).trim();
          if (
            (PAINT_PROPS as ReadonlyArray<string>).includes(prop) &&
            value.toLowerCase() === fromLower
          ) {
            changed = true;
            return `${seg.slice(0, idx)}:${to}`;
          }
          return seg;
        })
        .join(';');
      if (changed) node.setAttribute('style', next);
    }
  }
  return wrapper.innerHTML;
};

/** Basic SVG shapes whose paint we care about. Containers (`g`, `svg`),
 *  `<defs>` content, gradients, etc. are excluded. */
const SHAPE_TAGS = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

const isNonePaint = (value: string | null): boolean =>
  value !== null && value.trim().toLowerCase() === 'none';

/**
 * Drop shapes that paint nothing — `fill:none` AND `stroke:none` once the
 * root's paint is taken into account. Icon sets (Lucide/Tabler) ship a
 * transparent `<path d="M0 0h24v24H0z" fill="none" stroke="none"/>`
 * bounding box; left in place, an element-level `fill` would inherit down
 * and paint it solid (covering the artwork). Removing it loses nothing
 * visual and lets recolouring work via the wrapper's fill/stroke without
 * touching `svgSource` (keeping it valid JSX — no inline `style` strings,
 * no `var()` that an SVG attribute won't resolve).
 * see docs/notes/svg-recolor.md
 */
const dropInvisibleShapes = (
  svg: SVGElement,
  rootPaint: { fill?: string; stroke?: string }
): void => {
  for (const node of Array.from(svg.querySelectorAll('*'))) {
    if (!SHAPE_TAGS.has(node.tagName.toLowerCase())) continue;
    // Effective paint = own attribute, else the (hoisted) root's, else the
    // SVG initial (fill: black — visible; stroke: none — invisible).
    const fill = node.getAttribute('fill') ?? rootPaint.fill ?? null;
    const stroke = node.getAttribute('stroke') ?? rootPaint.stroke ?? null;
    const fillInvisible = isNonePaint(fill); // null fill = black = visible
    const strokeInvisible = stroke === null || isNonePaint(stroke);
    if (fillInvisible && strokeInvisible) node.remove();
  }
};

/**
 * Pull the root `<svg>`'s own `fill` / `stroke` / `stroke-width` (common on
 * outline icon sets like Lucide) into element-level values — Scamp
 * regenerates the `<svg>` wrapper, so without this the root's paint is
 * lost. Inheriting shapes pick these up; they're also the SvgSection's
 * starting values.
 */
const hoistRootPaint = (
  svg: SVGElement
): { fill?: string; stroke?: string; strokeWidth?: number } => {
  const out: { fill?: string; stroke?: string; strokeWidth?: number } = {};
  const fill = svg.getAttribute('fill');
  if (fill !== null && fill.trim().length > 0) out.fill = fill.trim();
  const stroke = svg.getAttribute('stroke');
  if (stroke !== null && stroke.trim().length > 0) out.stroke = stroke.trim();
  const sw = parseLength(svg.getAttribute('stroke-width'));
  if (sw !== undefined) out.strokeWidth = sw;
  return out;
};

/** Parse an SVG length attribute (`24`, `24px`) to a number. Returns
 *  undefined for percentages, ems, or anything non-numeric — the caller
 *  falls back to viewBox or a default size. */
const parseLength = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)(px)?\s*$/.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
};

export type PreparedSvg = {
  /** Sanitized, normalized inner markup (what `svgSource` stores). */
  svgSource: string;
  /** `viewBox` attribute if present, e.g. "0 0 24 24". */
  viewBox?: string;
  /** Intrinsic width/height in px when derivable (attrs, else viewBox). */
  width?: number;
  height?: number;
  /** Root `<svg>` paint hoisted into element-level starting values. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

/**
 * Sanitize + normalize raw SVG markup for insertion as an inline Scamp
 * `<svg>` element. Returns the inner source (matching the `svgSource`
 * model), the viewBox, and an intrinsic size, or `null` when the input
 * isn't a usable SVG. Pure with respect to its argument (operates on a
 * detached parse, never the live document).
 */
export const prepareSvgForInsert = (raw: string): PreparedSvg | null => {
  const clean = sanitizeSvg(raw);
  if (clean.trim().length === 0) return null;

  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const svg = doc.querySelector('svg');
  if (!svg) return null;

  const rootPaint = hoistRootPaint(svg);
  // Preserve per-shape colours so the SVG Colours editor can surface and
  // edit each one (backlog-6 story 3). We still hoist the ROOT paint to
  // element level (it lives on the regenerated wrapper, not in svgSource)
  // and drop fully-invisible bounding-box shapes, but we no longer strip
  // shapes' own fill/stroke. see docs/notes/svg-recolor.md
  dropInvisibleShapes(svg, rootPaint);

  const rawViewBox = svg.getAttribute('viewBox') ?? undefined;
  let width = parseLength(svg.getAttribute('width'));
  let height = parseLength(svg.getAttribute('height'));
  if ((width === undefined || height === undefined) && rawViewBox) {
    // viewBox = "min-x min-y width height"
    const parts = rawViewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      width = width ?? parts[2];
      height = height ?? parts[3];
    }
  }
  // A viewBox is what lets the rendered `<svg>` scale its shapes to fill the
  // element box. When the source omits it but has an intrinsic size, derive
  // one from that so a resized SVG's artwork scales instead of staying put.
  const viewBox =
    rawViewBox ??
    (width !== undefined && height !== undefined
      ? `0 0 ${width} ${height}`
      : undefined);

  return {
    svgSource: svg.innerHTML,
    ...(viewBox !== undefined ? { viewBox } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(rootPaint.fill !== undefined ? { fill: rootPaint.fill } : {}),
    ...(rootPaint.stroke !== undefined ? { stroke: rootPaint.stroke } : {}),
    ...(rootPaint.strokeWidth !== undefined
      ? { strokeWidth: rootPaint.strokeWidth }
      : {}),
  };
};

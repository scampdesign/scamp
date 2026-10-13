import {
  parseBorderRadiusShorthandOrNull,
  parseBorderShorthand,
  parseBoxShadowShorthand,
  parseFilterList,
  parsePaddingShorthandOrNull,
  parsePxOrNull,
  parseSizeValue,
  parseSpaceValueOrNull,
  parseTransitionShorthand,
  parseFlexShorthand,
  parseTransformList,
} from './parsers';
import { isBlendMode } from './blendModes';
import { parseDisplayKeyword } from './displayKeyword';
import type { ScampElement } from './element';

/**
 * A delta over an element produced from a single CSS declaration. Anything
 * the canvas can model goes here; anything else lands in `customProperties`.
 */
export type ScampPropertyDelta = Partial<ScampElement>;

/**
 * A mapper turns a CSS value string into a delta over the typed
 * canvas element. Returning `null` means "I can't reduce this value
 * to a typed field — preserve the raw declaration in
 * customProperties instead". Returning `{}` is a deliberate "this
 * value is intentionally a no-op" (rare).
 *
 * The lossless contract: the parser must never silently drop
 * agent-written values. Agent writes `padding: var(--space-3)` →
 * `parsePaddingShorthandOrNull` returns null → mapper returns null →
 * the parser pushes `padding: var(--space-3)` into customProperties
 * → the generator emits it back byte-equivalent.
 */
type Mapper = (value: string) => ScampPropertyDelta | null;

const POSITIONS: ReadonlySet<string> = new Set([
  'static',
  'relative',
  'absolute',
  'fixed',
  'sticky',
]);

/**
 * The single source of truth for "what CSS properties does scamp understand".
 *
 * The parser uses this to overlay parsed values onto a defaults baseline;
 * the generator uses the *keys* of this map (indirectly, via what it knows
 * how to emit) to decide what gets emitted vs. relegated to customProperties.
 *
 * Adding canvas support for a new CSS property = add an entry here + add
 * an emitter case in `generateCode`.
 */
/** `start` / `end` → the `flex-*` spelling the container fields store. */
const flexSpelling = (v: string): string => {
  const t = v.trim();
  if (t === 'start') return 'flex-start';
  if (t === 'end') return 'flex-end';
  return t;
};

/** `flex-start` / `flex-end` → the short spelling `alignSelf` stores. */
const selfSpelling = (v: string): string => {
  const t = v.trim();
  if (t === 'flex-start') return 'start';
  if (t === 'flex-end') return 'end';
  return t;
};

const nonNegativeNumberOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!/^(?:\d+|\d*\.\d+)$/.test(t)) return null;
  return Number(t);
};

export const cssToScampProperty: Record<string, Mapper> = {
  background: (v) => ({ backgroundColor: v }),
  'background-color': (v) => ({ backgroundColor: v }),
  'border-radius': (v) => {
    const parsed = parseBorderRadiusShorthandOrNull(v);
    if (parsed === null) return null;
    return { borderRadius: parsed };
  },
  display: (v) => {
    if (v.trim() === 'none') return { visibilityMode: 'none' };
    // Values the model can't hold (`flow-root`, `table-row`, `ruby`, …)
    // are kept verbatim via customProperties. see displayKeyword.ts
    return parseDisplayKeyword(v);
  },
  visibility: (v) => {
    if (v === 'hidden') return { visibilityMode: 'hidden' };
    if (v === 'visible') return { visibilityMode: 'visible' };
    return null;
  },
  opacity: (v) => {
    const n = Number(v.trim());
    if (!Number.isFinite(n)) return null;
    return { opacity: Math.min(1, Math.max(0, n)) };
  },
  position: (v) => {
    const trimmed = v.trim();
    if (POSITIONS.has(trimmed)) {
      return { position: trimmed as ScampElement['position'] };
    }
    return null;
  },
  'flex-direction': (v) => {
    const t = v.trim();
    if (t === 'row' || t === 'column' || t === 'row-reverse' || t === 'column-reverse') {
      return { flexDirection: t };
    }
    return null;
  },
  gap: (v) => {
    const sv = parseSpaceValueOrNull(v);
    if (sv === null) return null;
    // ONLY `gap`. Populating the axis fields as well made a flex element
    // fail the round-trip: it parsed to gap+columnGap+rowGap where the
    // original had only gap. The grid side is fixed in the generator
    // instead, which emits each field from its own source.
    // see docs/notes/grid-gap-shorthand.md
    return { gap: sv };
  },
  'align-items': (v) => {
    const t = flexSpelling(v);
    if (
      t === 'flex-start' ||
      t === 'center' ||
      t === 'flex-end' ||
      t === 'stretch' ||
      t === 'baseline'
    ) {
      return { alignItems: t };
    }
    return null;
  },
  'justify-content': (v) => {
    const t = flexSpelling(v);
    if (
      t === 'flex-start' ||
      t === 'center' ||
      t === 'flex-end' ||
      t === 'space-between' ||
      t === 'space-around' ||
      t === 'space-evenly'
    ) {
      return { justifyContent: t };
    }
    return null;
  },
  'flex-wrap': (v) => {
    const t = v.trim();
    if (t === 'nowrap' || t === 'wrap' || t === 'wrap-reverse') return { flexWrap: t };
    return null;
  },
  'align-content': (v) => {
    const t = flexSpelling(v);
    if (
      t === 'normal' ||
      t === 'flex-start' ||
      t === 'center' ||
      t === 'flex-end' ||
      t === 'space-between' ||
      t === 'space-around' ||
      t === 'space-evenly' ||
      t === 'stretch'
    ) {
      return { alignContent: t };
    }
    return null;
  },
  // Width / height accept any CSS length: plain numbers / `px` →
  // fixed-px, `100%` → stretch, `auto` → auto, `fit-content` → hug,
  // anything else (`100vh`, `2em`, `calc(...)`, `var(--w)`) → fixed
  // with the verbatim string preserved in `widthCustom` /
  // `heightCustom`. See `parseSizeValue` for the full table.
  //
  // Always returns a delta — the lossless contract is upheld by the
  // verbatim-string fallback rather than by routing through
  // `customProperties`.
  width: (v) => {
    const parsed = parseSizeValue(v);
    if (parsed.mode === 'fixed') {
      return {
        widthMode: 'fixed',
        widthValue: parsed.value,
        widthCustom: parsed.custom,
      };
    }
    // Non-fixed mode: leave widthValue alone but clear any stale
    // widthCustom so the generator doesn't keep emitting an old vh
    // value after the user / agent switched to `100%`.
    return { widthMode: parsed.mode, widthCustom: undefined };
  },
  height: (v) => {
    const parsed = parseSizeValue(v);
    if (parsed.mode === 'fixed') {
      return {
        heightMode: 'fixed',
        heightValue: parsed.value,
        heightCustom: parsed.custom,
      };
    }
    return { heightMode: parsed.mode, heightCustom: undefined };
  },
  // Free-form string so `100vh`, `500px`, `var(--page-min-h)`,
  // `calc(...)`, etc. round-trip without parallel "raw" state. The
  // generator emits whatever the user / agent wrote.
  'min-height': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { minHeight: trimmed };
  },
  border: (v) => {
    const parsed = parseBorderShorthand(v);
    // Convert the single borderWidth from the shorthand parser into a
    // uniform tuple so it matches the new per-side model.
    const w = parsed.borderWidth;
    return { ...parsed, borderWidth: [w, w, w, w] as [number, number, number, number] };
  },
  'border-width': (v) => {
    const parsed = parsePaddingShorthandOrNull(v);
    if (parsed === null) return null;
    return { borderWidth: parsed };
  },
  'border-style': (v) => {
    if (v === 'none' || v === 'solid' || v === 'dashed' || v === 'dotted') {
      return { borderStyle: v };
    }
    return null;
  },
  'border-color': (v) => ({ borderColor: v }),
  padding: (v) => {
    const parsed = parsePaddingShorthandOrNull(v);
    if (parsed === null) return null;
    return { padding: parsed };
  },
  margin: (v) => {
    const parsed = parsePaddingShorthandOrNull(v, true);
    if (parsed === null) return null;
    return { margin: parsed };
  },
  'line-height': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { lineHeight: trimmed };
  },
  'letter-spacing': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { letterSpacing: trimmed };
  },
  'font-family': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { fontFamily: trimmed };
  },
  'font-size': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { fontSize: trimmed };
  },
  'font-weight': (v) => {
    // The two absolute keyword weights have exact numeric equivalents —
    // type them so the panel + canvas control them instead of leaving
    // them stranded in customProperties. see docs/notes/typed-property-echo.md
    const keyword = v.trim().toLowerCase();
    if (keyword === 'normal') return { fontWeight: 400 };
    if (keyword === 'bold') return { fontWeight: 700 };
    const n = parseInt(v, 10);
    // Accept any numeric CSS weight (1–1000); relative keywords
    // (`lighter`, `bolder`), `inherit`, and out-of-range values fall
    // through to customProperties.
    if (Number.isInteger(n) && n >= 1 && n <= 1000) {
      return { fontWeight: n };
    }
    return null;
  },
  color: (v) => ({ color: v }),
  // SVG paint. Free-form colour strings (hex, currentColor, var(--token),
  // none); stroke-width is a px number routed to the typed field.
  fill: (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { fill: trimmed };
  },
  stroke: (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { stroke: trimmed };
  },
  'stroke-width': (v) => {
    const n = parsePxOrNull(v);
    if (n === null) return null;
    return { strokeWidth: n };
  },
  // The `--svg-fill` / `--svg-stroke` custom properties are emitted
  // alongside `fill`/`stroke` (they drive the var-rewritten shapes). Map
  // them back to the same typed fields so they round-trip there rather
  // than duplicating into customProperties.
  '--svg-fill': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { fill: trimmed };
  },
  '--svg-stroke': (v) => {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return { stroke: trimmed };
  },
  'text-align': (v) => {
    if (v === 'left' || v === 'center' || v === 'right') {
      return { textAlign: v };
    }
    return null;
  },
  transition: (v) => {
    const transitions = parseTransitionShorthand(v);
    return { transitions };
  },
  'box-shadow': (v) => {
    const parsed = parseBoxShadowShorthand(v);
    if (parsed === null) return null;
    return { boxShadows: parsed };
  },
  'mix-blend-mode': (v) => {
    const trimmed = v.trim().toLowerCase();
    if (!isBlendMode(trimmed)) return null;
    return { mixBlendMode: trimmed };
  },
  'background-blend-mode': (v) => {
    const trimmed = v.trim().toLowerCase();
    if (!isBlendMode(trimmed)) return null;
    return { backgroundBlendMode: trimmed };
  },
  filter: (v) => {
    const parsed = parseFilterList(v);
    if (parsed === null) return null;
    return { filters: parsed };
  },
  'backdrop-filter': (v) => {
    const parsed = parseFilterList(v);
    if (parsed === null) return null;
    return { backdropFilters: parsed };
  },
  transform: (v) => {
    const parsed = parseTransformList(v);
    if (parsed === null) return null;
    return { transforms: parsed };
  },
  'transform-origin': (v) => {
    const t = v.trim();
    if (t.length === 0) return null;
    return { transformOrigin: t };
  },

  // ---- Grid ----
  'grid-template-columns': (v) => {
    const trimmed = v.trim();
    return { gridTemplateColumns: trimmed === 'none' ? '' : trimmed };
  },
  'grid-template-rows': (v) => {
    const trimmed = v.trim();
    return { gridTemplateRows: trimmed === 'none' ? '' : trimmed };
  },
  'column-gap': (v) => {
    const sv = parseSpaceValueOrNull(v);
    if (sv === null) return null;
    return { columnGap: sv };
  },
  'row-gap': (v) => {
    const sv = parseSpaceValueOrNull(v);
    if (sv === null) return null;
    return { rowGap: sv };
  },
  'justify-items': (v) => {
    if (v === 'start' || v === 'center' || v === 'end' || v === 'stretch') {
      return { justifyItems: v };
    }
    return null;
  },
  'grid-column': (v) => ({ gridColumn: v.trim() }),
  'grid-row': (v) => ({ gridRow: v.trim() }),
  // Accepts the flex spellings too (`flex-start` → `start`): the field is
  // shared by flex and grid children and stores the short form.
  'align-self': (v) => {
    const t = selfSpelling(v);
    if (
      t === 'auto' ||
      t === 'start' ||
      t === 'center' ||
      t === 'end' ||
      t === 'stretch' ||
      t === 'baseline'
    ) {
      return { alignSelf: t };
    }
    return null;
  },
  'flex-grow': (v) => {
    const n = nonNegativeNumberOrNull(v);
    return n === null ? null : { flexGrow: n };
  },
  'flex-shrink': (v) => {
    const n = nonNegativeNumberOrNull(v);
    return n === null ? null : { flexShrink: n };
  },
  'flex-basis': (v) => {
    const t = v.trim();
    if (t.length === 0) return null;
    return { flexBasis: t === 'auto' ? '' : t };
  },
  // The shorthand expands to all three longhands; anything it can't
  // reduce stays verbatim. `parseCode` then folds the exact fill-height
  // `flex: 1` back into `heightMode` — see the absorption there.
  flex: (v) => {
    const parsed = parseFlexShorthand(v);
    return parsed === null ? null : { ...parsed };
  },
  order: (v) => {
    const t = v.trim();
    if (!/^-?\d+$/.test(t)) return null;
    return { order: Number(t) };
  },
  'justify-self': (v) => {
    if (v === 'start' || v === 'center' || v === 'end' || v === 'stretch') {
      return { justifySelf: v };
    }
    return null;
  },
};

export const isMappedProperty = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(cssToScampProperty, name);

// generateCode/declarations.ts — split out of generateCode.ts (4.5).
import { effectiveDisplay } from "../effectiveDisplay";
import { cellSpanPlacement } from "../tableGrid";
import { displayKeyword } from "../displayKeyword";
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from "../defaults";
import { ROOT_ELEMENT_ID, type BreakpointOverride, type PropertyGroup, type ScampElement } from "../element";
import { formatAnimationShorthand, formatBoxShadowShorthand, formatFilterList, formatTransformList, formatTransitionShorthand } from "../parsers";
import { CUSTOM_PROP_TO_GROUP } from "../propertyGroups";
import { formatSpaceShorthand, formatSpaceValue, hasAutoSide, isZeroSpaceTuple, spaceValueEquals } from "../spaceValue";
import { getTagDefaultPadding, paddingEquals } from "../tagDefaults";
import { isColumnDirection, selfAlignForParent } from "../flexAxis";
import { tagFor } from "./internal";

/**
 * The `width:` / `height:` lines for one element, measured against the
 * default set that applies to it.
 *
 * The 'auto' mode is the implicit CSS default (no declaration), so it
 * deliberately emits nothing — that's how round-trips stay text-stable for
 * files that simply omit a width or height.
 *
 * Split out because a component instance emits ONLY these two properties
 * (everything else about an instance lives in the component definition).
 * see docs/notes/components-data-model.md
 */
/**
 * `width` / `height` for one element.
 *
 * A fixed size is ALWAYS emitted, even when it equals the default. Every
 * other property here is skipped when it matches its default, which is
 * safe because "absent" and "the default" mean the same thing in CSS —
 * absent `opacity` is 1. That does not hold for size: absent `width` is
 * `auto`, which is a different rendering entirely.
 *
 * Skipping it broke two things at once. A rectangle drawn at exactly
 * 100px wide lost its width in the generated CSS, so the canvas showed
 * 100px (from the model) and the browser showed a content-sized box. And
 * it violated the round-trip invariant: `parseCode` reads an absent width
 * as `auto`, not as fixed-at-the-default, so fixed/100 in, auto out.
 *
 * There is no risk of pinning agent-written elements that have no width:
 * those parse as `auto`, and only `fixed` emits a length here.
 */
/**
 * How a `stretch` height is written for a flex child, if specially at all:
 * `flex: 1` on a column's main axis, `align-self: stretch` on a row's
 * cross axis — but only while `alignSelf` is unset (or already stretch),
 * so a user-set alignment is never contradicted by a second line. Shared
 * with the flex-item block below, which must not repeat that line.
 */
export const fillHeightKind = (
  el: ScampElement,
  parent?: ScampElement | null
): 'flex' | 'align-self' | null => {
  if (parent?.display !== 'flex' || el.heightMode !== 'stretch') return null;
  if (isColumnDirection(parent.flexDirection)) return 'flex';
  return el.alignSelf === 'auto' || el.alignSelf === 'stretch' ? 'align-self' : null;
};

/**
 * Tags a browser lays out inline unless told otherwise, and that
 * Scamp's own reset does not already force to block.
 *
 * `a`, `button` and the replaced media tags are absent on purpose:
 * `theme.css` sets those to `display: block` itself, so spelling it
 * out again would be noise on every one of them.
 * see docs/notes/import-inline-spans.md
 */
const INLINE_BY_DEFAULT: ReadonlySet<string> = new Set([
  'span', 'em', 'i', 'b', 'strong', 'u', 's', 'small', 'sub', 'sup',
  'mark', 'abbr', 'cite', 'q', 'code', 'kbd', 'samp', 'var', 'time',
  'del', 'ins', 'label',
]);

export const sizeDeclarationLines = (
  el: ScampElement,
  parent?: ScampElement | null
): string[] => {
  // Fill-height in a flex ROW cannot be `height: 100%`.
  //
  // The percentage resolves against the container's height, and the usual
  // page root is `min-height: 100vh` with `height: auto` — indefinite —
  // so it computes to nothing and the child renders 0 tall. Measured: 0
  // against an indefinite parent, correct against a definite one.
  // `align-self: stretch` fills the cross axis either way, which is why
  // Paper emits it even where a percentage would have worked.
  //
  // Cross axis only, and only in a row. A column parent's cross axis is
  // width, where `width: 100%` resolves against a definite inline size —
  // and align-self there would override the parent's `align-items`, so a
  // centred max-width child would pin left. Same asymmetry the canvas
  // documents. see docs/notes/canvas-cross-axis-stretch.md
  //
  // Guarded on the default alignSelf so a user-set alignment is never
  // contradicted by a second align-self line.
  // Fill-height in a flex COLUMN is the MAIN axis, and `height: 100%`
  // collapses there for the same reason: measured 0 against an
  // indefinite parent (the usual `min-height: 100vh` root), correct
  // against a definite one. `flex: 1` is right in both.
  //
  // Unlike the row MAIN axis — where Phase 0 showed `flex: 1` is not a
  // neutral respelling and would re-lay-out real pages — the two agree
  // here in every case except an over-full column whose sibling is
  // allowed to shrink (measured: 187/213 vs 350/50). That case trades a
  // proportional squeeze for "the sibling keeps its height and fill
  // takes what is left", which is what the mode name promises.
  // see docs/plans/flex-sizing-contract-plan.md
  const fill = fillHeightKind(el, parent);
  const fillHeightAsFlex = fill === 'flex';
  const fillHeightAsAlignSelf = fill === 'align-self';
  const lines: string[] = [];
  if (el.widthMode === 'stretch') {
    lines.push(`width: 100%;`);
  } else if (el.widthMode === 'fit-content') {
    lines.push(`width: fit-content;`);
  } else if (el.widthMode === 'fixed') {
    // `widthCustom` carries non-px values (vh, vw, em, calc, var, …)
    // verbatim. When set, it overrides the px fallback so the file
    // round-trips exactly what the user / agent wrote.
    if (el.widthCustom !== undefined && el.widthCustom.length > 0) {
      lines.push(`width: ${el.widthCustom};`);
    } else {
      lines.push(`width: ${el.widthValue}px;`);
    }
  }
  if (el.heightMode === 'stretch') {
    lines.push(
      fillHeightAsAlignSelf
        ? `align-self: stretch;`
        : fillHeightAsFlex
          ? `flex: 1;`
          : `height: 100%;`
    );
  } else if (el.heightMode === 'fit-content') {
    lines.push(`height: fit-content;`);
  } else if (el.heightMode === 'fixed') {
    if (el.heightCustom !== undefined && el.heightCustom.length > 0) {
      lines.push(`height: ${el.heightCustom};`);
    } else {
      lines.push(`height: ${el.heightValue}px;`);
    }
  }
  return lines;
};


/**
 * Build the list of `prop: value;` lines for one element. Skips anything
 * equal to its default; appends customProperties verbatim at the end.
 *
 * Exported so the properties panel can render what would be written to
 * disk for the selected element without having to re-implement the rules.
 */
export const elementDeclarationLines = (
  el: ScampElement,
  parent?: ScampElement | null,
  /**
   * When true, this element has at least one descendant that will
   * be `position: absolute` and would otherwise escape to a remote
   * ancestor's positioning context (or all the way to `.root`).
   * We emit `position: relative` here so the descendant anchors
   * locally — even when `el.position === 'auto'` would normally
   * emit nothing. See `computeElementsNeedingPositioningContext`.
   */
  mustEstablishPositioningContext: boolean = false
): string[] => {
  const lines: string[] = [];
  // Buffer for declarations routed into toggled-off group comment
  // blocks. Keyed by group; values are the already-`/* … */`-wrapped
  // commented decls in emit order. Drained at the end of the
  // function as `/* group off */` blocks appended after the
  // active lines.
  const commentedByGroup: Map<PropertyGroup, string[]> = new Map();
  const offGroups = new Set<PropertyGroup>(el.toggledOffGroups);

  /**
   * Route a `prop: value;` line either to the active lines buffer
   * or to the appropriate group's comment buffer. `group === null`
   * means the property isn't part of a togglable group and always
   * emits actively (sizing, layout, position, spacing,
   * visibilityMode/opacity).
   */
  const emit = (group: PropertyGroup | null, line: string): void => {
    if (group !== null && offGroups.has(group)) {
      const bucket = commentedByGroup.get(group);
      if (bucket) bucket.push(`/* ${line} */`);
      else commentedByGroup.set(group, [`/* ${line} */`]);
    } else {
      lines.push(line);
    }
  };

  const isRoot = el.id === ROOT_ELEMENT_ID;
  // When the parent is a flex OR grid container, this element is laid
  // out by that engine and should NOT have absolute positioning —
  // position/left/top become meaningless because the parent owns
  // placement.
  const parentDisplay = effectiveDisplay(parent);
  const inFlexParent = parentDisplay === 'flex';
  const inGridParent = parentDisplay === 'grid';
  // Slot content — a page-owned child of a component-instance — flows
  // inside the component's slot rect (React `{children}`). It must NOT be
  // absolutely positioned or it escapes the slot to the component root.
  // see docs/plans/component-slots-plan.md
  const inInstanceParent = parent?.type === 'component-instance';
  const inLayoutParent = inFlexParent || inGridParent || inInstanceParent;
  // Different default set for root vs any other rect — a root defaults
  // to a white page background and web-idiomatic sizing (100% / auto)
  // so the exported CSS works outside Scamp. Everything else flows
  // through the same code path.
  const BASE = isRoot ? DEFAULT_ROOT_STYLES : DEFAULT_RECT_STYLES;

  lines.push(...sizeDeclarationLines(el, parent));

  // `min-height` — free-form string. Page-root defaults to `100vh`
  // (via DEFAULT_ROOT_STYLES) so generated pages have visible height
  // in any browser; non-root elements default to undefined and emit
  // nothing unless the user / agent set a value.
  if (el.minHeight !== undefined) {
    lines.push(`min-height: ${el.minHeight};`);
  }

  // Visibility "none" emits `display: none` and suppresses
  // layout-mode declarations it would override. Layout declarations
  // still come out when visibility is visible/hidden so the latent
  // state round-trips.
  if (el.visibilityMode === 'none') {
    lines.push('display: none;');
  } else {
    // An `inline` / `inline-flex` / … keyword is written last, below.
    if (el.displayOuter === undefined && el.display !== BASE.display) {
      lines.push(`display: ${el.display};`);
    } else if (
      el.displayOuter === undefined &&
      INLINE_BY_DEFAULT.has(el.tag ?? '') &&
      el.customProperties['display'] === undefined &&
      // Only where inline-vs-block is observable: in normal flow. A
      // flex or grid item is blockified by its parent, and an
      // absolutely positioned box is out of flow — both moot, and
      // saying it there would rewrite every `<span>` in every project
      // that already exists.
      !inLayoutParent &&
      (el.position === 'static' || el.position === 'relative')
    ) {
      // The model's "not a flex or grid container" sentinel is also its
      // default, so it emits nothing — which reads as `block` on a div
      // and as `inline` on an `<em>`. A block-level `<em>` could
      // therefore not be written down: an imported small-print
      // disclaimer flowed back into the sentence above it.
      //
      // `customProperties` wins where it has an opinion, so an element
      // that really is inline keeps saying so and this stays quiet.
      lines.push('display: block;');
    }
    if (el.display === 'grid') {
      // Grid container fields. Empty template strings + zero gaps
      // are skipped so the generated CSS only carries declarations
      // the user actually set.
      if (el.gridTemplateColumns.trim().length > 0) {
        lines.push(`grid-template-columns: ${el.gridTemplateColumns};`);
      }
      if (el.gridTemplateRows.trim().length > 0) {
        lines.push(`grid-template-rows: ${el.gridTemplateRows};`);
      }
      // Each field emits from its own source, so the round trip can tell
      // them apart. A grid written with the `gap` shorthand keeps it —
      // that declaration used to be dropped entirely, because the grid
      // branch only ever read the axis fields, which the shorthand never
      // populated. see docs/notes/grid-gap-shorthand.md
      if (!spaceValueEquals(el.gap, BASE.gap)) {
        lines.push(`gap: ${formatSpaceValue(el.gap)};`);
      }
      if (!spaceValueEquals(el.columnGap, BASE.columnGap)) {
        lines.push(`column-gap: ${formatSpaceValue(el.columnGap)};`);
      }
      if (!spaceValueEquals(el.rowGap, BASE.rowGap)) {
        lines.push(`row-gap: ${formatSpaceValue(el.rowGap)};`);
      }
      if (el.alignItems !== BASE.alignItems) {
        lines.push(`align-items: ${el.alignItems};`);
      }
      if (el.justifyItems !== BASE.justifyItems) {
        lines.push(`justify-items: ${el.justifyItems};`);
      }
    } else {
      // Flex (and the legacy "none" non-flex mode) emit the existing
      // flex container fields. Grid-only fields stay latent on the
      // element.
      if (el.flexDirection !== BASE.flexDirection) {
        lines.push(`flex-direction: ${el.flexDirection};`);
      }
      if (!spaceValueEquals(el.gap, BASE.gap)) {
        lines.push(`gap: ${formatSpaceValue(el.gap)};`);
      }
      if (el.alignItems !== BASE.alignItems) {
        lines.push(`align-items: ${el.alignItems};`);
      }
      if (el.justifyContent !== BASE.justifyContent) {
        lines.push(`justify-content: ${el.justifyContent};`);
      }
      if (el.flexWrap !== BASE.flexWrap) {
        lines.push(`flex-wrap: ${el.flexWrap};`);
      }
      if (el.alignContent !== BASE.alignContent) {
        lines.push(`align-content: ${el.alignContent};`);
      }
      // Per-axis gaps are real on a flex container too (the row gap
      // between wrapped lines is the usual reason). Each emits from its
      // own field, as the grid branch does — they used to be parsed and
      // then silently dropped here. see docs/plans/flex-controls-plan.md
      if (!spaceValueEquals(el.columnGap, BASE.columnGap)) {
        lines.push(`column-gap: ${formatSpaceValue(el.columnGap)};`);
      }
      if (!spaceValueEquals(el.rowGap, BASE.rowGap)) {
        lines.push(`row-gap: ${formatSpaceValue(el.rowGap)};`);
      }
    }
  }

  // Grid-item declarations — apply when this element's PARENT is a
  // grid container. Free-text fields are emitted when non-empty;
  // align/justify-self only when not the default `stretch`.
  if (parent && parentDisplay === 'grid') {
    // A cell's span comes from its `colSpan` / `rowSpan` attribute. An
    // explicit placement the user typed still wins — this only fills in
    // what the attribute already said. see docs/plans/tables-plan.md
    const span = cellSpanPlacement(el);
    if (el.gridColumn.trim().length > 0) {
      lines.push(`grid-column: ${el.gridColumn};`);
    } else if (span.gridColumn !== undefined) {
      lines.push(`grid-column: ${span.gridColumn};`);
    }
    if (el.gridRow.trim().length > 0) {
      lines.push(`grid-row: ${el.gridRow};`);
    } else if (span.gridRow !== undefined) {
      lines.push(`grid-row: ${span.gridRow};`);
    }
    if (el.alignSelf !== BASE.alignSelf) {
      lines.push(`align-self: ${selfAlignForParent(el.alignSelf, 'grid')};`);
    }
    if (el.justifySelf !== BASE.justifySelf) {
      lines.push(`justify-self: ${el.justifySelf};`);
    }
  }

  // Flex-item declarations — apply when this element's PARENT is a flex
  // container. Longhands only: the shorthand is read on the way in and
  // never written, so the fill-height `flex: 1` above stays the one
  // shorthand in a file. `align-self` is skipped when the fill line has
  // already written it.
  if (parent && parentDisplay === 'flex') {
    if (el.flexGrow !== BASE.flexGrow) {
      lines.push(`flex-grow: ${el.flexGrow};`);
    }
    if (el.flexShrink !== BASE.flexShrink) {
      lines.push(`flex-shrink: ${el.flexShrink};`);
    }
    if (el.flexBasis.trim().length > 0) {
      lines.push(`flex-basis: ${el.flexBasis};`);
    }
    if (
      el.alignSelf !== BASE.alignSelf &&
      fillHeightKind(el, parent) !== 'align-self'
    ) {
      lines.push(`align-self: ${selfAlignForParent(el.alignSelf, 'flex')};`);
    }
  }
  // `order` is a flex AND grid item property.
  if (
    parent &&
    (parentDisplay === 'flex' || parentDisplay === 'grid') &&
    el.order !== BASE.order
  ) {
    lines.push(`order: ${el.order};`);
  }

  // Padding — emit when it differs from the tag's effective
  // default. For most tags that's `[0,0,0,0]`, so we omit when
  // every side is zero. For UA-padded tags (`<ul>`, `<ol>`,
  // `<dd>`) the effective default is `[0,0,0,40]`; an explicit
  // `[0,0,0,0]` on those tags is a user override of the UA
  // padding-inline-start and MUST emit, otherwise the file
  // re-renders with the browser's 40px back in place.
  const tagPaddingDefault = getTagDefaultPadding(tagFor(el));
  if (!paddingEquals(el.padding, tagPaddingDefault)) {
    lines.push(`padding: ${formatSpaceShorthand(el.padding)};`);
  }

  // Margin — skipped on root because the page frame doesn't sit inside
  // another box on disk, and an exported `.root { margin: ... }` would
  // collide with the user's body/app-shell layout.
  //
  // Skip emission when every side is plain-px zero. Token-form sides
  // always emit even when they happen to be `var(--space-0)` — the
  // user wrote that intentionally and we must round-trip it.
  if (!isRoot && !isZeroSpaceTuple(el.margin) && !hasAutoSide(el.margin)) {
    lines.push(`margin: ${formatSpaceShorthand(el.margin)};`);
  }

  // Appearance — togglable groups route through `emit(group, …)`
  // so the line either lands in the active buffer or in the
  // group's comment buffer (drained at the end of this function).
  if (el.backgroundColor !== BASE.backgroundColor) {
    emit('background', `background: ${el.backgroundColor};`);
  }
  if (!isZeroSpaceTuple(el.borderRadius)) {
    emit('border', `border-radius: ${formatSpaceShorthand(el.borderRadius)};`);
  }
  const hasBorder =
    !isZeroSpaceTuple(el.borderWidth) ||
    el.borderStyle !== BASE.borderStyle ||
    el.borderColor !== BASE.borderColor;
  if (hasBorder) {
    emit('border', `border-width: ${formatSpaceShorthand(el.borderWidth)};`);
    emit('border', `border-style: ${el.borderStyle};`);
    emit('border', `border-color: ${el.borderColor};`);
  }

  // Text properties (only on text elements, only when set). Size-
  // related values are stored as full CSS strings so token refs and
  // non-px units round-trip without extra state.
  if (el.type === 'text') {
    if (el.fontFamily !== undefined) emit('typography', `font-family: ${el.fontFamily};`);
    if (el.fontSize !== undefined) emit('typography', `font-size: ${el.fontSize};`);
    if (el.fontWeight !== undefined) emit('typography', `font-weight: ${el.fontWeight};`);
    if (el.color !== undefined) emit('typography', `color: ${el.color};`);
    if (el.textAlign !== undefined) emit('typography', `text-align: ${el.textAlign};`);
    if (el.lineHeight !== undefined) emit('typography', `line-height: ${el.lineHeight};`);
    if (el.letterSpacing !== undefined) {
      emit('typography', `letter-spacing: ${el.letterSpacing};`);
    }
  } else {
    // Inherited typography on a container reaches its text children
    // through the cascade, so a declared one has to round-trip. `color`
    // was fixed here first, for exactly that reason; the rest of the
    // inherited set was still parsed and then silently dropped, which
    // is how a container could be written with `font-size: 56px` and
    // regenerated without it — the file rewriting itself, and every
    // text child inside it falling back a size.
    //
    // Only ever emitted when something set them: a rectangle nobody
    // gave type to has these undefined and stays quiet.
    if (el.fontFamily !== undefined) lines.push(`font-family: ${el.fontFamily};`);
    if (el.fontSize !== undefined) lines.push(`font-size: ${el.fontSize};`);
    if (el.fontWeight !== undefined) lines.push(`font-weight: ${el.fontWeight};`);
    // Svg emits its own `color` below.
    if (el.tag !== 'svg' && el.color !== undefined && el.color.length > 0) {
      lines.push(`color: ${el.color};`);
    }
    if (el.textAlign !== undefined) lines.push(`text-align: ${el.textAlign};`);
    if (el.lineHeight !== undefined) lines.push(`line-height: ${el.lineHeight};`);
    if (el.letterSpacing !== undefined) {
      lines.push(`letter-spacing: ${el.letterSpacing};`);
    }
  }

  // Visibility + opacity — NOT togglable. These always emit
  // actively. (See `propertyGroups.ts` for why Visibility isn't
  // a togglable group.)
  if (el.visibilityMode === 'hidden') {
    lines.push('visibility: hidden;');
  }
  if (el.opacity !== BASE.opacity) {
    lines.push(`opacity: ${el.opacity};`);
  }

  // Box shadows — single shorthand per element. Empty list omits.
  if (el.boxShadows.length > 0) {
    emit('shadow', `box-shadow: ${formatBoxShadowShorthand(el.boxShadows)};`);
  }

  // Blend modes — `normal` is the default and emits no declaration.
  // The data layer permits any non-default keyword regardless of
  // whether a background image is set; the panel hides the
  // background-blend control when there's nothing to blend.
  if (el.mixBlendMode !== BASE.mixBlendMode) {
    emit('blend', `mix-blend-mode: ${el.mixBlendMode};`);
  }
  if (el.backgroundBlendMode !== BASE.backgroundBlendMode) {
    emit('blend', `background-blend-mode: ${el.backgroundBlendMode};`);
  }

  // Filters — single space-joined declaration per property. Empty
  // lists omit.
  if (el.filters.length > 0) {
    emit('filters', `filter: ${formatFilterList(el.filters)};`);
  }
  if (el.backdropFilters.length > 0) {
    emit('filters', `backdrop-filter: ${formatFilterList(el.backdropFilters)};`);
  }
  if (el.transforms.length > 0) {
    emit('transform', `transform: ${formatTransformList(el.transforms)};`);
  }
  if (el.transformOrigin.trim().length > 0) {
    emit('transform', `transform-origin: ${el.transformOrigin.trim()};`);
  }

  // SVG paint — set via the SvgSection on tag==='svg'. The fill/stroke
  // property on the wrapper recolours the shapes inside (it inherits and
  // overrides their presentation attributes — the standard svg recolour
  // mechanism). Invisible bounding boxes are dropped on import so this
  // doesn't paint them. see docs/notes/svg-recolor.md
  if (el.fill !== undefined && el.fill.length > 0) {
    lines.push(`fill: ${el.fill};`);
  }
  if (el.stroke !== undefined && el.stroke.length > 0) {
    lines.push(`stroke: ${el.stroke};`);
  }
  if (el.strokeWidth !== undefined && el.strokeWidth > 0) {
    lines.push(`stroke-width: ${el.strokeWidth}px;`);
  }
  // `color` on an svg backs its `currentColor` shapes (the "Current color"
  // swatch). Emitted here for svg because the typography block above is
  // text-only. see docs/plans/svg-color-editing-plan.md
  if (el.tag === 'svg' && el.color !== undefined && el.color.length > 0) {
    lines.push(`color: ${el.color};`);
  }

  // Transitions — single shorthand per element. Empty list omits.
  if (el.transitions.length > 0) {
    emit('transitions', `transition: ${formatTransitionShorthand(el.transitions)};`);
  }

  // Animation — single shorthand per element. Multi-animation source
  // round-trips via customProperties.animation rather than this
  // typed field; the field is undefined when no animation applies.
  if (el.animation) {
    emit('animation', `animation: ${formatAnimationShorthand(el.animation)};`);
  }

  // Position. The element's typed `position` field decides the
  // strategy:
  //   - 'auto' (default) → Scamp's tree-shape rule: root is
  //     `position: relative`; non-root, non-flex/grid children get
  //     `position: absolute` + `left`/`top`; flex/grid children get
  //     no declaration (parent owns layout).
  //   - 'static' → emit `position: static` and skip offsets.
  //   - 'relative' / 'absolute' / 'fixed' / 'sticky' → emit the
  //     position keyword plus `left`/`top` from the stored x/y.
  //
  // An agent-written `position: fixed; top: 0;` round-trips through
  // this branch with the typed value preserved; `top`/`right`/
  // `bottom` other than `el.y` come back via customProperties and
  // override the typed `top` (CSS cascade — last declaration wins
  // for the same property name within a rule).
  // An offset the typed x / y can't hold (`left: 50%`) is written in
  // its place; the customProperties echo below is then skipped.
  const left = (px: number): string => el.customProperties['left'] ?? `${px}px`;
  const top = (px: number): string => el.customProperties['top'] ?? `${px}px`;
  if (el.position === 'auto') {
    if (isRoot) {
      lines.push(`position: relative;`);
    } else if (!inLayoutParent) {
      lines.push(`position: absolute;`);
      lines.push(`left: ${left(el.x)};`);
      lines.push(`top: ${top(el.y)};`);
    } else if (mustEstablishPositioningContext) {
      // Element is laid out by its flex/grid parent (so it doesn't
      // need its own position keyword for placement) BUT it contains
      // absolute descendants that would otherwise escape to a
      // remote ancestor. Establish a positioning context here.
      //
      // Emit the same `left`/`top` triple the explicit `relative`
      // branch below does so round-trips stay text-stable: on parse,
      // `el.position` flips from `'auto'` to `'relative'`, and every
      // subsequent save lands byte-identical via the explicit branch.
      // The offsets are ZERO, never the stored x/y: the parent lays this
      // element out, so any x/y it carries is a leftover from being drawn
      // or from a time its parent was not a layout container, and writing
      // it here shifted the box by that much the moment a text was
      // placed inside it. see docs/notes/parse-position-absolute-in-flex.md
      lines.push(`position: relative;`);
      lines.push(`left: ${left(0)};`);
      lines.push(`top: ${top(0)};`);
    }
  } else {
    lines.push(`position: ${el.position};`);
    if (el.position !== 'static') {
      lines.push(`left: ${left(el.x)};`);
      lines.push(`top: ${top(el.y)};`);
    }
  }

  // customProperties always go last, in insertion order. They round-trip
  // through the file untouched — except when the typed branches above
  // already emitted a declaration for the same CSS property name. That
  // happens when a file has duplicate declarations (`height: 100%;
  // height: 100vh;`) where one value routes to a typed field and the
  // other lands in customProperties: emitting both would re-create the
  // duplicate on every save. Typed wins; the customProperties echo is
  // dropped. The in-memory `customProperties` bag stays as-is, and the
  // next round-trip parse won't re-populate it from a file that no
  // longer has the conflicting declaration.
  //
  // `customProperties` keys owned by a togglable group (e.g.
  // `background-image` → background) route through `emit(group, …)`
  // so they end up in the right comment block when the group is
  // toggled off.
  // `inline`, `inline-flex`, `contents` and the rest were raw CSS before
  // they had a field, and raw CSS goes last. Written in that same place,
  // a file that has one round-trips byte for byte — the published
  // contract fixture included. see docs/plans/checks-cleanup-plan.md
  if (el.displayOuter !== undefined && el.visibilityMode !== 'none') {
    lines.push(`display: ${displayKeyword(el.display, el.displayOuter)};`);
  }
  // The same for a margin with an `auto` side (`margin: 0 auto`) — on
  // the root too, which writes no other margin: as raw CSS it was kept
  // there, and an imported page centers its content that way.
  if (hasAutoSide(el.margin)) {
    lines.push(`margin: ${formatSpaceShorthand(el.margin)};`);
  }
  const emittedProps = collectEmittedPropNames(lines);
  for (const [key, value] of Object.entries(el.customProperties)) {
    if (emittedProps.has(key)) continue;
    const ownedBy = CUSTOM_PROP_TO_GROUP[key] ?? null;
    emit(ownedBy, `${key}: ${value};`);
  }

  // Toggled-off groups: emit a `/* <group> off */` label followed
  // by every commented declaration we captured for that group.
  // Iterates `el.toggledOffGroups` directly (already sorted +
  // deduped at commit time) so the on-disk order is stable.
  // One blank-line separator between blocks; one before the first
  // block when there are active lines above.
  for (const group of el.toggledOffGroups) {
    if (lines.length > 0) lines.push('');
    lines.push(`/* ${group} off */`);
    const commented = commentedByGroup.get(group);
    if (commented) {
      for (const c of commented) lines.push(c);
    }
  }

  return lines;
};


/**
 * Pull the CSS property names out of an array of `prop: value;` lines.
 * Used by both the base-element emitter and the breakpoint-override
 * emitter to guard the customProperties pass against duplicating a
 * property the typed branches already emitted.
 */
const collectEmittedPropNames = (lines: ReadonlyArray<string>): Set<string> => {
  const out = new Set<string>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    out.add(line.slice(0, colon).trim());
  }
  return out;
};


/**
 * Emit CSS declarations for a single breakpoint override. Unlike
 * `elementDeclarationLines` (which skips values equal to defaults),
 * this emits a declaration for every field explicitly set in the
 * override — the override's presence IS the user's intent.
 *
 * Paired with the element so width/height declarations can resolve
 * the mode+value combination. When only `widthMode` is in the
 * override, the value falls back to the element's base value.
 */
export const breakpointOverrideLines = (
  override: BreakpointOverride,
  element: ScampElement,
  /** Decides the `align-self` spelling; omitted by callers without one. */
  parent: ScampElement | null = null
): string[] => {
  const lines: string[] = [];
  const has = (k: keyof BreakpointOverride): boolean =>
    Object.prototype.hasOwnProperty.call(override, k);

  // Same two-buffer pattern as `elementDeclarationLines`. Toggled-
  // off groups inherit from the element's base-level
  // `toggledOffGroups` array — the toggle is element-scoped, so
  // overrides for an off group are also commented out.
  const commentedByGroup: Map<PropertyGroup, string[]> = new Map();
  const offGroups = new Set<PropertyGroup>(element.toggledOffGroups);
  const emit = (group: PropertyGroup | null, line: string): void => {
    if (group !== null && offGroups.has(group)) {
      const bucket = commentedByGroup.get(group);
      if (bucket) bucket.push(`/* ${line} */`);
      else commentedByGroup.set(group, [`/* ${line} */`]);
    } else {
      lines.push(line);
    }
  };

  // Width — needs both mode and value. Either being in the override
  // triggers emission. `widthCustom` (verbatim CSS for non-px units)
  // overrides the px fallback when present.
  if (has('widthMode') || has('widthValue') || has('widthCustom')) {
    const mode = override.widthMode ?? element.widthMode;
    const value = override.widthValue ?? element.widthValue;
    const custom = has('widthCustom')
      ? override.widthCustom
      : element.widthCustom;
    if (mode === 'stretch') lines.push(`width: 100%;`);
    else if (mode === 'fit-content') lines.push(`width: fit-content;`);
    else if (mode === 'fixed') {
      if (custom !== undefined && custom.length > 0) {
        lines.push(`width: ${custom};`);
      } else {
        lines.push(`width: ${value}px;`);
      }
    } else if (mode === 'auto') lines.push(`width: auto;`);
  }
  if (has('heightMode') || has('heightValue') || has('heightCustom')) {
    const mode = override.heightMode ?? element.heightMode;
    const value = override.heightValue ?? element.heightValue;
    const custom = has('heightCustom')
      ? override.heightCustom
      : element.heightCustom;
    if (mode === 'stretch') lines.push(`height: 100%;`);
    else if (mode === 'fit-content') lines.push(`height: fit-content;`);
    else if (mode === 'fixed') {
      if (custom !== undefined && custom.length > 0) {
        lines.push(`height: ${custom};`);
      } else {
        lines.push(`height: ${value}px;`);
      }
    } else if (mode === 'auto') lines.push(`height: auto;`);
  }

  // `min-height` override — free-form string. Setting it to undefined
  // explicitly means "clear the inherited min-height at this
  // breakpoint" and emits `min-height: 0` to override the base
  // declaration in the cascade.
  if (has('minHeight')) {
    if (override.minHeight !== undefined) {
      lines.push(`min-height: ${override.minHeight};`);
    } else {
      lines.push(`min-height: 0;`);
    }
  }

  // Display / visibility. `visibility: none` means `display: none` in
  // our model; emit that instead of the raw display value.
  if (has('visibilityMode') && override.visibilityMode === 'none') {
    lines.push('display: none;');
  } else if ((has('display') && override.display !== undefined) || has('displayOuter')) {
    // One keyword from both halves; an override that sets one inherits
    // the other from the base. This used to print `display` raw, so a
    // breakpoint set to Block wrote `display: none` and hid the element.
    const display = has('display') && override.display !== undefined ? override.display : element.display;
    const outer = has('displayOuter') ? override.displayOuter : element.displayOuter;
    lines.push(`display: ${displayKeyword(display, outer)};`);
  }
  if (has('flexDirection') && override.flexDirection) {
    lines.push(`flex-direction: ${override.flexDirection};`);
  }
  if (has('gap') && override.gap !== undefined) {
    lines.push(`gap: ${formatSpaceValue(override.gap)};`);
  }
  if (has('alignItems') && override.alignItems) {
    lines.push(`align-items: ${override.alignItems};`);
  }
  if (has('justifyContent') && override.justifyContent) {
    lines.push(`justify-content: ${override.justifyContent};`);
  }
  if (has('flexWrap') && override.flexWrap) {
    lines.push(`flex-wrap: ${override.flexWrap};`);
  }
  if (has('alignContent') && override.alignContent) {
    lines.push(`align-content: ${override.alignContent};`);
  }

  // Grid container fields — emit only when overridden at this
  // breakpoint. Empty template strings emit `none` to clear an
  // inherited grid template; the user can opt out of the grid by
  // overriding `display` instead.
  if (has('gridTemplateColumns') && override.gridTemplateColumns !== undefined) {
    const v = override.gridTemplateColumns;
    lines.push(`grid-template-columns: ${v.length > 0 ? v : 'none'};`);
  }
  if (has('gridTemplateRows') && override.gridTemplateRows !== undefined) {
    const v = override.gridTemplateRows;
    lines.push(`grid-template-rows: ${v.length > 0 ? v : 'none'};`);
  }
  if (has('columnGap') && override.columnGap !== undefined) {
    lines.push(`column-gap: ${formatSpaceValue(override.columnGap)};`);
  }
  if (has('rowGap') && override.rowGap !== undefined) {
    lines.push(`row-gap: ${formatSpaceValue(override.rowGap)};`);
  }
  if (has('justifyItems') && override.justifyItems) {
    lines.push(`justify-items: ${override.justifyItems};`);
  }

  // Grid item fields.
  if (has('gridColumn') && override.gridColumn !== undefined) {
    const v = override.gridColumn;
    if (v.length > 0) lines.push(`grid-column: ${v};`);
  }
  if (has('gridRow') && override.gridRow !== undefined) {
    const v = override.gridRow;
    if (v.length > 0) lines.push(`grid-row: ${v};`);
  }
  if (has('alignSelf') && override.alignSelf) {
    lines.push(
      `align-self: ${selfAlignForParent(override.alignSelf, parent?.display)};`
    );
  }
  if (has('justifySelf') && override.justifySelf) {
    lines.push(`justify-self: ${override.justifySelf};`);
  }

  // Flex item fields. An explicit empty basis clears an inherited one.
  if (has('flexGrow') && override.flexGrow !== undefined) {
    lines.push(`flex-grow: ${override.flexGrow};`);
  }
  if (has('flexShrink') && override.flexShrink !== undefined) {
    lines.push(`flex-shrink: ${override.flexShrink};`);
  }
  if (has('flexBasis') && override.flexBasis !== undefined) {
    const v = override.flexBasis.trim();
    lines.push(`flex-basis: ${v.length > 0 ? v : 'auto'};`);
  }
  if (has('order') && override.order !== undefined) {
    lines.push(`order: ${override.order};`);
  }

  if (has('padding') && override.padding) {
    lines.push(`padding: ${formatSpaceShorthand(override.padding)};`);
  }
  if (has('margin') && override.margin) {
    lines.push(`margin: ${formatSpaceShorthand(override.margin)};`);
  }

  if (has('backgroundColor') && override.backgroundColor !== undefined) {
    emit('background', `background: ${override.backgroundColor};`);
  }
  if (has('borderRadius') && override.borderRadius) {
    emit('border', `border-radius: ${formatSpaceShorthand(override.borderRadius)};`);
  }
  if (has('borderWidth') && override.borderWidth) {
    emit('border', `border-width: ${formatSpaceShorthand(override.borderWidth)};`);
  }
  if (has('borderStyle') && override.borderStyle) {
    emit('border', `border-style: ${override.borderStyle};`);
  }
  if (has('borderColor') && override.borderColor !== undefined) {
    emit('border', `border-color: ${override.borderColor};`);
  }

  // SVG paint overrides — mirror the base-level emission so per-breakpoint
  // / per-state icon colours round-trip.
  if (has('fill') && override.fill !== undefined) {
    lines.push(`fill: ${override.fill};`);
  }
  if (has('stroke') && override.stroke !== undefined) {
    lines.push(`stroke: ${override.stroke};`);
  }
  if (has('strokeWidth') && override.strokeWidth !== undefined) {
    lines.push(`stroke-width: ${override.strokeWidth}px;`);
  }

  // Opacity + visibility are NOT togglable — always active.
  if (has('opacity') && override.opacity !== undefined) {
    lines.push(`opacity: ${override.opacity};`);
  }
  if (has('visibilityMode') && override.visibilityMode === 'hidden') {
    lines.push('visibility: hidden;');
  } else if (has('visibilityMode') && override.visibilityMode === 'visible') {
    lines.push('visibility: visible;');
  }

  // Box shadows — empty list at a breakpoint or state scope emits
  // `box-shadow: none` so the cascade explicitly clears the inherited
  // shadow rather than silently leaving it in place.
  if (has('boxShadows') && override.boxShadows !== undefined) {
    if (override.boxShadows.length === 0) {
      emit('shadow', 'box-shadow: none;');
    } else {
      emit('shadow', `box-shadow: ${formatBoxShadowShorthand(override.boxShadows)};`);
    }
  }

  // Blend modes — present-in-override means the user chose a value at
  // this scope. Writing `normal` explicitly clears an inherited
  // non-normal base (the convention transitions / box-shadow use with
  // `none`). Cascading-by-omission is what the user gets by not
  // touching the dropdown at all.
  if (has('mixBlendMode') && override.mixBlendMode !== undefined) {
    emit('blend', `mix-blend-mode: ${override.mixBlendMode};`);
  }
  if (
    has('backgroundBlendMode') &&
    override.backgroundBlendMode !== undefined
  ) {
    emit('blend', `background-blend-mode: ${override.backgroundBlendMode};`);
  }

  // Filters — empty list at a breakpoint or state scope emits
  // `filter: none` (or `backdrop-filter: none`) so the cascade
  // explicitly clears the inherited list rather than silently
  // leaving it in place. Same convention as transitions and shadows.
  if (has('filters') && override.filters !== undefined) {
    if (override.filters.length === 0) {
      emit('filters', 'filter: none;');
    } else {
      emit('filters', `filter: ${formatFilterList(override.filters)};`);
    }
  }
  // Transform — an empty list at a state or breakpoint emits
  // `transform: none` to clear an inherited one; an empty origin clears
  // to the CSS initial. Same convention as filters and shadows.
  if (has('transforms') && override.transforms !== undefined) {
    if (override.transforms.length === 0) {
      emit('transform', 'transform: none;');
    } else {
      emit('transform', `transform: ${formatTransformList(override.transforms)};`);
    }
  }
  if (has('transformOrigin') && override.transformOrigin !== undefined) {
    const v = override.transformOrigin.trim();
    emit('transform', `transform-origin: ${v.length > 0 ? v : '50% 50%'};`);
  }
  if (has('backdropFilters') && override.backdropFilters !== undefined) {
    if (override.backdropFilters.length === 0) {
      emit('filters', 'backdrop-filter: none;');
    } else {
      emit('filters', `backdrop-filter: ${formatFilterList(override.backdropFilters)};`);
    }
  }

  // Transitions — empty list at a breakpoint emits `transition: none`
  // so the cascade explicitly clears the inherited list rather than
  // silently leaving it in place.
  if (has('transitions') && override.transitions !== undefined) {
    if (override.transitions.length === 0) {
      emit('transitions', 'transition: none;');
    } else {
      emit('transitions', `transition: ${formatTransitionShorthand(override.transitions)};`);
    }
  }

  // Animation — only set on `StateOverride` (which extends
  // `BreakpointOverride` with `animation?`). The branch is
  // unreachable for an actual breakpoint override per the type
  // system. Keeping the check `has('animation')` rather than a
  // narrower cast so the emitter stays simple.
  if (has('animation')) {
    const anim = (override as { animation?: import('../element').ElementAnimation })
      .animation;
    if (anim) {
      emit('animation', `animation: ${formatAnimationShorthand(anim)};`);
    } else {
      // Explicit `animation: none` to clear an inherited animation.
      emit('animation', 'animation: none;');
    }
  }

  // Text properties — only meaningful on text elements but cheap to
  // emit based on presence in the override.
  if (has('fontFamily') && override.fontFamily !== undefined) {
    emit('typography', `font-family: ${override.fontFamily};`);
  }
  if (has('fontSize') && override.fontSize !== undefined) {
    emit('typography', `font-size: ${override.fontSize};`);
  }
  if (has('fontWeight') && override.fontWeight !== undefined) {
    emit('typography', `font-weight: ${override.fontWeight};`);
  }
  if (has('color') && override.color !== undefined) {
    emit('typography', `color: ${override.color};`);
  }
  if (has('textAlign') && override.textAlign !== undefined) {
    emit('typography', `text-align: ${override.textAlign};`);
  }
  if (has('lineHeight') && override.lineHeight !== undefined) {
    emit('typography', `line-height: ${override.lineHeight};`);
  }
  if (has('letterSpacing') && override.letterSpacing !== undefined) {
    emit('typography', `letter-spacing: ${override.letterSpacing};`);
  }

  // Position — emit the typed `position` keyword first when set at
  // this breakpoint, then x/y as left/top. `position: 'auto'` at a
  // breakpoint means "fall back to the cascade" — we don't emit
  // anything, the inherited position keyword applies.
  if (has('position') && override.position && override.position !== 'auto') {
    lines.push(`position: ${override.position};`);
  }
  if (has('x') && override.x !== undefined) {
    lines.push(`left: ${override.x}px;`);
  }
  if (has('y') && override.y !== undefined) {
    lines.push(`top: ${override.y}px;`);
  }

  // customProperties: free-form CSS the user / agent wrote at this
  // breakpoint. Emitted verbatim, in insertion order, last — except
  // when a typed branch above already emitted the same CSS prop
  // (duplicate-declaration scenario, see the base-element emitter for
  // the long version). Group-owned keys (e.g. `background-image`
  // → background) route through `emit(group, …)` so they end up
  // in the right comment block when the group is toggled off.
  if (override.customProperties) {
    const emittedProps = collectEmittedPropNames(lines);
    for (const [key, value] of Object.entries(override.customProperties)) {
      if (emittedProps.has(key)) continue;
      const ownedBy = CUSTOM_PROP_TO_GROUP[key] ?? null;
      emit(ownedBy, `${key}: ${value};`);
    }
  }

  // Toggled-off group comment blocks — same emission pattern as
  // `elementDeclarationLines`. Appended after the active override
  // declarations, in canonical (sorted) order so on-disk text
  // stays stable. Iterates the element's `toggledOffGroups`
  // because the toggle is element-scoped.
  for (const group of element.toggledOffGroups) {
    const commented = commentedByGroup.get(group);
    if (!commented || commented.length === 0) continue;
    if (lines.length > 0) lines.push('');
    lines.push(`/* ${group} off */`);
    for (const c of commented) lines.push(c);
  }

  return lines;
};


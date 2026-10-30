// see docs/notes/round-trip-contract.md — why both sides must read these
import type { BoxShadowDef, FilterDef, PropertyGroup, TransformDef } from './element';
import type { SpaceTuple } from './spaceValue';

/**
 * Default style values applied to every newly-created rectangle.
 *
 * The code generator only emits properties that differ from this object,
 * which keeps generated CSS clean. The parser applies these as a baseline
 * before overlaying parsed values, so missing properties round-trip as
 * defaults.
 */
export const DEFAULT_RECT_STYLES = {
  display: 'none' as const,
  flexDirection: 'row' as const,
  gap: 0,
  // CSS defaults `align-items` to `stretch`, and the generator omits the
  // declaration when it equals this baseline — so a file with no
  // `align-items` stretches in the browser. Defaulting the model to
  // `flex-start` made the canvas alone apply flex-start, and every flex
  // container that never set the property rendered differently from the
  // preview. see docs/notes/align-items-default.md
  alignItems: 'stretch' as const,
  // `justify-content` genuinely defaults to `flex-start` in CSS, so this
  // one already agreed.
  justifyContent: 'flex-start' as const,
  flexWrap: 'nowrap' as const,
  alignContent: 'normal' as const,
  gridTemplateColumns: '',
  gridTemplateRows: '',
  columnGap: 0,
  rowGap: 0,
  justifyItems: 'stretch' as const,
  gridColumn: '',
  gridRow: '',
  // `auto` is CSS's initial value (inherit the parent's `align-items`).
  // `stretch` is a real, different value once the parent isn't
  // stretching, so it can't double as "unset".
  alignSelf: 'auto' as const,
  justifySelf: 'stretch' as const,
  flexGrow: 0,
  flexShrink: 1,
  flexBasis: '',
  order: 0,
  padding: [0, 0, 0, 0] as SpaceTuple,
  margin: [0, 0, 0, 0] as SpaceTuple,
  widthMode: 'fixed' as const,
  widthValue: 100,
  heightMode: 'fixed' as const,
  heightValue: 100,
  backgroundColor: 'transparent',
  borderRadius: [0, 0, 0, 0] as SpaceTuple,
  borderWidth: [0, 0, 0, 0] as SpaceTuple,
  borderStyle: 'none' as const,
  borderColor: '#000000',
  opacity: 1,
  visibilityMode: 'visible' as const,
  mixBlendMode: 'normal' as const,
  backgroundBlendMode: 'normal' as const,
  position: 'auto' as const,
  boxShadows: [] as ReadonlyArray<BoxShadowDef>,
  filters: [] as ReadonlyArray<FilterDef>,
  backdropFilters: [] as ReadonlyArray<FilterDef>,
  transforms: [] as ReadonlyArray<TransformDef>,
  transformOrigin: '',
  transitions: [] as ReadonlyArray<{
    property: string;
    durationMs: number;
    easing: string;
    delayMs: number;
  }>,
  inlineFragments: [] as ReadonlyArray<
    | { kind: 'text'; value: string; afterChildIndex: number }
    | { kind: 'jsx'; source: string; afterChildIndex: number }
  >,
  toggledOffGroups: [] as ReadonlyArray<PropertyGroup>,
};

export type DefaultRectStyles = typeof DEFAULT_RECT_STYLES;

/**
 * Defaults for the page-root element.
 *
 * The root is treated like any other rectangle for emission purposes —
 * there's no root-specific sizing branch in `generateCode` — but its
 * DEFAULTS differ: a white page background, and web-idiomatic
 * sizing (`width: 100%; height: auto`) that works outside Scamp
 * without assuming a specific viewport.
 *
 * Both `generateCode` and `parseCode` use this object as the baseline
 * for the root so the user can override any property from the panel
 * and have them round-trip cleanly.
 *
 * The `widthValue` / `heightValue` numbers are fallbacks used only
 * when the user switches the corresponding mode to 'fixed' from the
 * panel — they have no effect in the default stretch/auto mode.
 */
export const DEFAULT_ROOT_STYLES = {
  display: 'none' as const,
  flexDirection: 'row' as const,
  gap: 0,
  // CSS defaults `align-items` to `stretch`, and the generator omits the
  // declaration when it equals this baseline — so a file with no
  // `align-items` stretches in the browser. Defaulting the model to
  // `flex-start` made the canvas alone apply flex-start, and every flex
  // container that never set the property rendered differently from the
  // preview. see docs/notes/align-items-default.md
  alignItems: 'stretch' as const,
  // `justify-content` genuinely defaults to `flex-start` in CSS, so this
  // one already agreed.
  justifyContent: 'flex-start' as const,
  flexWrap: 'nowrap' as const,
  alignContent: 'normal' as const,
  gridTemplateColumns: '',
  gridTemplateRows: '',
  columnGap: 0,
  rowGap: 0,
  justifyItems: 'stretch' as const,
  gridColumn: '',
  gridRow: '',
  // `auto` is CSS's initial value (inherit the parent's `align-items`).
  // `stretch` is a real, different value once the parent isn't
  // stretching, so it can't double as "unset".
  alignSelf: 'auto' as const,
  justifySelf: 'stretch' as const,
  flexGrow: 0,
  flexShrink: 1,
  flexBasis: '',
  order: 0,
  padding: [0, 0, 0, 0] as SpaceTuple,
  margin: [0, 0, 0, 0] as SpaceTuple,
  widthMode: 'stretch' as const,
  widthValue: 1440,
  heightMode: 'auto' as const,
  heightValue: 900,
  /**
   * Page-root gets a `100vh` floor so generated pages have a visible
   * height in any browser (preview / `next dev` / production). Without
   * this, the root collapses to 0px because absolute children don't
   * contribute to its box. Users can override per-element via the
   * panel or per-breakpoint by setting a different `minHeight`.
   */
  minHeight: '100vh' as string,
  // What a browser draws for a root with no background; the canvas frame
  // supplies the white behind it.
  backgroundColor: 'transparent',
  borderRadius: [0, 0, 0, 0] as SpaceTuple,
  borderWidth: [0, 0, 0, 0] as SpaceTuple,
  borderStyle: 'none' as const,
  borderColor: '#000000',
  opacity: 1,
  visibilityMode: 'visible' as const,
  mixBlendMode: 'normal' as const,
  backgroundBlendMode: 'normal' as const,
  position: 'auto' as const,
  boxShadows: [] as ReadonlyArray<BoxShadowDef>,
  filters: [] as ReadonlyArray<FilterDef>,
  backdropFilters: [] as ReadonlyArray<FilterDef>,
  transforms: [] as ReadonlyArray<TransformDef>,
  transformOrigin: '',
  transitions: [] as ReadonlyArray<{
    property: string;
    durationMs: number;
    easing: string;
    delayMs: number;
  }>,
  inlineFragments: [] as ReadonlyArray<
    | { kind: 'text'; value: string; afterChildIndex: number }
    | { kind: 'jsx'; source: string; afterChildIndex: number }
  >,
  toggledOffGroups: [] as ReadonlyArray<PropertyGroup>,
};

export type DefaultRootStyles = typeof DEFAULT_ROOT_STYLES;

/**
 * Defaults for a COMPONENT-root element. Identical to the page-root
 * defaults EXCEPT there is no `100vh` min-height floor: a component is
 * embedded inside a page, not a full page itself, so forcing viewport
 * height blows out its layout in previews and on live sites. The root
 * sizes to its content unless the user sets an explicit min-height.
 * see docs/notes/component-min-height-floor.md
 */
export const DEFAULT_COMPONENT_ROOT_STYLES = {
  ...DEFAULT_ROOT_STYLES,
  minHeight: undefined as string | undefined,
};

export type DefaultComponentRootStyles = typeof DEFAULT_COMPONENT_ROOT_STYLES;

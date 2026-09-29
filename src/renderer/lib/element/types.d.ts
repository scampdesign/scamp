/**
 * Canonical canvas element type. Mirrors the Element shape from prd-scamp-poc.md
 * §"Zustand State Shape". Both `generateCode` and `parseCode` (added in M3)
 * operate on a flat `Record<string, ScampElement>` keyed by id.
 */
import type { SpaceValue, SpaceTuple } from '../spaceValue';
/**
 * Attribute that carries an imported inline SVG's source-file reference
 * (relative path under `public/assets`). Stored in the element's generic
 * `attributes` bag so it round-trips through the TSX verbatim, and read by
 * the file-watch reload to locate the on-disk source. see
 * docs/plans/svg-color-editing-plan.md
 */
import type { TextRun } from '../textRuns';
export declare const SVG_SRC_ATTR = "data-scamp-svg-src";
export type WidthMode = 'fixed' | 'stretch' | 'fit-content' | 'auto';
export type HeightMode = 'fixed' | 'stretch' | 'fit-content' | 'auto';
/**
 * The fixed taxonomy of CSS-property "groups" the panel surfaces
 * as togglable section headers. See
 * `src/renderer/lib/propertyGroups.ts` for the group → field
 * mapping and the helper functions that consume it.
 *
 * Lives in this module (rather than propertyGroups.ts) so
 * `ScampElement.toggledOffGroups` can be typed without a circular
 * import — propertyGroups.ts imports `ScampElement` itself.
 *
 * Sizing, Layout, and Visibility are deliberately NOT togglable
 * — see `propertyGroups.ts`'s module doc for the rationale.
 */
export type PropertyGroup = 'background' | 'border' | 'shadow' | 'typography' | 'filters' | 'blend' | 'transform' | 'transitions' | 'animation';
/**
 * `display` values the panel models directly. `'none'` here is the
 * "block" mode (no flex / no grid layout) — visibility:none is a
 * separate concept in `visibilityMode`. Naming keeps the legacy
 * meaning of `'none'` as "neither flex nor grid" so existing files
 * round-trip.
 */
export type DisplayMode = 'none' | 'flex' | 'grid';
export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';
export type AlignItems = 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
export type JustifyContent = 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
/**
 * `align-content` — how wrapped lines pack along the cross axis. Only
 * meaningful when `flexWrap` is not `nowrap`. `'normal'` is CSS's own
 * initial value and emits nothing.
 */
export type AlignContent = 'normal' | 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly' | 'stretch';
/**
 * `align-self`, for a flex OR grid child. `'auto'` is CSS's initial value
 * — inherit the parent's `align-items` — and emits nothing. Stored in the
 * short spelling; the generator writes `flex-start` / `flex-end` under a
 * flex parent and `start` / `end` under a grid one, and the parser accepts
 * both everywhere.
 */
export type SelfAlign = 'auto' | 'start' | 'center' | 'end' | 'stretch' | 'baseline';
/**
 * Used for grid-only alignment controls (`justify-items`,
 * `align-self`, `justify-self`). Modern CSS accepts the same short
 * keywords on grid containers AND the longer `flex-start`/`flex-end`
 * on grid containers, so the existing flex-flavoured `alignItems`
 * field keeps working untouched on grid elements.
 */
export type GridSelfAlign = 'start' | 'center' | 'end' | 'stretch';
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';
/**
 * CSS `position`. `'auto'` is a Scamp-only sentinel meaning "let
 * Scamp pick" — the generator emits `position: relative` for the
 * page root, `position: absolute` for non-flex/non-grid children,
 * and no declaration at all for flex/grid children. Setting any
 * other value pins it: that value is emitted exactly as written.
 */
export type Position = 'auto' | 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
/** Any CSS numeric font weight (1–1000); validated at the parse boundary. */
export type FontWeight = number;
export type TextAlign = 'left' | 'center' | 'right';
/** One row of a repeat's sample list. */
export type SampleRow = Record<string, string | number>;
/** A sample value stored on the view root: a show flag or a repeat's rows. */
export type SampleValue = string | boolean | SampleRow[];
export type RepeatBinding = {
    /** The list prop. */
    over: string;
    /** The row variable, e.g. `player`. */
    as: string;
    /** The row field used as the React key; `id` when absent and present in the rows. */
    key?: string;
};
export type ElementType = 'rectangle' | 'text' | 'image' | 'input' | 'component-instance';
/**
 * One non-Scamp inline fragment between (or around) the element
 * children of a Scamp parent — either a loose text node or an
 * unclassed JSX subtree captured verbatim from the source. Preserved
 * in DOM source order so the generator can interleave them with
 * element children at emit time.
 *
 * `afterChildIndex`:
 *   -1 → before the parent's first element child
 *    n → after `parent.childIds[n]`
 *
 * Multiple fragments at the same index are emitted in capture order.
 */
export type InlineFragment = {
    kind: 'text';
    value: string;
    afterChildIndex: number;
} | {
    kind: 'jsx';
    source: string;
    afterChildIndex: number;
};
/**
 * The named easing keywords the WYSIWYG dropdown offers. The parser
 * also accepts arbitrary `cubic-bezier(...)` expressions and stores
 * them verbatim in this same field — the panel renders those as the
 * `Custom…` row.
 */
export type TransitionEasing = 'ease' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | string;
/**
 * One row of the Transitions section. The CSS shorthand
 * `transition: opacity 200ms ease, transform 300ms ease-in-out 100ms`
 * round-trips as a list of these.
 *
 * Duration and delay are stored in canonical milliseconds. The UI
 * tracks the user's preferred unit (ms vs s) in component-local
 * state so they can toggle without a stored field.
 *
 * `property` is a free-form string at the data layer so that
 * agent-written transitions on properties outside the dropdown set
 * (e.g. `box-shadow`) round-trip cleanly. The UI surface restricts
 * the dropdown options.
 */
export type TransitionDef = {
    property: string;
    durationMs: number;
    easing: TransitionEasing;
    delayMs: number;
};
/**
 * One entry in a `<select>` element's option list. Options are not
 * canvas elements — they're managed as a typed list on the parent
 * select element and emitted as inline JSX children at generate time.
 */
export type SelectOption = {
    value: string;
    label: string;
    selected?: boolean;
};
/**
 * The names of curated preset animations Scamp ships in its picker.
 * Stored on the element when the user selects from the picker; on
 * round-trip, names matching this list AND with a canonical
 * keyframes body are recognised back to the picker. Anything else
 * is preserved verbatim as `isPreset: false`.
 *
 * Order here matches the picker's grouping (entrances, exits,
 * attention, subtle) for predictable iteration.
 */
export type AnimationPresetName = 'fade-in' | 'fade-in-up' | 'fade-in-down' | 'slide-in-left' | 'slide-in-right' | 'scale-in' | 'bounce-in' | 'fade-out' | 'fade-out-up' | 'slide-out-left' | 'slide-out-right' | 'scale-out' | 'pulse' | 'shake' | 'bounce' | 'spin' | 'ping' | 'float' | 'wiggle';
export type AnimationDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
export type AnimationFillMode = 'none' | 'forwards' | 'backwards' | 'both';
export type AnimationPlayState = 'running' | 'paused';
/**
 * One CSS animation applied to an element. Stored as typed fields so
 * the panel can render proper controls; serialised back to the
 * `animation` shorthand on emit.
 *
 * `isPreset` records whether the name matched the preset library at
 * parse time AND whether the keyframes body matched the canonical
 * preset body — both must be true for the picker to show "Preset:
 * fade-in-up". A preset name with an agent-edited body shows as
 * "Custom (was fade-in-up)".
 *
 * `easing` is a free-form string at the data layer so that
 * agent-written easings outside the typed dropdown (`cubic-bezier(...)`,
 * `steps(...)`, etc.) round-trip cleanly.
 */
export type ElementAnimation = {
    name: string;
    isPreset: boolean;
    durationMs: number;
    easing: string;
    delayMs: number;
    iterationCount: number | 'infinite';
    direction: AnimationDirection;
    fillMode: AnimationFillMode;
    playState: AnimationPlayState;
};
/**
 * The full set of CSS blend-mode keywords Scamp models as a typed
 * field. Matches the WYSIWYG dropdown groups (Darken / Lighten /
 * Contrast / Inversion / Component) plus the default `normal`.
 * Anything outside this list — `plus-darker`, `plus-lighter`,
 * vendor-prefixed, future spec additions — is preserved verbatim
 * via `customProperties`.
 *
 * Used for both `mix-blend-mode` and `background-blend-mode`. The
 * keyword set is identical for the two properties.
 */
export type BlendMode = 'normal' | 'multiply' | 'darken' | 'color-burn' | 'screen' | 'lighten' | 'color-dodge' | 'overlay' | 'soft-light' | 'hard-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
/**
 * One box-shadow applied to an element. Stored as typed fields so
 * the panel can render proper controls; serialised back into the
 * `box-shadow` shorthand on emit. Multiple shadows on one element
 * become a comma-separated list, in the order stored here.
 *
 * `inset` flips the shadow from outside the box (default) to inside.
 * The CSS spec allows the `inset` keyword either before or after the
 * lengths and color; the generator always emits it leading
 * (`inset 0 4px 8px ...`) for consistency.
 *
 * `color` is a free-form string at the data layer so token refs
 * (`var(--shadow-color)`), `currentColor`, named colors, and
 * `rgba(...)` round-trip cleanly. The panel surfaces a ColorInput
 * for the common case and falls back to the raw text for anything
 * exotic.
 */
export type BoxShadowDef = {
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: string;
    inset: boolean;
};
/**
 * The set of CSS filter functions Scamp models as typed entries.
 * Each kind carries a single numeric argument in its canonical unit:
 *
 *   - blur        → px  (length)
 *   - hue-rotate  → deg (angle)
 *   - everything else → % (percentage)
 *
 * Functions outside this set (`drop-shadow`, `url(...)`, vendor
 * prefixes) refuse from the mapper and round-trip verbatim via
 * `customProperties`.
 */
export type FilterKind = 'blur' | 'brightness' | 'contrast' | 'grayscale' | 'hue-rotate' | 'invert' | 'opacity' | 'saturate' | 'sepia';
/**
 * One CSS filter function applied to an element. The kind picks
 * which function name is emitted and the unit; `value` is the
 * numeric argument in that unit (percent kinds use 100 = 100%,
 * not 1.0, so the panel renders the value the user types directly).
 *
 * Used for both `filter` and `backdrop-filter` — the two lists are
 * independent fields on the element but share this row shape.
 */
export type FilterDef = {
    kind: FilterKind;
    value: number;
};
/**
 * One function in a `transform` list. Translate offsets are CSS lengths
 * kept verbatim (`10px`, `-50%`, `var(--x)`) because percentages are the
 * common case for centring; angles are degrees; scale factors are plain
 * numbers. The axis-specific spellings (`translateX`, `scaleY`, …) parse
 * into these two-axis forms and are written back as such.
 */
export type TransformKind = 'translate' | 'rotate' | 'scale' | 'skew';
export type TransformDef = {
    kind: 'translate';
    x: string;
    y: string;
} | {
    kind: 'rotate';
    angle: number;
} | {
    kind: 'scale';
    x: number;
    y: number;
} | {
    kind: 'skew';
    x: number;
    y: number;
};
/**
 * One `@keyframes` rule on a page, preserved at the page level
 * because keyframes are shared resources — multiple elements can
 * reference the same `fade-in-up` block. Mirrors the
 * `customMediaBlocks` shape: `body` is the verbatim declaration
 * list (the part between the outer braces).
 */
export type KeyframesBlock = {
    /** The keyframe name as written, e.g. `fade-in-up`. */
    name: string;
    /** Verbatim declaration block content, including all rule blocks
     *  and comments, formatted as the source had it. */
    body: string;
    /** True when `name` matches a preset AND `body` is structurally
     *  equivalent to the canonical preset body. False for
     *  agent-written, edited, or unknown-named blocks. */
    isPreset: boolean;
};
export type ScampElement = {
    id: string;
    type: ElementType;
    parentId: string | null;
    childIds: string[];
    /**
     * Optional HTML tag override. When undefined, the element renders /
     * generates as the default for its type:
     *   - rectangles → `div`
     *   - text → `p`
     *   - image → `img`
     *   - input → `input`
     *
     * Setting this lets agents and hand-written files use semantic tags
     * like `h1`, `h2`, `section`, `header`, `nav`, etc. — the parser
     * captures whatever's in the file, the generator emits it back, and
     * the canvas renders the real tag (so styles like h1's default font
     * size match what the user will see in production).
     */
    tag?: string;
    /**
     * Generic HTML attribute bag — mirrors how `customProperties` works
     * for CSS. Tag-specific panel fields write here (`href`, `target`,
     * `method`, `action`, `datetime`, `for`, `cite`, `controls`,
     * `autoplay`, `type` for button/input, etc.) and the parser collects
     * any attribute it isn't already typed to handle. Boolean attributes
     * are stored as the empty string `""` and emitted bare.
     */
    attributes?: Record<string, string>;
    /**
     * Only meaningful when `tag === 'select'`. The options the select
     * renders. Stored as a list on the element rather than as nested
     * canvas elements so they can be edited inline in the properties
     * panel without cluttering the layers tree.
     */
    selectOptions?: ReadonlyArray<SelectOption>;
    /**
     * Only meaningful when `tag === 'svg'`. The raw inner source between
     * the `<svg>` open and close tags, preserved verbatim so the
     * generator can re-emit it byte-for-byte. Rendered (sanitized) on the
     * canvas via ElementRenderer. see docs/plans/svg-improvements-plan.md
     */
    svgSource?: string;
    /**
     * Element-level SVG paint, edited from the SvgSection. `fill` / `stroke`
     * are colour strings; `strokeWidth` is px. They cascade to the svg's
     * shapes (whose own fill/stroke are stripped on import) so the icon can
     * be recoloured without touching `svgSource`. Optional — emitted only
     * when set, parsed back from the matching CSS declarations.
     */
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    /**
     * Optional human-readable name. When set, the slugified version
     * replaces the default `rect` / `text` prefix in the generated CSS
     * class name (e.g. "Hero Card" → `hero_card_a1b2`). Stored already
     * slugified — the class prefix IS the name, which is how parseCode
     * recovers it. Duplicates keep it; only the id suffix changes.
     */
    name?: string;
    widthMode: WidthMode;
    widthValue: number;
    heightMode: HeightMode;
    heightValue: number;
    /**
     * Optional verbatim CSS length string for `width`. Only meaningful
     * when `widthMode === 'fixed'`. When set, the generator emits this
     * string instead of `${widthValue}px` so non-px units (`vh`, `vw`,
     * `em`, `rem`, `calc(...)`, `var(--…)`, …) round-trip exactly as
     * the user / agent wrote them.
     *
     * `widthValue` is still maintained as a best-effort integer-px
     * fallback so the canvas resize math (drag-handles, fit-to-bounds)
     * has something concrete to work with — for `100vh` we store
     * `widthValue: 100`, for `calc(100% - 20px)` we store `0` (or the
     * last known px value).
     *
     * Cleared (set to `undefined`) when the user types a plain px value
     * or switches to a non-fixed mode.
     */
    widthCustom?: string;
    /** As `widthCustom` but for `height`. See that field's docs. */
    heightCustom?: string;
    x: number;
    y: number;
    /**
     * `position` mode. Default `'auto'` lets the generator pick based
     * on tree shape (root → relative, non-flex child → absolute, flex
     * child → none). Any other value pins the position and gets
     * emitted as-is. Useful for sticky navbars, fixed overlays, etc.
     */
    position: Position;
    display: DisplayMode;
    flexDirection: FlexDirection;
    /** Stored as either px (number) or a `var(--token)` reference.
     *  See `spaceValue.ts` for the union shape and helpers. */
    gap: SpaceValue;
    alignItems: AlignItems;
    justifyContent: JustifyContent;
    flexWrap: FlexWrap;
    /** Cross-axis packing of wrapped lines. Ignored by the browser (and by
     *  the panel) unless `flexWrap` is set. */
    alignContent: AlignContent;
    /**
     * Grid-only container fields. Free-text template strings (so
     * `repeat(3, 1fr)`, `auto-fill`, `minmax(...)`, etc. round-trip
     * unmolested) and per-axis gaps. Per-axis gaps share the `SpaceValue`
     * shape — px or `var(--token)`. `justifyItems` is grid-only — flex
     * uses `justifyContent` for the same axis.
     */
    gridTemplateColumns: string;
    gridTemplateRows: string;
    columnGap: SpaceValue;
    rowGap: SpaceValue;
    justifyItems: GridSelfAlign;
    /**
     * Grid-item fields — applied when this element's PARENT is a grid
     * container. Free-text `gridColumn` / `gridRow` so `span 2`,
     * `1 / 3`, named-line refs etc. round-trip.
     */
    gridColumn: string;
    gridRow: string;
    alignSelf: SelfAlign;
    justifySelf: GridSelfAlign;
    /**
     * Flex-item fields — applied when this element's PARENT is a flex
     * container. `flexBasis` is free text (`200px`, `0%`, `auto`,
     * `var(--w)`) with `''` meaning auto / unset. `order` also applies to
     * grid items. The drawn-size guard is `flexShrink: 0`, stored here so
     * the file carries it — see docs/notes/draw-into-flex-parent.md.
     */
    flexGrow: number;
    flexShrink: number;
    flexBasis: string;
    order: number;
    /** Per-side `[top, right, bottom, left]`. Each side is a
     *  `SpaceValue` — px or `var(--token)`. See `spaceValue.ts`. */
    padding: SpaceTuple;
    margin: SpaceTuple;
    /**
     * Optional CSS `min-height` as a free-form string (so `100vh`,
     * `500px`, `var(--page-min-h)`, `calc(...)` round-trip without a
     * parallel "raw" field). Undefined when no `min-height` is declared
     * for the element. The page-root defaults to `'100vh'` via
     * `DEFAULT_ROOT_STYLES` so generated pages have a visible height in
     * any browser; non-root elements default to undefined and only emit
     * a declaration when the user / agent sets one explicitly.
     */
    minHeight?: string;
    backgroundColor: string;
    /** Corner radii `[TL, TR, BR, BL]`. Each is a `SpaceValue`. */
    borderRadius: SpaceTuple;
    /** Per-side border widths `[top, right, bottom, left]`. Each is
     *  a `SpaceValue`. */
    borderWidth: SpaceTuple;
    borderStyle: BorderStyle;
    borderColor: string;
    /** CSS `opacity` as a 0..1 number. Default 1. */
    opacity: number;
    /**
     * Visibility state. Maps to CSS as:
     *   - 'visible' → no declaration emitted
     *   - 'hidden'  → `visibility: hidden;`
     *   - 'none'    → `display: none;` (suppresses flex emits)
     */
    visibilityMode: 'visible' | 'hidden' | 'none';
    /**
     * CSS `mix-blend-mode`. Default `'normal'` emits no declaration.
     * Any other value emits `mix-blend-mode: <value>` so the cascade
     * makes the element blend with content behind it. Round-trips
     * through `parseCode` via `cssToScampProperty`.
     */
    mixBlendMode: BlendMode;
    /**
     * CSS `background-blend-mode`. Default `'normal'` emits no
     * declaration. Only meaningful when both a background color and
     * a background image are set on the element — the panel hides
     * the control otherwise, but the data model permits it freely so
     * agent edits round-trip.
     */
    backgroundBlendMode: BlendMode;
    text?: string;
    /**
     * The same content as styled RUNS, when any part of it is styled
     * differently from the rest.
     *
     * **Absent means one unstyled run of `text`**, which is every element
     * in every project today — nothing writes this yet. `runsOf` in
     * `@lib/textRuns` is the view that treats the two the same, so callers
     * do not branch on which shape an element happens to have.
     *
     * It exists so `alongside` in "works alongside AI" can be three words
     * of a different colour rather than a child element. Making it a child
     * is what forces the "a host with children cannot also hold words"
     * rule, which splits the sentence, which loses the spaces around it.
     * see docs/plans/inline-spans-plan.md
     */
    runs?: ReadonlyArray<TextRun>;
    /**
     * Component-side prop name (component editor only), or, inside a
     * repeat, a row path (`player.label`). see docs/notes/components-data-model.md
     * and docs/notes/view-bindings.md
     */
    prop?: string;
    /**
     * Attribute bindings: attribute (or, on an instance, prop) name → the
     * prop it binds to. A boolean attribute inverted is `!name`; inside a
     * repeat the value may be a row path. The literal in `attributes` /
     * `propOverrides` is the sample. see docs/notes/view-bindings.md
     */
    bind?: Record<string, string>;
    /** Event bindings: `onClick` → the handler prop name. */
    on?: Record<string, string>;
    /** This element renders once per row of the list prop `over`. */
    repeat?: RepeatBinding;
    /** This element renders only when the boolean prop is true. */
    showIf?: string;
    /**
     * Root only: the sample values that have no element to live on — the
     * booleans behind `showIf` and the rows behind `repeat`. Text and
     * attribute samples stay on their elements. see docs/notes/view-bindings.md
     */
    samples?: Record<string, SampleValue>;
    /**
     * Root only: the contract version the file's `_scamp` export declared,
     * recorded only when it differs from `WRITTEN_CONTRACT` so a file inside
     * the supported range keeps its version across saves. Absent means the
     * generator writes `WRITTEN_CONTRACT`.
     */
    contract?: number;
    /**
     * Component-side SLOT name on a container rectangle (component editor
     * only). When set, the element emits `{slotName}` and declares a
     * `slotName?: React.ReactNode` prop — page instances fill it with their
     * own children. Default name is `'children'`. Only meaningful in a
     * component definition. see docs/plans/component-slots-plan.md
     */
    slot?: string;
    /**
     * Page-side: which slot of the owning component-instance this element
     * fills. Absent means the default (`children`) slot. Set on the direct
     * children of a `component-instance`. A `children`/default slot emits as
     * JSX children of the instance; a named slot emits as a
     * `slotName={<…>}` prop. see docs/plans/component-slots-plan.md
     */
    slotName?: string;
    fontFamily?: string;
    /**
     * Full CSS `font-size` value, e.g. `"16px"`, `"1rem"`, or a token
     * reference like `"var(--text-lg)"`. Stored as a string so token
     * refs and non-px units round-trip without a parallel "raw" field.
     */
    fontSize?: string;
    fontWeight?: FontWeight;
    color?: string;
    textAlign?: TextAlign;
    /** CSS `line-height` — unitless number (`"1.5"`), length (`"20px"`),
     * or a token reference (`"var(--leading-normal)"`). */
    lineHeight?: string;
    /** CSS `letter-spacing` — length or token reference. */
    letterSpacing?: string;
    src?: string;
    alt?: string;
    componentName?: string;
    /** Stable per-page id emitted as `data-scamp-instance-id`. */
    instanceId?: string;
    /** Per-instance text-prop overrides; empty-string is explicit, not absence. */
    propOverrides?: Record<string, string>;
    /** Parser saw an instance tag with no matching component on disk. */
    missingComponent?: boolean;
    /**
     * Ordered list of box shadows applied to the element. Empty by
     * default. Emitted as a single `box-shadow: a, b, c` declaration
     * when non-empty. Order matters — the first entry is rendered on
     * top of the rest. Agent-written `box-shadow` values that the
     * parser can't reduce (e.g. `var(--shadow-lg)` on the whole
     * declaration, `inherit`, `calc(...)` lengths) are preserved
     * verbatim in `customProperties` and leave this list empty.
     */
    boxShadows: ReadonlyArray<BoxShadowDef>;
    /**
     * Ordered list of CSS filter functions applied to the element.
     * Empty by default. Emitted as a single space-joined
     * `filter: f1(...) f2(...)` declaration when non-empty. Order
     * matters — filters apply in sequence and reordering changes the
     * visual result. Agent-written `filter` values containing functions
     * outside `FilterKind` (`drop-shadow`, `url(...)`, `var(...)` args)
     * refuse from the mapper and preserve verbatim in
     * `customProperties`.
     */
    filters: ReadonlyArray<FilterDef>;
    /**
     * Same shape as `filters` but emitted as `backdrop-filter`. Applies
     * filter effects to the content behind the element (visible only
     * when the element's background is partially transparent). The
     * two lists are independent — adding a blur to `filters` doesn't
     * touch `backdropFilters`.
     */
    backdropFilters: ReadonlyArray<FilterDef>;
    /** Ordered `transform` function list; empty emits nothing. */
    transforms: ReadonlyArray<TransformDef>;
    /** `transform-origin`, verbatim. `''` is the CSS initial (`50% 50%`). */
    transformOrigin: string;
    /**
     * Ordered list of CSS transitions. Empty by default. Emitted as a
     * single `transition: a, b, c` shorthand when non-empty; the
     * parser handles the shorthand AND the longhand form in case an
     * agent writes them split.
     */
    transitions: ReadonlyArray<TransitionDef>;
    /**
     * Single CSS animation applied to this element. Undefined when
     * the element has no `animation` declaration. Multi-animation
     * source (`animation: a 1s, b 2s`) is preserved verbatim via
     * `customProperties.animation` rather than this field — the
     * panel doesn't model the multi case.
     */
    animation?: ElementAnimation;
    /**
     * Loose text and unclassed JSX between this element's child
     * elements, preserved in DOM source order. Empty by default.
     * Populated by `parseCode` when an agent writes mixed
     * text-and-element children inside a non-text container; the
     * generator interleaves these with `childIds` at emit time so
     * the output round-trips byte-equivalent. The layers panel
     * surfaces them in a "Raw" group so the user can see the
     * fragments exist (they're not directly editable from the
     * canvas).
     */
    inlineFragments: ReadonlyArray<InlineFragment>;
    /**
     * Property groups the user has toggled OFF for this element.
     * Empty by default. Each entry is a `PropertyGroup` string
     * (`'shadow'`, `'background'`, etc. — see
     * `src/renderer/lib/propertyGroups.ts` for the full list).
     *
     * Element-scoped: a toggled-off group applies across the base
     * styles AND every per-state / per-breakpoint override. The
     * typed values inside the group are NOT cleared — they're
     * preserved in their fields so toggling back ON restores them
     * unchanged. The canvas renders as if those properties weren't
     * set; the generator emits them as a labelled comment block
     * (label + commented decls — e.g. a `shadow off` label
     * followed by the commented `box-shadow` declaration) after
     * the active declarations.
     *
     * Stored sorted + deduped so on-disk round-trips stay
     * text-stable.
     */
    toggledOffGroups: ReadonlyArray<PropertyGroup>;
    customProperties: Record<string, string>;
    /**
     * Per-breakpoint style overrides keyed by breakpoint id (matching
     * entries in `ProjectConfig.breakpoints`). Each value carries ONLY
     * the fields the user overrode at that breakpoint — everything
     * else cascades from the base (desktop) styles on this element.
     *
     * Desktop is not stored here: it's the element's top-level fields.
     * When a breakpoint's override object would become empty (all
     * overrides removed), the key is deleted so round-trips stay
     * text-stable.
     */
    breakpointOverrides?: Record<string, BreakpointOverride>;
    /**
     * Per-state style overrides for the recognised CSS pseudo-classes
     * (`hover`, `active`, `focus`). Each value carries ONLY the fields
     * the user changed for that state — everything else cascades from
     * the base ("rest") styles on this element. Default state isn't
     * stored here: it's the element's top-level fields.
     *
     * Empty / fully-cleared override keys are dropped, and the entire
     * `stateOverrides` map is cleared back to `undefined` when no state
     * has any overrides, so round-trips stay text-stable.
     *
     * Desktop-only in this version — combining with breakpoints lands
     * later (see `docs/plans/2026-04-30-element-states.md`).
     */
    stateOverrides?: Partial<Record<ElementStateName, StateOverride>>;
    /**
     * Pseudo-class blocks the parser couldn't route to a recognised
     * state (`:focus-visible`, `:checked`, `:disabled`, `:nth-child(...)`,
     * compound selectors like `.rect_a1b2:hover .child`, etc.). Stored
     * verbatim so the generator can re-emit them after the element's
     * recognised state blocks. Empty / undefined when the source CSS
     * had nothing exotic for this class.
     */
    customSelectorBlocks?: ReadonlyArray<RawSelectorBlock>;
};
/**
 * Which `ScampElement` fields a breakpoint can override. Excludes
 * identity / tree fields (id, type, parentId, childIds) and the
 * override map itself — a breakpoint can't re-parent an element or
 * nest its own overrides. Also excludes TSX-level fields (tag,
 * attributes, selectOptions, svgSource) and the `text` content —
 * breakpoints change CSS only.
 *
 * `stateOverrides` and `customSelectorBlocks` are excluded too: a
 * breakpoint can't itself carry per-state overrides in this version
 * (the matrix is deferred — see the element-states plan), and the
 * raw-selector passthrough lives only at the top level.
 */
export type BreakpointOverride = Partial<Omit<ScampElement, 'id' | 'type' | 'parentId' | 'childIds' | 'breakpointOverrides' | 'stateOverrides' | 'customSelectorBlocks' | 'tag' | 'attributes' | 'selectOptions' | 'svgSource' | 'text' | 'runs' | 'name'>>;
/**
 * The fixed set of CSS pseudo-classes Scamp models as first-class
 * "states" with typed per-field overrides. Other pseudo-classes
 * (`:focus-visible`, `:disabled`, `:checked`, `:nth-child(...)`,
 * compound selectors) are preserved verbatim via
 * `customSelectorBlocks` rather than parsed into typed overrides.
 *
 * Order matters for emit: `:hover` → `:active` → `:focus` matches
 * the LVHA-ish ordering convention so cascade resolution is
 * predictable. Keep new entries in the same intended-emit order.
 */
export type ElementStateName = 'hover' | 'active' | 'focus';
export declare const ELEMENT_STATES: ReadonlyArray<ElementStateName>;
/**
 * Subset of element fields a per-state override can carry. Strict
 * superset of `BreakpointOverride` — every breakpoint-overridable
 * field is also state-overridable, plus `animation` (which states
 * support but breakpoints don't). The asymmetry is deliberate:
 * per-state animations are common (`:hover` triggers `shake`);
 * per-breakpoint animations are rare and add UX complexity.
 *
 * The properties panel deliberately doesn't expose `position` / `x`
 * / `y` / `transitions` controls when a non-default state is active
 * (hover layout shifts are bad UX; per-state transitions are a
 * separate feature). That UI rule lives in the section components,
 * not in this type — preserving anything an agent hand-writes inside
 * a pseudo-class block is more important than blocking it at the
 * type boundary.
 *
 * Because `StateOverride` extends `BreakpointOverride`, code that
 * takes a `BreakpointOverride` (the shared override emitter, the
 * shared override parser entry point) accepts a state override too —
 * but only sees the breakpoint-overridable fields. The animation
 * branch in `breakpointOverrideLines` is therefore unreachable for
 * an actual breakpoint override per the type system; comment in
 * place to flag this for future maintainers.
 */
export type StateOverride = BreakpointOverride & {
    animation?: ElementAnimation;
};
/**
 * One pseudo-class rule the parser couldn't route into a typed state
 * override — preserved verbatim so the generator can re-emit it
 * unchanged. Selector includes the leading `.<className>` so we know
 * which element this block belongs to; `body` is the declaration list
 * (just the inner declarations, no braces) formatted as the source had
 * it.
 */
export type RawSelectorBlock = {
    selector: string;
    body: string;
};
/**
 * The id used for the implicit page-root element. Stays constant across
 * all pages so other code can rely on a known anchor.
 */
export declare const ROOT_ELEMENT_ID = "root";
/**
 * True when this element keeps `src` / `alt` in the typed fields. Other
 * image-family tags (video, iframe, svg) keep theirs in the bag: `alt`
 * is invalid on them and `src` has tag-specific semantics. The tag is
 * absent when it's the type's default, which for an image is `img`.
 */
export declare const hasTypedSrcAlt: (el: ScampElement) => boolean;
/** Where this attribute's sample lives on this element, if it has one. */
export declare const attributeSample: (el: ScampElement, attr: string) => string | undefined;
/** The element with this attribute's sample set, wherever it belongs. */
export declare const withAttributeSample: (el: ScampElement, attr: string, value: string) => ScampElement;

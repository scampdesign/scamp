// @lib/elementToStyle.ts — pure element -> CSSProperties for the canvas
// renderer. Moved out of ElementRenderer.tsx (4.1) so it is unit-
// testable. `rootMinHeight` is now a required param (was defaulted to
// the UI-side EMPTY_FRAME_MIN_HEIGHT) to keep this module free of canvas
// component deps.
import { classifyBackgroundValue } from "./backgroundValue";
import { customPropsToStyle } from "./customProps";
import { ROOT_ELEMENT_ID } from "./element";
import { isColumnDirection } from "./flexAxis";
import { tagFor } from "./generateCode";
import { CUSTOM_PROP_TO_GROUP } from "./propertyGroups";
import { formatSpaceShorthand, isZeroSpaceTuple } from "./spaceValue";
import { resolveTokenChain } from "./resolveToken";
import { getTagDefaultPadding, paddingEquals } from "./tagDefaults";
const URL_RELATIVE_RE = /url\(\s*["']?(\.\/[^"')]+)["']?\s*\)/g;
/**
 * Matches `url("/assets/foo.png")` (and its bare-path form). Used to
 * rewrite Next.js absolute server-root references on the canvas
 * preview, where the file actually lives at `<project>/public/assets/`.
 */
const URL_NEXTJS_ASSETS_RE = /url\(\s*["']?(\/assets\/[^"')]+)["']?\s*\)/g;
/**
 * A handful of tags we deliberately render with a different element on
 * the canvas than in the generated TSX. The canvas is a design surface,
 * not a runtime — a real `<dialog open>` would go modal, a real
 * `<svg>` would try to interpret its source. Both scenarios interfere
 * with placing, selecting, and sizing the box.
 *
 * The generator still emits the true tag to disk; this override only
 * affects the DOM node React renders inside the canvas iframe.
 */
export const canvasRenderTag = (tag) => {
    if (tag === 'dialog')
        return 'div';
    if (tag === 'svg')
        return 'div';
    return tag;
};
/**
 * Attribute names we never forward from the element's `attributes`
 * bag to the canvas DOM. Each has a reason:
 *   - tag-specific side effects we don't want on a design surface
 *     (`open` on dialog, `href` on anchor → navigation, etc.)
 *   - React/JSX-only names the DOM wouldn't understand
 */
export const CANVAS_SKIP_ATTRS_BY_TAG = {
    a: new Set(['href', 'target']),
    dialog: new Set(['open']),
    form: new Set(['action', 'method']),
    button: new Set(['type']),
};
/**
 * Resolve a `var(--name)` reference against theme tokens, following the whole
 * chain (semantic → primitive → hex). Unknown/cyclic references render as the
 * `transparent` sentinel so a broken colour is visibly absent, not a stray
 * `var(--x)` string. see docs/archive/2026-07-23-design-system-plan.md
 */
const resolveTokenColor = (value, tokens) => {
    if (tokens.length === 0)
        return value;
    return resolveTokenChain(value, tokens) ?? 'transparent';
};
/**
 * Resolve a chained `var(--name)` reference for non-colour properties.
 * Unknown/cyclic references return the raw value so React's inline style
 * system gets something it understands (falling back to the browser default
 * rather than the "transparent" sentinel we use for colours).
 */
const resolveTokenValue = (value, tokens) => {
    if (!value)
        return value;
    return resolveTokenChain(value, tokens) ?? value;
};
/**
 * CSS property names Scamp routes to a typed TEXT field, each paired with
 * a predicate that's true when that field is set on the element. When a
 * `customProperties` echo of one of these coexists with a set typed
 * field, the typed value wins — same rule the generator applies on write.
 * The canvas must skip the echo so it doesn't shadow the typed value.
 * see docs/notes/typed-property-echo.md
 */
const TYPED_TEXT_CSS_PROPS = {
    'font-family': (el) => el.fontFamily !== undefined,
    'font-size': (el) => el.fontSize !== undefined,
    'font-weight': (el) => el.fontWeight !== undefined,
    color: (el) => el.color !== undefined,
    'text-align': (el) => el.textAlign !== undefined,
    'line-height': (el) => el.lineHeight !== undefined,
    'letter-spacing': (el) => el.letterSpacing !== undefined,
};
/**
 * Route a `background` value to the longhand that can actually hold it.
 * Colours resolve through the colour token chain (unknown → `transparent`,
 * the sentinel the panel relies on); gradients and images resolve through
 * the non-colour chain, which keeps the raw value when a token is missing
 * rather than blanking the whole gradient.
 */
const backgroundStyle = (value, off, tokens) => {
    // The default writes nothing: the generator omits it too, and an inline
    // `transparent` masked any sheet rule that paints this element — a
    // table's stripe, a breakpoint's colour.
    // see docs/notes/canvas-inline-layer-peel.md
    if (off || value === 'transparent')
        return {};
    const kind = classifyBackgroundValue(value);
    if (kind === 'color') {
        return { backgroundColor: resolveTokenColor(value, tokens) };
    }
    const resolved = resolveTokenValue(value, tokens);
    return kind === 'image' ? { backgroundImage: resolved } : { background: resolved };
};
export const elementToStyle = (el, parentDisplay, parentDirection, tokens, projectDir, projectFormat, 
// When true, the element is being rendered AS the inner subtree
// of a component instance — not as the active page's own root.
// Suppresses the canvas-frame affordances (the root min-height
// floor) that only make sense in the page / component editor's
// canvas view.
isInstanceInner = false, 
// The desired root min-height in logical pixels. Pages and
// component-editor canvases pass their canvas height here so
// the root element fills the visible canvas regardless of
// content size. Defaults to the page-canvas constant so
// instance-inner renders (which set isInstanceInner=true and
// never hit this branch) don't accidentally pick up a stray
// override.
rootMinHeight, 
// When true, the active canvas is the COMPONENT editor. A fixed-height
// root then keeps its own height instead of being stretched to fill the
// artboard — resizing the component canvas is a viewport change (like a
// browser window) and must not make a fixed-size component look taller.
// The page root always grows via min-height (a page is a document).
inComponentEditor = false) => {
    // `isRoot` drives canvas-frame affordances (sticky min-height,
    // dropping fixed height). Those only apply when the element is
    // genuinely the active page's own root — not when the same id
    // appears inside a component's parsed tree being rendered as an
    // embedded subtree.
    const isRoot = el.id === ROOT_ELEMENT_ID && !isInstanceInner;
    // Flex / grid children flow with the layout engine — drop
    // position/left/top so the browser places them. Matches what we
    // emit in generateCode.
    const inFlexParent = parentDisplay === 'flex';
    const inGridParent = parentDisplay === 'grid';
    const inLayoutParent = inFlexParent || inGridParent;
    // Axis, not literal direction: `row-reverse` is still a horizontal main
    // axis. An absent direction reads as row, CSS's default.
    const isRow = !isColumnDirection(parentDirection);
    // 'auto' produces `undefined` so the rendered element inherits the
    // browser default — exactly what an absent CSS declaration would do.
    // For 'fixed' mode, `widthCustom` (verbatim CSS like `100vh`,
    // `calc(...)`, `var(--w)`) wins over the px fallback so the canvas
    // matches the file output.
    const widthStyle = el.widthMode === 'stretch'
        ? '100%'
        : el.widthMode === 'fit-content'
            ? 'fit-content'
            : el.widthMode === 'auto'
                ? undefined
                : el.widthCustom !== undefined && el.widthCustom.length > 0
                    ? el.widthCustom
                    : el.widthValue;
    const heightStyle = el.heightMode === 'stretch'
        ? '100%'
        : el.heightMode === 'fit-content'
            ? 'fit-content'
            : el.heightMode === 'auto'
                ? undefined
                : el.heightCustom !== undefined && el.heightCustom.length > 0
                    ? el.heightCustom
                    : el.heightValue;
    // The page root uses `min-height` so the page frame grows vertically
    // with its content (like a real web page). Other elements use a fixed
    // `height` so they stay the size the user gave them.
    // In a flex parent, `width/height: 100%` can collapse to 0 because
    // there's no explicit containing-block size for `%` to resolve
    // against. Handle stretch per-axis:
    //   - Main axis stretch → `flex: 1` (grow to fill available space)
    //   - Cross axis stretch → `align-self: stretch` (fill cross axis)
    // The main axis depends on the parent's flex-direction (row → width
    // is main, column → height is main).
    let effectiveWidth = widthStyle;
    // The root normally drops its own height and relies on the canvas
    // min-height floor (below) so it fills the artboard. In the COMPONENT
    // editor a FIXED-height root instead keeps that height and does NOT grow
    // with the canvas — resizing the artboard is a viewport change, like a
    // browser window, and must not make a fixed component look taller.
    // Stretch/auto/hug roots (and the page root) still fill + reflow.
    const rootKeepsFixedHeight = isRoot && inComponentEditor && el.heightMode === 'fixed';
    let effectiveHeight = isRoot
        ? rootKeepsFixedHeight
            ? heightStyle
            : undefined
        : heightStyle;
    const flexProps = {};
    if (inFlexParent) {
        const widthIsMain = isRow;
        // Main axis stretch keeps the `100%` the generator wrote, with a zero
        // min so it can still shrink like any flex item.
        //
        // It must NOT become `flex: 1`. That is `flex: 1 1 0%` — flex-basis
        // ZERO — while `width: 100%` is basis 100%. The two agree only when the
        // item has no siblings competing for space; with a sized sibling they
        // diverge badly, because a basis-0 item can only grow into what the
        // sibling leaves rather than shrinking proportionally alongside it.
        // see docs/notes/canvas-flex-main-axis-stretch.md
        if (el.widthMode === 'stretch' && widthIsMain) {
            flexProps.minWidth = 0;
        }
        else if (el.heightMode === 'stretch' && !widthIsMain) {
            flexProps.minHeight = 0;
        }
        // Cross-axis stretch fill. The two axes are NOT symmetric:
        //   - Row parent → cross axis is the BLOCK axis (height). A
        //     percentage `height: 100%` collapses when the container's
        //     height is indefinite, so fall back to `align-self: stretch`
        //     to fill the cross axis.
        //   - Column parent → cross axis is the INLINE axis (width). A
        //     percentage `width: 100%` resolves against the container's
        //     definite inline size, so we KEEP it. Substituting
        //     `align-self: stretch` here would override the parent's
        //     `align-items` (e.g. `center` + a child `max-width` should
        //     centre the item) and pin the item to the start edge instead —
        //     diverging from the browser/preview. see
        //     docs/notes/canvas-cross-axis-stretch.md
        // Only while `alignSelf` is unset (or already stretch): a user-set
        // `center` must win here as it does in the generated CSS, which then
        // writes `height: 100%` + `align-self: center` instead.
        if (el.heightMode === 'stretch' &&
            widthIsMain &&
            (el.alignSelf === 'auto' || el.alignSelf === 'stretch')) {
            flexProps.alignSelf = 'stretch';
            effectiveHeight = undefined;
        }
    }
    // Element-scoped property-group toggles. When a group is off,
    // the renderer skips writing its styles so the canvas matches the
    // generator (which emits the same decls inside a comment block).
    // `transitions` and `animation` aren't applied to the typed style
    // here (transitions only matter mid-state-change, animation is
    // gated below on the preview path), so the relevant guards live
    // alongside those branches.
    const offGroups = new Set(el.toggledOffGroups);
    const isOff = (g) => offGroups.has(g);
    // `sticky` renders at rest on the canvas: the canvas viewport is not
    // the page's scroll container. see docs/notes/canvas-sticky-position.md
    const positionForCanvas = el.position === 'sticky' ? 'auto' : el.position;
    const base = {
        // Flex children render as `position: relative` so they remain a
        // positioning context for their own `position: absolute` descendants
        // (e.g. a text child placed inside a flex-placed rect). Without this
        // the text would anchor to the nearest positioned ancestor instead —
        // typically root — and escape the visual box of its parent even
        // though the tree structure puts it inside.
        // Typed `position` overrides Scamp's tree-shape default. `auto`
        // (default) keeps the original behaviour — root + flex/grid
        // children render as `relative` so absolutely-positioned
        // descendants anchor inside them; everything else is `absolute`.
        // Any explicit value (`fixed`, `relative`, etc.) renders as written;
        // `sticky` is the one exception, mapped to `auto` above.
        position: positionForCanvas !== 'auto'
            ? positionForCanvas
            : isRoot
                ? 'relative'
                : inLayoutParent
                    ? 'relative'
                    : 'absolute',
        left: positionForCanvas === 'static' || positionForCanvas === 'auto'
            ? isRoot || inLayoutParent
                ? undefined
                : el.x
            : el.x,
        top: positionForCanvas === 'static' || positionForCanvas === 'auto'
            ? isRoot || inLayoutParent
                ? undefined
                : el.y
            : el.y,
        width: effectiveWidth,
        height: effectiveHeight,
        // Canvas-only floor on the root's rendered height. Without this,
        // root defaults to `height: auto` and collapses to its content
        // size — flex layout then has no vertical space to distribute, so
        // `justify-content: center` on a flex-column root appears not to
        // work. Matches the frame's visible min-height so the user's flex
        // centering intent reads correctly on the canvas. NOT written to
        // the exported CSS — users who want centering in production still
        // need to set `min-height: 100vh` themselves.
        minHeight: isRoot && !rootKeepsFixedHeight ? `${rootMinHeight}px` : undefined,
        ...flexProps,
        // `background` lives in the background group; `border-radius`
        // is a sizing/shape concern that doesn't get a toggle.
        // Longhand (not the `background` shorthand) so it coexists cleanly
        // with `background-image` / `background-size` longhands that arrive
        // via customProperties — mixing shorthand + longhand in one inline
        // style makes React warn and can wipe the image on the canvas.
        //
        // Which longhand depends on the value. The generator writes the
        // shorthand, which takes a colour OR a gradient; putting a gradient on
        // `background-color` is invalid CSS and the browser silently drops it,
        // so gradients rendered in the preview and not here.
        // see docs/notes/canvas-gradient-backgrounds.md
        ...backgroundStyle(el.backgroundColor, isOff('background'), tokens),
        // `border-radius` and the border longhands are NOT written here — the
        // stylesheet carries the generator's own text for them.
        //
        // `box-sizing` and the margin reset below ARE kept: they mirror
        // theme.css's universal reset, and the canvas injects only the PAGE's
        // stylesheet, not the theme. Remove them and every bordered or padded
        // box changes size. see docs/notes/canvas-inline-layer-peel.md
        boxSizing: 'border-box',
        // Reset browser-default margins on semantic text tags (h1, p, etc.)
        // so the canvas position matches the stored coordinates.
        margin: 0,
    };
    // SVG paint — applied so the canvas reflects the SvgSection controls.
    // The fill/stroke property on the wrapper recolours the shapes inside
    // (inherits + overrides their attributes — the standard svg recolour
    // mechanism). see docs/notes/svg-recolor.md
    if (el.fill !== undefined && el.fill.length > 0) {
        base.fill = resolveTokenColor(el.fill, tokens);
    }
    if (el.stroke !== undefined && el.stroke.length > 0) {
        base.stroke = resolveTokenColor(el.stroke, tokens);
    }
    if (el.strokeWidth !== undefined && el.strokeWidth > 0) {
        base.strokeWidth = el.strokeWidth;
    }
    // `currentColor` inside an svg resolves to the CSS `color` property, so
    // the SvgSection's "Current color" swatch writes `el.color`; apply it on
    // the wrapper (the text path above is text-only). see
    // docs/archive/2026-07-14-svg-color-editing-plan.md
    if (el.tag === 'svg' && el.color !== undefined && el.color.length > 0) {
        base.color = resolveTokenColor(el.color, tokens);
    }
    // Flex / grid CONTAINER properties are not written here. They are
    // static — nothing about a drag changes a container's direction, gap or
    // alignment — so the stylesheet can own them outright, the way it owns
    // paint, typography and borders.
    //
    // The element's own SIZE and POSITION stay inline below, and are the
    // reason this group could not be peeled wholesale: a drag writes
    // transient left/top and a resize writes transient width/height
    // straight onto the node, and those have no counterpart in the file
    // until the gesture commits.
    // see docs/notes/canvas-inline-layer-peel.md
    // Grid-item placement on the parent grid.
    if (inGridParent) {
        if (el.gridColumn.length > 0)
            base.gridColumn = el.gridColumn;
        if (el.gridRow.length > 0)
            base.gridRow = el.gridRow;
        if (el.alignSelf !== 'auto')
            base.alignSelf = el.alignSelf;
        if (el.justifySelf !== 'stretch')
            base.justifySelf = el.justifySelf;
    }
    // Apply an inline `padding` override only when the typed
    // padding differs from the tag's effective default. For most
    // tags that default is `[0,0,0,0]` and we skip the inline
    // style, letting the browser's UA rules apply (which are also
    // zero). For UA-padded tags (`<ul>`, `<ol>`, `<dd>`) the
    // typed default is `[0,0,0,40]` — matching the UA's
    // `padding-inline-start: 40px` — so we still skip the inline
    // style and let the browser render its 40px naturally. A user
    // value that differs from the tag default (e.g. zero padding
    // on a `<ul>`) emits the inline override so the canvas reads
    // 0 and matches the generated CSS file.
    const tagPaddingDefault = getTagDefaultPadding(tagFor(el));
    if (!paddingEquals(el.padding, tagPaddingDefault)) {
        base.padding = formatSpaceShorthand(el.padding);
    }
    if (!isZeroSpaceTuple(el.margin)) {
        base.margin = formatSpaceShorthand(el.margin);
    }
    // Typography is NOT written here. The generator emits every one of these
    // and the injected stylesheet carries that text verbatim, so an inline
    // copy could only agree or drift — and while it stayed inline it masked
    // its own breakpoint override.
    //
    // Verified on computed values rather than geometry or pixels: type
    // produces no geometry of its own, and the two Chromium builds resolve
    // fonts differently, so neither of the other modes can see it.
    // see docs/notes/canvas-inline-layer-peel.md
    if (el.type === 'image') {
        base.objectFit = 'cover';
        base.display = 'block';
    }
    // Visibility + opacity
    // - `visibility: hidden` renders literally so canvas matches export.
    // - `visibility: none` is NOT applied literally (would hit-test out of
    //   existence); the `.hiddenNone` class dims + stripes the element so
    //   it stays selectable. CSS export still emits `display: none`.
    if (el.visibilityMode === 'hidden') {
        base.visibility = 'hidden';
    }
    // Dim the element by 65% when hidden-none; combine with user opacity
    // so a 50%-opaque element reads as ~17% when also hidden.
    const hiddenMultiplier = el.visibilityMode === 'none' ? 0.35 : 1;
    const effectiveOpacity = (el.opacity ?? 1) * hiddenMultiplier;
    if (effectiveOpacity !== 1) {
        base.opacity = effectiveOpacity;
    }
    // Box shadows, blend modes and filters are NOT written here. They are
    // pure paint, the generator already emits them, and the injected
    // stylesheet carries that text verbatim — so an inline copy could only
    // ever agree or drift. Removing it also lets a breakpoint's shadow win,
    // which an inline value would have masked.
    //
    // Verified by the parity harness on painted pixels, not just geometry:
    // these produce identical boxes and are invisible to a geometry check.
    // see docs/notes/canvas-inline-layer-peel.md
    // Spread customProperties LAST so unmapped CSS the user / agent
    // wrote (box-shadow, line-height, font-family, margin, …) actually
    // renders on the canvas. Anything in customProperties is, by
    // construction, NOT a property scamp routes to a typed field — so
    // there's no conflict with the assignments above. The reset
    // `margin: 0` we apply earlier IS overridable here, which is what
    // we want: a user-written `margin-bottom: 8px` should win over the
    // browser-default-reset.
    // Filter group-owned customProperties (e.g. `background-image`,
    // `background-size`) when their group is toggled off so the canvas
    // matches the generator's commented-out output.
    const filteredCustomProperties = {};
    // A typed text field wins over a stale `customProperties` echo of the
    // same CSS property, matching the generator. Only for text elements
    // with typography active — that's exactly when `base` emits these
    // fields. see docs/notes/typed-property-echo.md
    const typedTextWins = el.type === 'text' && !isOff('typography');
    for (const [key, value] of Object.entries(el.customProperties)) {
        const owningGroup = CUSTOM_PROP_TO_GROUP[key];
        if (owningGroup && isOff(owningGroup))
            continue;
        const typedPredicate = typedTextWins ? TYPED_TEXT_CSS_PROPS[key] : undefined;
        if (typedPredicate && typedPredicate(el))
            continue;
        filteredCustomProperties[key] = value;
    }
    const customStyle = customPropsToStyle(filteredCustomProperties);
    // Resolve relative `url("./...")` references in custom properties to
    // absolute `scamp-asset://` URLs so background-image etc. load correctly
    // on the canvas preview.
    if (projectDir) {
        for (const [key, value] of Object.entries(customStyle)) {
            if (typeof value !== 'string' || !value.includes('url('))
                continue;
            let next = value.replace(URL_RELATIVE_RE, (_match, relPath) => {
                const absPath = `${projectDir}/${relPath.slice(2)}`;
                return `url("scamp-asset://localhost/${encodeURI(absPath.replace(/^\/+/, ''))}")`;
            });
            if (projectFormat !== 'legacy') {
                next = next.replace(URL_NEXTJS_ASSETS_RE, (_match, absRef) => {
                    // `/assets/foo.png` lives at `<project>/public/assets/foo.png`.
                    const absPath = `${projectDir}/public${absRef}`;
                    return `url("scamp-asset://localhost/${encodeURI(absPath.replace(/^\/+/, ''))}")`;
                });
            }
            customStyle[key] = next;
        }
    }
    return { ...base, ...customStyle };
};
/**
 * Render an element subtree that lives in a separate elements map
 * (not the canvas store's page-elements). Used by the
 * component-instance branch of `ElementRenderer` to render the
 * subtree from `componentTrees[name].elements` — that map is a
 * completely separate set of ids from the page's elements, so the
 * normal `<ElementRenderer elementId={id} />` recursion (which
 * reads from `state.elements`) wouldn't find them.
 *
 * No selection / edit / animation-preview affordances apply here —
 * the inner DOM is read-only from the page's perspective. The
 * outer `ElementRenderer` wrapper around the instance handles the
 * selection outline + double-click-to-edit; everything inside
 * has `pointer-events: none` so all clicks reach the wrapper.
 *
 * Component instances nested inside a component definition (slot
 * composition) are explicitly out of scope per the components
 * plan; we render them as a labelled placeholder.
 */

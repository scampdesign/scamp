// parseCode/index.ts — split out of parseCode.ts (4.4).
import { runStyleFromDeclarations } from '../textRuns';
import { hoistBindingsWithMap, parsePropsDefaults } from './bindings';
import { BOOLEAN_ATTRIBUTES, bindPropName, enclosingRepeat, isInvertedBinding, isRowPath, } from '../viewProps';
import { ELEMENT_STATES, ROOT_ELEMENT_ID, hasTypedSrcAlt, withAttributeSample } from "../element";
import { DEFAULT_RECT_STYLES } from '../defaults';
import { composeMaps } from '../sourceMap';
import { requireAt, requireGroup } from "../safeAccess";
import { applyDeclarations, applyDeclarationsAsOverride, applyDeclarationsAsStateOverride, makeBaseline, makeRoot } from "./apply";
import { parseCssDeclarations } from "./css";
import { parseTsxStructure, parseScampMeta, parseSlotNames, PROP_REF_TEXT_RE, mapRange, } from "./tsx";
import { hoistNamedSlotsWithMap, SLOT_MARKER_ATTR } from "./namedSlots";
import { DEFAULT_BREAKPOINTS, DESKTOP_BREAKPOINT_ID } from "@shared/types";
import { WRITTEN_CONTRACT } from "@shared/projectConfig";
/**
 * Return the set of CSS property names that appear more than once in
 * a declaration list. Used to surface a warning indicator in the
 * panel when an agent or hand edit left two `height: …` (or any
 * other property) declarations in the same block.
 *
 * Order is preserved by first appearance so callers that render the
 * list to the user get a stable order.
 */
export const findDuplicateDeclProps = (decls) => {
    const counts = new Map();
    const order = [];
    for (const { prop } of decls) {
        const seen = counts.get(prop);
        if (seen === undefined) {
            counts.set(prop, 1);
            order.push(prop);
        }
        else {
            counts.set(prop, seen + 1);
        }
    }
    return order.filter((p) => (counts.get(p) ?? 0) > 1);
};
/**
 * Detect the legacy root-sizing three-tuple and return the
 * declarations with it stripped. Only matches the exact shape the
 * pre-canvas-rework generator produced: a single `width: Npx`, a
 * single `min-height: Mpx`, and a `position: relative`, with no other
 * size-related declarations (`height`, `max-width`, etc.). Any
 * divergence means the user hand-authored something and we leave it
 * alone.
 */
const stripLegacyRootSizing = (decls) => {
    const widthIdx = decls.findIndex((d) => d.prop === 'width');
    const minHeightIdx = decls.findIndex((d) => d.prop === 'min-height');
    const positionIdx = decls.findIndex((d) => d.prop === 'position' && d.value.trim() === 'relative');
    if (widthIdx < 0 || minHeightIdx < 0 || positionIdx < 0) {
        return { decls: [...decls], migrated: false };
    }
    // Width must be a bare `<N>px` value — anything else (percentages,
    // var() references, calc()) means the user customised it.
    const widthOk = /^\s*\d+(?:\.\d+)?px\s*$/.test(requireAt(decls, widthIdx).value);
    const minHeightOk = /^\s*\d+(?:\.\d+)?px\s*$/.test(requireAt(decls, minHeightIdx).value);
    if (!widthOk || !minHeightOk) {
        return { decls: [...decls], migrated: false };
    }
    // Any additional size-related declaration means this isn't the
    // exact legacy three-tuple — don't touch it.
    const hasOtherSize = decls.some((d) => d.prop === 'height' ||
        d.prop === 'max-width' ||
        d.prop === 'max-height' ||
        d.prop === 'min-width');
    if (hasOtherSize) {
        return { decls: [...decls], migrated: false };
    }
    const stripped = decls.filter((_, i) => i !== widthIdx && i !== minHeightIdx && i !== positionIdx);
    return { decls: stripped, migrated: true };
};
/**
 * Drop an inherited `min-height: 100vh` from a COMPONENT root. Older
 * components were scaffolded with the page-root viewport floor, which
 * blows out their layout when embedded (preview / live site). Stripping
 * it on parse means the floor stops round-tripping back into the file:
 * the next save writes the cleaned CSS. An explicit non-`100vh`
 * min-height the user set is left untouched.
 * see docs/notes/component-min-height-floor.md
 */
const stripComponentRootMinHeightFloor = (decls) => decls.filter((d) => !(d.prop === 'min-height' && d.value.trim() === '100vh'));
/** Trailing `_<4-char-hex>` id segment of a class name (scamp's stable id). */
const CLASS_ID_SUFFIX_RE = /_([0-9a-f]{4})$/;
/** Every class name that appears anywhere in the parsed CSS. */
const collectCssClassNames = (parsed) => {
    const names = new Set();
    for (const k of parsed.byClass.keys())
        names.add(k);
    for (const k of parsed.rawByClass.keys())
        names.add(k);
    for (const k of parsed.toggledOffByClass.keys())
        names.add(k);
    for (const m of parsed.byState.values())
        for (const k of m.keys())
            names.add(k);
    for (const m of parsed.byBreakpoint.values())
        for (const k of m.keys())
            names.add(k);
    return names;
};
/**
 * Index CSS class names by their stable `_<hex>` id suffix. Ambiguous
 * suffixes (shared by two distinct class names) map to `null` so we never
 * guess. Used to recover an element whose class was renamed on only one
 * side (TSX vs CSS) — see docs/plans/2026-06-19-style-loss-on-css-edit.md.
 */
const indexCssClassesByIdSuffix = (names) => {
    const map = new Map();
    for (const name of names) {
        const m = CLASS_ID_SUFFIX_RE.exec(name);
        const id = m?.[1];
        if (id === undefined)
            continue;
        map.set(id, map.has(id) ? null : name);
    }
    return map;
};
export const parseCode = (tsx, css, options) => {
    const breakpoints = options?.breakpoints ?? DEFAULT_BREAKPOINTS;
    const isComponent = options?.isComponent ?? false;
    // Hoist named-slot props (`<Card left={<…>} />`) into marker-carrying JSX
    // children first — htmlparser2 can't tokenize JSX inside an attribute.
    // A post-pass below lifts the marker into `slotName`.
    // Then the binding forms — `attr={expr}`, the repeat and show wrappers —
    // which the tokenizer can't read either. see docs/notes/view-bindings.md
    const slots = hoistNamedSlotsWithMap(tsx);
    const bound = hoistBindingsWithMap(slots.text);
    const rawElements = parseTsxStructure(bound.text);
    // Each pass moved the offsets the one before it reported, so the
    // ranges come back through both. see docs/plans/incremental-writes-plan.md
    const tsxMap = composeMaps(slots.map, bound.map);
    const parsedCss = parseCssDeclarations(css, breakpoints);
    // Rename resilience: if a TSX className has no matching CSS class (the
    // class was renamed on only one side), fall back to the CSS class sharing
    // this element's stable 4-char hex id. Exact matches — the normal case —
    // are unaffected.
    const cssClassNames = collectCssClassNames(parsedCss);
    const classByIdSuffix = indexCssClassesByIdSuffix(cssClassNames);
    const resolveClassName = (className, id) => {
        if (className.length > 0 && cssClassNames.has(className))
            return className;
        if (id !== ROOT_ELEMENT_ID) {
            const bySuffix = classByIdSuffix.get(id);
            if (bySuffix != null)
                return bySuffix;
        }
        return className;
    };
    const elements = {};
    const cssDuplicates = {};
    // Map of `propName → defaultText` extracted from the component's
    // function destructure (empty for pages, which never emit a
    // `[Name]Props` destructure). Used in the post-pass to hydrate
    // each text element whose body resolves to `{propName}` back
    // into a typed `prop` field.
    const propDefaults = parsePropsDefaults(tsx);
    // Which elements are flex/grid containers, by id. Needed while applying
    // declarations: whether a child's `position: absolute` is information or
    // just Scamp's own auto-emission depends on the parent's display.
    // see docs/notes/parse-position-absolute-in-flex.md
    const LAYOUT_DISPLAY = /^(?:inline-)?(?:flex|grid)$/;
    const classById = new Map(rawElements.map((r) => [r.id, r.dedupedFrom ?? resolveClassName(r.className, r.id)]));
    /**
     * The parent's flex main axis, or null when the parent is not a flex
     * container. Used to recognise the derived `flex-shrink: 0` guard so it
     * is absorbed rather than echoed into `customProperties`.
     */
    const parentFlexMainAxis = (id) => {
        if (id === null)
            return null;
        const cls = classById.get(id);
        if (cls === undefined)
            return null;
        const decls = parsedCss.byClass.get(cls) ?? [];
        const isFlex = decls.some((d) => d.prop === 'display' && d.value.trim() === 'flex');
        if (!isFlex)
            return null;
        const isColumn = decls.some((d) => d.prop === 'flex-direction' && d.value.trim().startsWith('column'));
        return isColumn ? 'height' : 'width';
    };
    const isLayoutContainer = (id) => {
        if (id === null)
            return false;
        const cls = classById.get(id);
        if (cls === undefined)
            return false;
        return (parsedCss.byClass.get(cls) ?? []).some((d) => d.prop === 'display' && LAYOUT_DISPLAY.test(d.value.trim()));
    };
    // Always start with a root, even if the TSX is missing one. Downstream
    // code (canvas store, ProjectShell) assumes ROOT_ELEMENT_ID exists.
    let rootSeen = false;
    let migrated = false;
    for (const raw of rawElements) {
        const isRoot = raw.id === ROOT_ELEMENT_ID;
        if (isRoot)
            rootSeen = true;
        // Resolve the CSS class this element's styles live under — exact match
        // normally, or the same-hex-id class if it was renamed on one side only.
        // A duplicate-id-repaired element sources its styles from the ORIGINAL
        // class (`dedupedFrom`) so the reassigned copy stays visually identical.
        const cls = raw.dedupedFrom ?? resolveClassName(raw.className, raw.id);
        const baseline = makeBaseline(raw, isComponent);
        let decls = parsedCss.byClass.get(cls) ?? [];
        if (isRoot) {
            // Detect and strip the legacy three-tuple (pre-canvas-rework)
            // so the new stretch/auto defaults take over. Leaves any other
            // declarations the user wrote intact.
            const result = stripLegacyRootSizing(decls);
            decls = result.decls;
            if (result.migrated)
                migrated = true;
            // Component roots: drop the inherited `100vh` floor so it stops
            // round-tripping. No `migrated` flag — that drives the page-sizing
            // banner; this self-heals silently on the next save.
            if (isComponent)
                decls = stripComponentRootMinHeightFloor(decls);
        }
        const applied = applyDeclarations(baseline, decls, isLayoutContainer(raw.parentId));
        // Styled runs: the TSX said which class each run wears, and the CSS
        // says what that class means. Attached here because this is the one
        // place both halves are in hand.
        // see docs/plans/inline-spans-plan.md
        if (raw.runs !== undefined && raw.runs.length > 0) {
            applied.runs = raw.runs.map((run) => run.runClassName === undefined
                ? { text: run.text }
                : {
                    text: run.text,
                    style: runStyleFromDeclarations(parsedCss.byClass.get(run.runClassName) ?? []),
                });
        }
        // If the file didn't actually declare a width or a height for this
        // element, treat the dimension as `auto` (no rendering hint, no
        // generator output). Without this we'd silently default to the
        // 100×100 rect baseline, which makes hand-written / agent-written
        // files render at the wrong size.
        //
        // Skipped for the root: DEFAULT_ROOT_STYLES already defaults to
        // stretch/auto, so a root with no width/height decl should keep
        // those defaults rather than being forced to auto on the width axis.
        const hasWidth = decls.some((d) => d.prop === 'width');
        const hasHeight = decls.some((d) => d.prop === 'height');
        let finalElement = isRoot
            ? applied
            : {
                ...applied,
                widthMode: hasWidth ? applied.widthMode : 'auto',
                heightMode: hasHeight ? applied.heightMode : 'auto',
            };
        // `flex: 1` with no height on a flex-COLUMN child is fill-height on
        // that column's main axis — what the generator writes there. Absorbed
        // into the mode rather than left in customProperties, or the model
        // would carry a value the mode already implies and the round trip
        // would compare an element that gained a custom property against one
        // that never had it. Only the exact `flex: 1` we emit; every other
        // flex spelling stays verbatim.
        if (!isRoot &&
            !hasHeight &&
            parentFlexMainAxis(raw.parentId) === 'height' &&
            decls.some((d) => d.prop === 'flex' && d.value.trim() === '1')) {
            // The `flex` mapper has already expanded the shorthand into the
            // typed longhands; fold those back to their defaults too, or the
            // generator would write `flex: 1` for the mode AND `flex-grow: 1`
            // for the fields.
            const { flex: _fill, ...rest } = finalElement.customProperties;
            finalElement = {
                ...finalElement,
                heightMode: 'stretch',
                flexGrow: DEFAULT_RECT_STYLES.flexGrow,
                flexShrink: DEFAULT_RECT_STYLES.flexShrink,
                flexBasis: DEFAULT_RECT_STYLES.flexBasis,
                customProperties: rest,
            };
        }
        // `align-self: stretch` with no height on a flex-row child IS
        // fill-height — it is what the generator writes there, because
        // `height: 100%` collapses against an indefinite container. Mapping
        // it back closes the round trip and keeps the Size panel reading
        // "Fill" rather than "Auto" for an element that visibly fills.
        if (!isRoot &&
            !hasHeight &&
            parentFlexMainAxis(raw.parentId) === 'width' &&
            decls.some((d) => d.prop === 'align-self' && d.value.trim() === 'stretch')) {
            // The mode owns the declaration; the typed field goes back to
            // `auto` so the generator writes `align-self: stretch` once.
            finalElement = {
                ...finalElement,
                heightMode: 'stretch',
                alignSelf: DEFAULT_RECT_STYLES.alignSelf,
            };
        }
        // Fold in any breakpoint overrides for this element's class.
        const overrides = {};
        for (const bp of breakpoints) {
            if (bp.id === DESKTOP_BREAKPOINT_ID)
                continue;
            const classesForBp = parsedCss.byBreakpoint.get(bp.id);
            if (!classesForBp)
                continue;
            const bpDecls = classesForBp.get(cls);
            if (!bpDecls || bpDecls.length === 0)
                continue;
            const override = applyDeclarationsAsOverride(bpDecls);
            if (Object.keys(override).length > 0)
                overrides[bp.id] = override;
        }
        if (Object.keys(overrides).length > 0) {
            finalElement = { ...finalElement, breakpointOverrides: overrides };
        }
        // Fold in per-state overrides for this element's class. Uses
        // `applyDeclarationsAsStateOverride` (which wraps the breakpoint
        // helper) so per-state animations parse into the typed
        // `animation` field instead of falling through to
        // customProperties.
        const stateOverrides = {};
        for (const state of ELEMENT_STATES) {
            const classesForState = parsedCss.byState.get(state);
            if (!classesForState)
                continue;
            const stateDecls = classesForState.get(cls);
            if (!stateDecls || stateDecls.length === 0)
                continue;
            const override = applyDeclarationsAsStateOverride(stateDecls);
            if (Object.keys(override).length > 0)
                stateOverrides[state] = override;
        }
        if (Object.keys(stateOverrides).length > 0) {
            finalElement = { ...finalElement, stateOverrides };
        }
        // Verbatim-preserved pseudo-class blocks for this element.
        const rawBlocks = parsedCss.rawByClass.get(cls);
        if (rawBlocks && rawBlocks.length > 0) {
            finalElement = {
                ...finalElement,
                customSelectorBlocks: rawBlocks,
            };
        }
        // Element-scoped property-group toggles. Any group labelled as
        // off in any rule (base / state / breakpoint) is treated as off
        // for the whole element — same surface the user toggles in the
        // panel. `toggledOffByClass` is already canonicalised.
        const toggledOff = parsedCss.toggledOffByClass.get(cls);
        if (toggledOff && toggledOff.length > 0) {
            finalElement = {
                ...finalElement,
                toggledOffGroups: toggledOff,
            };
        }
        elements[raw.id] = finalElement;
        // Track duplicates in the BASE class block. State / breakpoint
        // duplicates are deferred — same cleanup path applies (any panel
        // edit on the element rewrites all rule blocks for it from typed
        // state) but the indicator surface is rarer there.
        const dupes = findDuplicateDeclProps(decls);
        if (dupes.length > 0)
            cssDuplicates[raw.id] = dupes;
    }
    if (!rootSeen) {
        elements[ROOT_ELEMENT_ID] = makeRoot(isComponent);
    }
    // Post-pass: hydrate component text-props. When a text element's
    // captured body is a single `{propName}` JSX expression AND the
    // function signature declared a default for that prop, set the
    // typed `prop` field and restore `text` to the destructure
    // default. Unresolved `{whatever}` expressions stay as literal
    // text so user-/agent-written JSX round-trips byte-stably.
    for (const id of Object.keys(elements)) {
        const el = elements[id];
        if (!el || el.type !== 'text')
            continue;
        const text = el.text;
        if (typeof text !== 'string')
            continue;
        const m = text.match(PROP_REF_TEXT_RE);
        if (!m)
            continue;
        const ref = requireGroup(m, 1);
        // Inside a repeat, `{row.field}` binds the row; the sample is in the
        // rows on the root, so the element carries no text of its own.
        const dot = ref.indexOf('.');
        if (dot >= 0) {
            const repeat = enclosingRepeat(elements, id);
            if (repeat === null || repeat.as !== ref.slice(0, dot))
                continue;
            const { text: _dropped, ...rest } = el;
            elements[id] = { ...rest, prop: ref };
            continue;
        }
        const sample = propDefaults.get(ref);
        if (typeof sample !== 'string')
            continue;
        elements[id] = { ...el, prop: ref, text: sample };
    }
    // Post-pass: samples. A bound attribute's sample is the destructure
    // default, written back into the literal's place (presence for a
    // boolean attribute); a show flag's and a repeat's samples have no
    // element to live on and go on the root. see docs/notes/view-bindings.md
    const rootSamples = {};
    for (const id of Object.keys(elements)) {
        const el = elements[id];
        if (!el)
            continue;
        if (el.showIf !== undefined && !isRowPath(el.showIf)) {
            const sample = propDefaults.get(el.showIf);
            rootSamples[el.showIf] = typeof sample === 'boolean' ? sample : true;
        }
        if (el.repeat !== undefined) {
            const sample = propDefaults.get(el.repeat.over);
            rootSamples[el.repeat.over] = Array.isArray(sample) ? sample : [];
        }
        if (el.bind === undefined)
            continue;
        let next = el;
        for (const [attr, expr] of Object.entries(el.bind)) {
            const name = bindPropName(expr);
            if (isRowPath(name))
                continue;
            const sample = propDefaults.get(name);
            if (el.type === 'component-instance') {
                next = {
                    ...next,
                    propOverrides: {
                        ...(next.propOverrides ?? {}),
                        [attr]: typeof sample === 'string' ? sample : '',
                    },
                };
                continue;
            }
            // An <img>'s src / alt sample belongs in the typed field, not
            // the bag. see docs/notes/view-bindings.md
            if (hasTypedSrcAlt(next) && (attr === 'src' || attr === 'alt')) {
                next = withAttributeSample(next, attr, typeof sample === 'string' ? sample : '');
                continue;
            }
            const attributes = { ...(next.attributes ?? {}) };
            if (BOOLEAN_ATTRIBUTES.has(attr)) {
                const flag = typeof sample === 'boolean' ? sample : false;
                const present = isInvertedBinding(expr) ? !flag : flag;
                if (present)
                    attributes[attr] = '';
                else
                    delete attributes[attr];
            }
            else {
                attributes[attr] = typeof sample === 'string' ? sample : '';
            }
            next =
                Object.keys(attributes).length > 0
                    ? { ...next, attributes }
                    : (({ attributes: _none, ...rest }) => rest)(next);
        }
        elements[id] = next;
    }
    if (Object.keys(rootSamples).length > 0) {
        const root = elements[ROOT_ELEMENT_ID];
        if (root)
            elements[ROOT_ELEMENT_ID] = { ...root, samples: rootSamples };
    }
    // Post-pass: hydrate component slots. A rectangle whose sole content is a
    // single `{slotName}` expression AND whose name is declared as a
    // `React.ReactNode` prop becomes a slot — set the typed `slot` field and
    // drop the `{slotName}` fragment (it re-emits from `slot` on generate).
    // see docs/plans/component-slots-plan.md
    const slotNames = parseSlotNames(tsx);
    const viewMeta = parseScampMeta(tsx);
    if (slotNames.size > 0) {
        for (const id of Object.keys(elements)) {
            const el = elements[id];
            if (!el || el.type !== 'rectangle' || el.childIds.length > 0)
                continue;
            const frags = el.inlineFragments;
            if (frags.length !== 1 || frags[0]?.kind !== 'text')
                continue;
            const m = frags[0].value.match(PROP_REF_TEXT_RE);
            if (!m)
                continue;
            const name = requireGroup(m, 1);
            if (!slotNames.has(name))
                continue;
            elements[id] = { ...el, slot: name, inlineFragments: [] };
        }
    }
    // Post-pass: lift the named-slot marker (injected by hoistNamedSlots) into
    // the typed `slotName` field, and drop it from the generic attribute bag
    // so it round-trips via `slotName` (re-emitted as a `slotName={<…>}` prop).
    for (const id of Object.keys(elements)) {
        const el = elements[id];
        if (!el || !el.attributes)
            continue;
        const marker = el.attributes[SLOT_MARKER_ATTR];
        if (typeof marker !== 'string' || marker.length === 0)
            continue;
        const { [SLOT_MARKER_ATTR]: _drop, ...restAttrs } = el.attributes;
        elements[id] = { ...el, slotName: marker, attributes: restAttrs };
    }
    // Elements the parser reassigned because their id collided with an
    // earlier one. Surfaced so the load layer can notify the user.
    const duplicateIdRepairs = rawElements
        .filter((raw) => raw.dedupedFrom !== undefined)
        .map((raw) => ({ from: raw.dedupedFrom, to: raw.className }));
    // A declared contract other than the one new files get is kept on the
    // root, so saving doesn't rewrite a file's version. see projectConfig.ts
    if (viewMeta && viewMeta.contract !== WRITTEN_CONTRACT) {
        const root = elements[ROOT_ELEMENT_ID];
        if (root)
            elements[ROOT_ELEMENT_ID] = { ...root, contract: viewMeta.contract };
    }
    const ranges = {};
    for (const raw of rawElements) {
        if (raw.range && elements[raw.id])
            ranges[raw.id] = mapRange(tsxMap, raw.range);
    }
    return {
        elements,
        ranges,
        rootId: ROOT_ELEMENT_ID,
        customMediaBlocks: parsedCss.customMediaBlocks,
        keyframesBlocks: parsedCss.keyframesBlocks,
        cssDuplicates,
        ...(migrated ? { migrated: true } : {}),
        ...(duplicateIdRepairs.length > 0 ? { duplicateIdRepairs } : {}),
        ...(viewMeta ? { viewMeta } : {}),
    };
};

/**
 * Fields that are NEVER written into a breakpoint or state override —
 * they're identity / tree / TSX-level concepts that can't
 * meaningfully change per-axis. A patch containing any of these
 * applies them to the element's top-level fields regardless of the
 * active breakpoint or state.
 */
export const BASE_ONLY_PATCH_FIELDS = new Set([
    'id',
    'type',
    'parentId',
    'childIds',
    'breakpointOverrides',
    'stateOverrides',
    'variantAxes',
    'variantOverrides',
    'variantInteractions',
    'customSelectorBlocks',
    'tableStyle',
    'tag',
    'attributes',
    'selectOptions',
    'svgSource',
    'text',
    'name',
]);
/**
 * Apply a patch to an element while respecting the active breakpoint
 * and state. Routing rules:
 *
 *   - Desktop + default state → patch writes through to top-level.
 *   - Desktop + non-default state → style fields route to
 *     `stateOverrides[activeStateName]`.
 *   - Non-desktop + default state → style fields route to
 *     `breakpointOverrides[activeBreakpointId]`.
 *   - A variant (`activeVariantKey`, desktop only) → style fields route
 *     to `variantOverrides[key]`, or to its `states[activeStateName]`.
 *     A variant at a non-desktop breakpoint drops the style patch, as
 *     state × breakpoint does.
 *   - Non-desktop + non-default state → state×breakpoint matrix is
 *     out of scope in this version; the patch is dropped to avoid
 *     silently writing the wrong place. The properties panel UI
 *     disables non-default states at non-desktop breakpoints, so
 *     this shouldn't fire from a normal interaction.
 *
 * Identity / content fields always land on top-level regardless of
 * axis. Pure — takes the element + patch, returns the next element.
 */
/**
 * Copy a single key from one partial element to another while
 * preserving the key↔value type correlation TypeScript loses when the
 * key is a `keyof ScampElement` union (a plain `target[key] =
 * source[key]` widens both sides and errors). Generic over a single
 * `K` so the value type stays tied to the key — no `Record<string,
 * unknown>` cast needed. `stylePatch` is a `BreakpointOverride`
 * (a `Partial<Omit<ScampElement, …>>`), which is assignable to the
 * `Partial<ScampElement>` target; callers only ever pass style keys to
 * it.
 */
export const assignPatchKey = (target, source, key) => {
    target[key] = source[key];
};
export const applyPatchWithAxisRouting = (el, patch, activeBreakpointId, activeStateName, activeVariantKey = null) => activeVariantKey !== null
    ? routeVariantPatch(el, patch, activeBreakpointId, activeStateName, activeVariantKey)
    : dropKeptOffsets(routePatch(el, patch, activeBreakpointId, activeStateName), patch, activeBreakpointId, activeStateName);
/** `{ ...existing, ...patch }`, with `customProperties` merged by key. */
const mergeOverride = (existing, stylePatch) => {
    const mergedCustom = 'customProperties' in stylePatch && stylePatch.customProperties
        ? { ...(existing.customProperties ?? {}), ...stylePatch.customProperties }
        : existing.customProperties;
    return { ...existing, ...stylePatch, ...(mergedCustom !== undefined ? { customProperties: mergedCustom } : {}) };
};
const splitPatch = (patch) => {
    const basePatch = {};
    const stylePatch = {};
    for (const key of Object.keys(patch)) {
        if (BASE_ONLY_PATCH_FIELDS.has(key)) {
            assignPatchKey(basePatch, patch, key);
        }
        else {
            assignPatchKey(stylePatch, patch, key);
        }
    }
    return { basePatch, stylePatch };
};
// shortcut: an offset kept verbatim (`left: 50%`) isn't dropped inside a variant, add when one shows up there.
const routeVariantPatch = (el, patch, activeBreakpointId, activeStateName, key) => {
    const { basePatch, stylePatch } = splitPatch(patch);
    const mergedBase = Object.keys(basePatch).length > 0 ? { ...el, ...basePatch } : el;
    if (Object.keys(stylePatch).length === 0 || activeBreakpointId !== 'desktop')
        return mergedBase;
    const existing = mergedBase.variantOverrides?.[key] ?? {};
    const next = activeStateName === null
        ? mergeOverride(existing, stylePatch)
        : { ...existing, states: { ...existing.states, [activeStateName]: mergeOverride(existing.states?.[activeStateName] ?? {}, stylePatch) } };
    return { ...mergedBase, variantOverrides: { ...mergedBase.variantOverrides, [key]: next } };
};
const without = (custom, keys) => {
    if (custom === undefined || !keys.some((k) => k in custom))
        return custom;
    const next = { ...custom };
    for (const k of keys)
        delete next[k];
    return next;
};
/**
 * Setting x / y — a drag, a resize, the Position fields — replaces an
 * offset the parser kept verbatim (`left: 50%`), which would otherwise
 * win over the new pixels and the element wouldn't move.
 * see docs/notes/position-offsets.md
 */
const dropKeptOffsets = (el, patch, activeBreakpointId, activeStateName) => {
    const keys = [...('x' in patch ? ['left'] : []), ...('y' in patch ? ['top'] : [])];
    if (keys.length === 0)
        return el;
    if (activeBreakpointId === 'desktop' && activeStateName === null) {
        const custom = without(el.customProperties, keys);
        return custom === el.customProperties || custom === undefined ? el : { ...el, customProperties: custom };
    }
    if (activeBreakpointId === 'desktop' && activeStateName !== null) {
        const override = el.stateOverrides?.[activeStateName];
        const custom = without(override?.customProperties, keys);
        if (override === undefined || custom === override.customProperties)
            return el;
        return { ...el, stateOverrides: { ...el.stateOverrides, [activeStateName]: { ...override, customProperties: custom } } };
    }
    const override = el.breakpointOverrides?.[activeBreakpointId];
    const custom = without(override?.customProperties, keys);
    if (override === undefined || custom === override.customProperties)
        return el;
    return {
        ...el,
        breakpointOverrides: { ...el.breakpointOverrides, [activeBreakpointId]: { ...override, customProperties: custom } },
    };
};
const routePatch = (el, patch, activeBreakpointId, activeStateName) => {
    // Split the patch into base (always-top-level) and style (goes to
    // override when an axis is active).
    const { basePatch, stylePatch } = splitPatch(patch);
    const mergedBase = Object.keys(basePatch).length > 0 ? { ...el, ...basePatch } : el;
    const styleKeys = Object.keys(stylePatch);
    // Desktop + default state — merge style patch onto top-level.
    if (activeBreakpointId === 'desktop' && activeStateName === null) {
        if (styleKeys.length === 0)
            return mergedBase;
        return { ...mergedBase, ...stylePatch };
    }
    if (styleKeys.length === 0)
        return mergedBase;
    // Desktop + non-default state — route to stateOverrides.
    if (activeBreakpointId === 'desktop' && activeStateName !== null) {
        const nextOverride = mergeOverride(mergedBase.stateOverrides?.[activeStateName] ?? {}, stylePatch);
        return {
            ...mergedBase,
            stateOverrides: {
                ...mergedBase.stateOverrides,
                [activeStateName]: nextOverride,
            },
        };
    }
    // Non-desktop + non-default state — out of scope. Drop the style
    // patch; base fields already landed via mergedBase. (UI guards
    // against this combination, so this branch should be unreachable in
    // practice — kept as a safety net.)
    if (activeStateName !== null)
        return mergedBase;
    // Non-desktop + default state — route to breakpointOverrides.
    const nextOverride = mergeOverride(mergedBase.breakpointOverrides?.[activeBreakpointId] ?? {}, stylePatch);
    return {
        ...mergedBase,
        breakpointOverrides: {
            ...mergedBase.breakpointOverrides,
            [activeBreakpointId]: nextOverride,
        },
    };
};

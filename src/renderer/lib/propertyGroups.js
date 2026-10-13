/** Ordered for deterministic UI listings + canonical emit order. */
export const ALL_PROPERTY_GROUPS = [
    'animation',
    'background',
    'blend',
    'border',
    'filters',
    'shadow',
    'transform',
    'transitions',
    'typography',
];
/** Type guard. */
export const isPropertyGroup = (s) => ALL_PROPERTY_GROUPS.includes(s);
/**
 * Which `ScampElement` fields belong to which panel-group. This
 * is the single source of truth used by:
 *   - the renderer (skip these styles when group is off)
 *   - the generator (emit these fields as commented decls when
 *     group is off)
 *   - the parser (when we see a comment block, route values back
 *     into these fields)
 *
 * Keep in sync with the panel sections. Field names that don't
 * appear here are unaffected by group toggles (e.g. `display`,
 * `widthMode` — those groups aren't togglable).
 */
export const GROUP_FIELDS = {
    background: ['backgroundColor'],
    border: ['borderColor', 'borderStyle', 'borderWidth', 'borderRadius'],
    shadow: ['boxShadows', 'boxShadowToken'],
    typography: [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'color',
        'textAlign',
        'lineHeight',
        'letterSpacing',
    ],
    filters: ['filters', 'backdropFilters'],
    blend: ['mixBlendMode', 'backgroundBlendMode'],
    transform: ['transforms', 'transformOrigin'],
    transitions: ['transitions'],
    animation: ['animation'],
};
/**
 * Inverse lookup. Maps each `ScampElement` field key to the
 * group it belongs to (when any). O(1) check for the renderer's
 * "is this field's group off?" branches.
 */
export const FIELD_TO_GROUP = (() => {
    const out = {};
    for (const [group, fields] of Object.entries(GROUP_FIELDS)) {
        for (const field of fields) {
            out[field] = group;
        }
    }
    return out;
})();
/**
 * `customProperties` keys (raw CSS property names) owned by each
 * group. Used by the renderer to filter `customProperties` when a
 * group is off, and by the generator to route those keys into
 * the right group's comment block.
 *
 * Background's image / size / position / repeat live in
 * `customProperties` (rather than typed fields), so the group
 * toggle has to know about them to comment them out coherently
 * with `backgroundColor`.
 */
export const GROUP_CUSTOM_PROPS = {
    background: [
        'background-image',
        'background-size',
        'background-position',
        'background-repeat',
    ],
};
/** Inverse of `GROUP_CUSTOM_PROPS`: CSS property name → group. */
export const CUSTOM_PROP_TO_GROUP = (() => {
    const out = {};
    for (const [group, keys] of Object.entries(GROUP_CUSTOM_PROPS)) {
        for (const key of keys)
            out[key] = group;
    }
    return out;
})();
/**
 * Sort + dedupe a list of group names. Called from the store
 * action that mutates `toggledOffGroups` so the on-disk
 * representation stays text-stable across saves and rounds-trips
 * cleanly through agent edits.
 */
export const canonicalizeGroupList = (groups) => {
    const seen = new Set();
    for (const g of groups)
        seen.add(g);
    return [...seen].sort();
};

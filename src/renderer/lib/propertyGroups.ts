import type { PropertyGroup, ScampElement } from './element';

/**
 * Supporting tables for the `PropertyGroup` taxonomy declared in
 * `element.ts`. (`PropertyGroup` itself lives over there so
 * `ScampElement.toggledOffGroups` can reference it without a
 * circular import.)
 *
 * Deliberate deviation from the backlog spec (which listed
 * Sizing, Layout, and Visibility as togglable groups):
 *   - Sizing off collapses the element to zero / auto, which
 *     reads as "broken" rather than "previewing without these
 *     styles".
 *   - Layout off rearranges every descendant — too much
 *     side-effect for a section toggle.
 *   - Visibility already IS the user-facing surface for
 *     hide/show / opacity. Toggling its section would un-hide a
 *     previously-hidden element, inverting the eye-icon
 *     affordance.
 * Position, Element, and Export aren't togglable for unrelated
 * reasons — they're not CSS-property groups in this sense.
 */
export type { PropertyGroup };

/** Ordered for deterministic UI listings + canonical emit order. */
export const ALL_PROPERTY_GROUPS: ReadonlyArray<PropertyGroup> = [
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
export const isPropertyGroup = (s: string): s is PropertyGroup =>
  (ALL_PROPERTY_GROUPS as ReadonlyArray<string>).includes(s);

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
export const GROUP_FIELDS: Record<
  PropertyGroup,
  ReadonlyArray<keyof ScampElement>
> = {
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
export const FIELD_TO_GROUP: Partial<
  Record<keyof ScampElement, PropertyGroup>
> = (() => {
  const out: Partial<Record<keyof ScampElement, PropertyGroup>> = {};
  for (const [group, fields] of Object.entries(GROUP_FIELDS) as Array<
    [PropertyGroup, ReadonlyArray<keyof ScampElement>]
  >) {
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
export const GROUP_CUSTOM_PROPS: Partial<
  Record<PropertyGroup, ReadonlyArray<string>>
> = {
  background: [
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
  ],
};

/** Inverse of `GROUP_CUSTOM_PROPS`: CSS property name → group. */
export const CUSTOM_PROP_TO_GROUP: Record<string, PropertyGroup> = (() => {
  const out: Record<string, PropertyGroup> = {};
  for (const [group, keys] of Object.entries(GROUP_CUSTOM_PROPS) as Array<
    [PropertyGroup, ReadonlyArray<string>]
  >) {
    for (const key of keys) out[key] = group;
  }
  return out;
})();

/**
 * Sort + dedupe a list of group names. Called from the store
 * action that mutates `toggledOffGroups` so the on-disk
 * representation stays text-stable across saves and rounds-trips
 * cleanly through agent edits.
 */
export const canonicalizeGroupList = (
  groups: ReadonlyArray<PropertyGroup>
): ReadonlyArray<PropertyGroup> => {
  const seen = new Set<PropertyGroup>();
  for (const g of groups) seen.add(g);
  return [...seen].sort();
};

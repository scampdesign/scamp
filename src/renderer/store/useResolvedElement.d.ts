import type { BreakpointOverride, PropertyGroup, ScampElement, StateOverride } from '@lib/element';
/**
 * React hook returning the element AS IT WILL RENDER at the active
 * breakpoint and active state — the raw element overlaid with every
 * applicable breakpoint override (widest first, narrower wins) and
 * then the active state's override on top.
 *
 * UiPanel sections use this so the displayed values track the active
 * axes without each section re-implementing the cascade.
 *
 * Returns `undefined` when the element doesn't exist (selection
 * stale, etc.). At desktop + default state with no overrides this is
 * an identity return — no extra work.
 */
export declare const useResolvedElement: (elementId: string | null) => ScampElement | undefined;
/**
 * Hook returning the fields the active breakpoint is currently
 * overriding for a given element — a set of BreakpointOverride keys.
 *
 * Sections use this to render a "has-override" indicator on fields
 * whose value differs from the desktop base.
 *
 * Always an empty set when the active breakpoint is desktop or the
 * element has no overrides at that breakpoint.
 */
export declare const useBreakpointOverrideFields: (elementId: string | null) => ReadonlySet<keyof BreakpointOverride>;
/**
 * Hook returning the fields the active state is currently overriding
 * for a given element — a set of StateOverride keys. Sections use
 * this to render the "has-override" indicator on fields that differ
 * from the rest state, and to decide whether the per-field "Reset to
 * default" affordance applies.
 *
 * Empty set when the active state is null (default) or the element
 * has no override registered at that state.
 */
export declare const useStateOverrideFields: (elementId: string | null) => ReadonlySet<keyof StateOverride>;
/**
 * The fields the active variant value (and the active state within it)
 * overrides on an element. Empty outside a variant.
 */
export declare const useVariantOverrideFields: (elementId: string | null) => ReadonlySet<keyof BreakpointOverride>;
/**
 * Hook returning the `groupToggle` prop for a section's
 * property-group eye button, or `undefined` when the eye should be
 * hidden. Reads the raw element's `toggledOffGroups` and exposes a
 * stable `onChange` bound to the canvas slice action. Element-scoped —
 * independent of the active breakpoint / state.
 *
 * `hasContent` is whether the group currently has anything to hide
 * (e.g. a shadow defined, a non-default border). The visibility rule
 * — previously duplicated in every section as
 * `hasContent || !isOn ? groupToggle : undefined` — lives here now:
 * the eye is hidden only when there's nothing to hide AND the group
 * is already on; while off it stays visible so the user can turn the
 * (empty) group back on without first re-adding a value.
 */
export declare const useGroupToggle: (elementId: string, group: PropertyGroup, hasContent: boolean) => {
    isOn: boolean;
    onChange: (on: boolean) => void;
} | undefined;

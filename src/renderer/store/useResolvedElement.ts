import { useCanvasStore } from './canvasSlice';
import { resolveElementAtState } from '@lib/stateCascade';
import { SECTION_FITS } from '@lib/multiEdit';
import { forSelection } from './selectionPatch';
import type {
  BreakpointOverride,
  PropertyGroup,
  ScampElement,
  StateOverride,
} from '@lib/element';

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
export const useResolvedElement = (
  elementId: string | null
): ScampElement | undefined => {
  const element = useCanvasStore((s) =>
    elementId ? s.elements[elementId] : undefined
  );
  const activeBreakpointId = useCanvasStore((s) => s.activeBreakpointId);
  const activeStateName = useCanvasStore((s) => s.activeStateName);
  const breakpoints = useCanvasStore((s) => s.breakpoints);
  if (!element) return undefined;
  return resolveElementAtState(
    element,
    activeBreakpointId,
    breakpoints,
    activeStateName
  );
};

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
export const useBreakpointOverrideFields = (
  elementId: string | null
): ReadonlySet<keyof BreakpointOverride> => {
  const keys = useCanvasStore((s) => {
    if (s.activeBreakpointId === 'desktop') return EMPTY_KEYS;
    if (!elementId) return EMPTY_KEYS;
    const el = s.elements[elementId];
    const override = el?.breakpointOverrides?.[s.activeBreakpointId];
    if (!override) return EMPTY_KEYS;
    return Object.keys(override) as Array<keyof BreakpointOverride>;
  });
  // Memoize the set only by identity of `keys`; React's referential
  // equality on the result means consumers only re-render when the
  // set of overridden fields actually changes.
  if (keys.length === 0) return EMPTY_SET;
  return new Set(keys);
};

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
export const useStateOverrideFields = (
  elementId: string | null
): ReadonlySet<keyof StateOverride> => {
  const keys = useCanvasStore((s) => {
    if (s.activeStateName === null) return EMPTY_STATE_KEYS;
    if (!elementId) return EMPTY_STATE_KEYS;
    const el = s.elements[elementId];
    const override = el?.stateOverrides?.[s.activeStateName];
    if (!override) return EMPTY_STATE_KEYS;
    return Object.keys(override) as Array<keyof StateOverride>;
  });
  if (keys.length === 0) return EMPTY_STATE_SET;
  return new Set(keys);
};

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
export const useGroupToggle = (
  elementId: string,
  group: PropertyGroup,
  hasContent: boolean
): { isOn: boolean; onChange: (on: boolean) => void } | undefined => {
  const isOn = useCanvasStore((s) => {
    const el = s.elements[elementId];
    if (!el) return true;
    return !el.toggledOffGroups.includes(group);
  });
  const togglePropertyGroup = useCanvasStore((s) => s.togglePropertyGroup);
  if (!hasContent && isOn) return undefined;
  return {
    isOn,
    // A multi-selection toggles the group on each element it fits.
    onChange: (on: boolean): void =>
      forSelection(group === 'typography' ? SECTION_FITS.typography : SECTION_FITS.box, elementId, ['toggledOffGroups'], (id) =>
        togglePropertyGroup(id, group, on)
      ),
  };
};

const EMPTY_KEYS: Array<keyof BreakpointOverride> = [];
const EMPTY_SET: ReadonlySet<keyof BreakpointOverride> = new Set();
const EMPTY_STATE_KEYS: Array<keyof StateOverride> = [];
const EMPTY_STATE_SET: ReadonlySet<keyof StateOverride> = new Set();

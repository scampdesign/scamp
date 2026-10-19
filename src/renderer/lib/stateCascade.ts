import type {
  ElementStateName,
  ScampElement,
  StateOverride,
} from './element';
import { resolveElementAtBreakpoint } from './breakpointCascade';
import type { Breakpoint } from '@shared/types';

const layer = (el: ScampElement, override: StateOverride | undefined): ScampElement => {
  if (!override || Object.keys(override).length === 0) return el;
  return {
    ...el,
    ...override,
    customProperties: { ...el.customProperties, ...(override.customProperties ?? {}) },
  };
};

/**
 * Return the element rendered at the active breakpoint AND active
 * state — base styles with breakpoint overrides layered first
 * (existing cascade), then the active state's overrides on top.
 *
 * The two axes are independent in this version: a state override
 * always wins when present, regardless of which breakpoint is active.
 * State × breakpoint matrix combinations are deferred — see the
 * element-states plan.
 *
 * `customProperties` merge object-wise across both axes so a
 * hover-state `box-shadow` is added to the base/breakpoint's
 * `transform` rather than wiping it.
 *
 * Pure: returns the input element unchanged when there's nothing to
 * apply. `activeState === null` short-circuits to the breakpoint
 * resolver alone. `activeVariantKey` (`variant=outline`) layers that
 * value's overrides, and its own state overrides, on top.
 */
export const resolveElementAtState = (
  element: ScampElement,
  activeBreakpointId: string,
  breakpoints: ReadonlyArray<Breakpoint>,
  activeState: ElementStateName | null,
  activeVariantKey: string | null = null
): ScampElement => {
  const atBreakpoint = resolveElementAtBreakpoint(
    element,
    activeBreakpointId,
    breakpoints
  );
  const atState = activeState === null ? atBreakpoint : layer(atBreakpoint, element.stateOverrides?.[activeState]);
  if (activeVariantKey === null) return atState;
  // A variant rule (`.root[data-v="x"] .el`) outranks the element's own
  // state rule (`.el:hover`), so it layers after it, as in the browser.
  const variant = element.variantOverrides?.[activeVariantKey];
  if (variant === undefined) return atState;
  const { states, ...variantBase } = variant;
  const atVariant = layer(atState, variantBase);
  return activeState === null ? atVariant : layer(atVariant, states?.[activeState]);
};

/**
 * An instance's component element with the values it picked layered in
 * axis order, which is the order their rules are written, so a later
 * axis wins a tie as in the browser. States aside: an instance isn't
 * previewed in one.
 */
export const layerVariants = (element: ScampElement, keys: ReadonlyArray<string>): ScampElement => {
  let out = element;
  for (const key of keys) {
    const override = element.variantOverrides?.[key];
    if (override === undefined) continue;
    const { states: _states, ...base } = override;
    out = layer(out, base);
  }
  return out;
};

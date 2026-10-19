import { resolveElementAtBreakpoint } from './breakpointCascade';
const layer = (el, override) => {
    if (!override || Object.keys(override).length === 0)
        return el;
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
export const resolveElementAtState = (element, activeBreakpointId, breakpoints, activeState, activeVariantKey = null) => {
    const atBreakpoint = resolveElementAtBreakpoint(element, activeBreakpointId, breakpoints);
    const atState = activeState === null ? atBreakpoint : layer(atBreakpoint, element.stateOverrides?.[activeState]);
    if (activeVariantKey === null)
        return atState;
    // A variant rule (`.root[data-v="x"] .el`) outranks the element's own
    // state rule (`.el:hover`), so it layers after it, as in the browser.
    const variant = element.variantOverrides?.[activeVariantKey];
    if (variant === undefined)
        return atState;
    const { states, ...variantBase } = variant;
    const atVariant = layer(atState, variantBase);
    return activeState === null ? atVariant : layer(atVariant, states?.[activeState]);
};

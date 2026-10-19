import { keysCovering, variantKeyParts, } from './element';
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
    // Variant rules (`.root[data-v="x"] .el`) outrank the element's own state
    // rule (`.el:hover`), so they layer after it, each key's base then its
    // state, in the order the rules are written, as in the browser.
    const picks = variantKeyParts(activeVariantKey);
    let out = atState;
    for (const key of picks === null ? [] : keysCovering(picks)) {
        const variant = element.variantOverrides?.[key];
        if (variant === undefined)
            continue;
        const { states, ...variantBase } = variant;
        out = layer(out, variantBase);
        if (activeState !== null)
            out = layer(out, states?.[activeState]);
    }
    return out;
};
/**
 * An instance's component element with the rules its picked values
 * reach layered in (`keysCovering`), in the order they're written, so a
 * later rule wins a tie as in the browser. States aside: an instance isn't
 * previewed in one.
 */
export const layerVariants = (element, keys) => {
    let out = element;
    for (const key of keys) {
        const override = element.variantOverrides?.[key];
        if (override === undefined)
            continue;
        const { states: _states, ...base } = override;
        out = layer(out, base);
    }
    return out;
};

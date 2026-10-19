import type { ElementStateName, ScampElement } from './element';
import type { Breakpoint } from '@shared/types';
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
export declare const resolveElementAtState: (element: ScampElement, activeBreakpointId: string, breakpoints: ReadonlyArray<Breakpoint>, activeState: ElementStateName | null, activeVariantKey?: string | null) => ScampElement;
/**
 * An instance's component element with the values it picked layered in
 * axis order, which is the order their rules are written, so a later
 * axis wins a tie as in the browser. States aside: an instance isn't
 * previewed in one.
 */
export declare const layerVariants: (element: ScampElement, keys: ReadonlyArray<string>) => ScampElement;

import type { ElementStateName, ScampElement } from '@lib/element';
/**
 * Fields that are NEVER written into a breakpoint or state override —
 * they're identity / tree / TSX-level concepts that can't
 * meaningfully change per-axis. A patch containing any of these
 * applies them to the element's top-level fields regardless of the
 * active breakpoint or state.
 */
export declare const BASE_ONLY_PATCH_FIELDS: Set<keyof ScampElement>;
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
export declare const assignPatchKey: <K extends keyof ScampElement>(target: Partial<ScampElement>, source: Partial<ScampElement>, key: K) => void;
export declare const applyPatchWithAxisRouting: (el: ScampElement, patch: Partial<ScampElement>, activeBreakpointId: string, activeStateName: ElementStateName | null, activeVariantKey?: string | null) => ScampElement;

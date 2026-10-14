/**
 * The `flex` shorthand, expanded to its three longhands.
 *
 * Agents and humans write `flex: 1` and `flex: none` far more often than
 * the longhands, so the parser has to read the shorthand. The generator
 * only ever writes longhands — see docs/archive/2026-09-04-flex-controls-plan.md,
 * open question 1 — so this is one-directional by design.
 */
export type FlexShorthand = {
    flexGrow: number;
    flexShrink: number;
    /** `''` means `auto` (the longhand's initial value). */
    flexBasis: string;
};
/**
 * Returns `null` for anything it can't reduce, so the declaration is
 * preserved verbatim in `customProperties` instead of being misread.
 */
export declare const parseFlexShorthand: (value: string) => FlexShorthand | null;

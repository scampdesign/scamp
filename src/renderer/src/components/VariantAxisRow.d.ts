import type { VariantAxis } from '@lib/element';
type Props = {
    axis: VariantAxis;
    /** Every axis, for the keys an edit leaves you on. */
    axes: ReadonlyArray<VariantAxis>;
    /** The frame being edited: each axis's value. */
    picks: Readonly<Record<string, string>>;
    /** Variants are desktop only, like states. */
    disabled: boolean;
    /** A value to open for renaming when the row first draws: a just-added axis's new value. */
    renameOnMount?: string;
};
/**
 * One variant property: its values as chips, in order. Click a value to
 * edit that frame, drag one to reorder, double-click a name to rename
 * it. The selected value can be made the default or removed.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export declare const VariantAxisRow: ({ axis, axes, picks, disabled, renameOnMount }: Props) => JSX.Element;
export {};

import { type VariantAxis } from '@lib/element';
type Props = {
    axis: VariantAxis;
    /** Variants are desktop only, like states. */
    disabled: boolean;
    /** A value to open for renaming when the row first draws: a just-added axis's new value. */
    renameOnMount?: string;
};
/**
 * One variant axis: its values as segments. Click a value to edit it,
 * double-click a name to rename it, and use × to remove the selected
 * value or the axis. see docs/plans/component-variants-plan.md
 */
export declare const VariantAxisRow: ({ axis, disabled, renameOnMount }: Props) => JSX.Element;
export {};

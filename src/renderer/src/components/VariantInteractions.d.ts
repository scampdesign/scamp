import { type VariantAxis } from '@lib/element';
type Props = {
    axes: ReadonlyArray<VariantAxis>;
    /** The frame being edited, which a new interaction starts from. */
    picks: Readonly<Record<string, string>>;
    disabled: boolean;
};
/**
 * The component's interactions, Figma's **Change to**: on a trigger, a
 * property goes from one value to another by itself. Hover, press, and
 * focus are CSS; click, a click outside, and Escape need the Scamp
 * framework's handler, so only its projects offer them.
 * see docs/plans/component-variants-plan.md, phase 7
 */
export declare const VariantInteractions: ({ axes, picks, disabled }: Props) => JSX.Element;
export {};

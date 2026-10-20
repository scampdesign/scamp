import { type VariantAxis } from '@lib/element';
type Props = {
    axes: ReadonlyArray<VariantAxis>;
    /** The frame being edited, which a new interaction starts from. */
    picks: Readonly<Record<string, string>>;
    disabled: boolean;
};
/**
 * The component's interactions, as Figma has them: **+** on the header
 * opens a panel with a **Trigger** and an **Action** (Change to), and
 * each interaction is one line. A new one starts from the frame being
 * edited. Hover, press, and focus are CSS; click, a click outside, and
 * Escape need the Scamp framework's handler, so only its projects offer
 * them. see docs/plans/component-variants-plan.md, phase 7
 */
export declare const VariantInteractions: ({ axes, picks, disabled }: Props) => JSX.Element;
export {};

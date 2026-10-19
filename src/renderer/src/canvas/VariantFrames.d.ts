type Props = {
    width: number;
    minHeight: number;
    scale: number;
};
/**
 * Every variant value but the one being edited, drawn read-only beside
 * the live frame. Clicking one edits it.
 * see docs/plans/component-variants-plan.md
 */
export declare const VariantFrames: ({ width, minHeight, scale }: Props) => JSX.Element | null;
export {};

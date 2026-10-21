type Props = {
    componentName: string;
    /** The component's artboard: a root that fills its container fills this. */
    artboardWidth: number;
    artboardHeight: number;
    /** The set's natural width, so the canvas frame can take it. */
    onWidth: (width: number) => void;
};
/**
 * Figma's component set: every variant of the component as a frame,
 * the first axis down the rows and the second across. The frame being
 * edited is live where it sits; the others are read-only renders, and
 * clicking one makes it live (`variantCellAt` in the interaction
 * layer). Each frame hugs the component, except along an axis where the
 * root fills its container, which takes the artboard's size.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export declare const VariantSet: ({ componentName, artboardWidth, artboardHeight, onWidth }: Props) => JSX.Element;
export {};

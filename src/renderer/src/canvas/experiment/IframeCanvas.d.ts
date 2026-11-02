/** One frame of a variant set. see docs/plans/component-variants-plan.md, phase 6 */
export type IframeVariant = {
    /** The look it draws (`size=large&tone=muted`), or null for the default. */
    key: string | null;
    /** The frame being edited; the others are only looked at. */
    live: boolean;
    /** Sides the frame hugs the component along, rather than taking the artboard's size. */
    hugWidth: boolean;
    hugHeight: boolean;
};
type Props = {
    /** The page's viewport height: what `100vh` means, as the preview's window gives it. */
    viewportHeight: number;
    /** Set for a frame of the component editor's variant set; absent for a page or an artboard. */
    variant?: IframeVariant;
};
export declare const IframeCanvas: ({ viewportHeight, variant }: Props) => JSX.Element;
export {};

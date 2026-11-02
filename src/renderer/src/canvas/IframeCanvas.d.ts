/** The editor's own attributes on the drawn page, which no capture of it should keep. */
export declare const EDITOR_MARKS: string[];
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
/** The drawn page as a document of its own, without the editor's marks: what a thumbnail shows. */
export declare const canvasSnapshotHtml: (doc: Document) => string;
type Props = {
    /** The page's viewport height: what `100vh` means, as the preview's window gives it. */
    viewportHeight: number;
    /** Set for a frame of the component editor's variant set; absent for a page or an artboard. */
    variant?: IframeVariant;
    /**
     * The canvas width, when its content isn't clipped: what runs past it shows,
     * as on today's canvas. The page still lays out at this width.
     */
    overflowWidth?: number;
};
export declare const IframeCanvas: ({ viewportHeight, variant, overflowWidth }: Props) => JSX.Element;
export {};

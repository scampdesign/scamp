/**
 * Start-screen thumbnail capture. The component-sidebar equivalent one
 * level down is `componentThumbnail.ts`; this differs in two ways.
 *
 * It crops. A component is small and square-ish, so its capture goes to
 * disk as-is. A page is 1200 by several thousand, and a card is a wide
 * rectangle — see `@lib/thumbnailCrop` for what that means.
 *
 * And it only fires for the home page. The card's job is recognition: a
 * project should look like itself on the start screen, not like whichever
 * page you happened to stop on.
 *
 * see docs/notes/project-thumbnails.md
 */
/** The page whose capture represents the whole project. */
export declare const THUMBNAIL_PAGE_NAME = "home";
/**
 * The name to capture under for a target that was just saved, or null
 * when this save is not the project's home.
 *
 * A Scamp-framework project has no pages: every page is a view, opened
 * through `activeComponent`, so its edit target is always a
 * `component`. The capture was gated on `kind === 'page'` and so never
 * ran at all — every framework project has had a blank card on the
 * start screen since the format shipped.
 *
 * The name needs translating as well as the kind. A page is `home`; the
 * view that serves `/` is `Home`, and the slug is what the two formats
 * agree on.
 *
 * A reusable component is not a page however it is named, which is why
 * this takes the tree's kind rather than guessing from the name.
 * see docs/notes/project-thumbnails.md
 */
export declare const thumbnailNameFor: (target: {
    kind: "page" | "component";
    name: string;
}, treeKind: "view" | "component" | undefined) => string | null;
export type CaptureProjectThumbnailInputs = {
    projectPath: string;
    /** The page that was just saved. Anything but home is ignored. */
    pageName: string;
    /** Its CSS file, which the canvas must still be showing when the capture runs. */
    cssPath: string;
};
/** Fire-and-forget; never blocks the underlying save. */
export declare const captureAndPersistProjectThumbnail: (inputs: CaptureProjectThumbnailInputs) => void;
/**
 * Run a scheduled capture now, because the project is closing and the
 * timer would otherwise fire against an unmounted canvas.
 *
 * Safe to call immediately before the unmount: the capture clones the
 * frame and detaches the copy synchronously, so the rasterising that
 * follows no longer depends on the canvas still being there. No-op when
 * nothing is scheduled — closing without editing should not rewrite an
 * identical thumbnail.
 */
export declare const flushPendingProjectThumbnail: (projectPath: string) => void;

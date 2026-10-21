import type { PreviewOpenArgs, ProjectData, ProjectFormat } from '@shared/types';
/** What the canvas has open: a page by name, or a view or component. */
export type PreviewOpen = {
    page: string | null;
    view: string | null;
    component: string | null;
};
/** The preview's label for a component, beside the views' slugs. */
export declare const componentPreviewName: (name: string) => string;
/**
 * Where the Preview button goes, or null when it can't preview.
 *
 * - A Next.js project previews a page at its route through `next dev`; a
 *   view, at its wrapper page's route.
 * - A Scamp framework project previews a view at the route that renders
 *   it (which runs its `load()`), or with its defaults at `/_views/<Name>`.
 *   A component previews alone at `/_components/<Name>`, where its click
 *   interactions run as they will on a page. CONTRACT.md §2.2
 * - A legacy project can't preview.
 */
export declare const previewTargetFor: (format: ProjectFormat, open: PreviewOpen, project: Pick<ProjectData, "pages" | "components" | "routes">) => Omit<PreviewOpenArgs, "projectPath"> | null;

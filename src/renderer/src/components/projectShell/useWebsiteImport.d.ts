import type { Breakpoint, ProjectData } from '@shared/types';
/**
 * The app window's half of website import.
 *
 * The import window captures a page and hands the payload here, because
 * this is where the project is: the reducer, the generator, and the
 * file-writing IPC all live on this side. The importer itself never
 * touches a file.
 *
 * A view is created and filled in two steps rather than one — `+ Add
 * Page`'s own path writes the view and its route, and then the
 * generated markup replaces the scaffold's. Reusing it means an
 * imported view is indistinguishable from a hand-made one, route
 * included.
 * see docs/archive/2026-09-23-website-import-plan.md
 */
type Options = {
    project: ProjectData;
    /**
     * The project's breakpoints. `generateCode` emits no `@media` blocks
     * without them, so the overrides the import read would be computed
     * and then silently dropped on the way to disk.
     */
    breakpoints: Breakpoint[];
    onProjectChange?: (update: (prev: ProjectData) => ProjectData) => void;
    /** Opens the freshly-imported view on the canvas. */
    openView: (name: string) => void;
    /** Views an undone multi-page import removed, so the canvas can let go of one that's open. */
    onViewsRemoved?: (names: ReadonlyArray<string>) => void;
};
export declare const useWebsiteImport: ({ project, breakpoints, onProjectChange, openView, onViewsRemoved, }: Options) => void;
export {};

import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import type { ComponentKind, ProjectData } from '@shared/types';
import type { ActiveComponent, ComponentEdit, ComponentMenuState, DeletingComponent } from './types';
type ProjectChange = (next: ProjectData | ((prev: ProjectData) => ProjectData)) => void;
type Args = {
    project: ProjectData;
    onProjectChange?: ProjectChange;
    activeComponent: ActiveComponent | null;
    setActiveComponentState: (next: ActiveComponent | null) => void;
    activePageName: string | null;
    setActivePageName: (next: string | null) => void;
    /**
     * Scamp-framework projects: write the route that renders a page just
     * created. A page nothing routes is a page nobody can open, and the
     * Next.js format has always written its wrapper — this is the same
     * courtesy for the format that replaced it. Absent for other formats.
     */
    ensureRouteFor?: (viewName: string) => Promise<void>;
    /**
     * Scamp-framework projects: point the route at a renamed view, and
     * move it when its name was the one the app gave it. Without this a
     * rename leaves a route importing a folder that no longer exists.
     */
    renameRouteFor?: (oldView: string, newView: string) => Promise<void>;
    openComponent: (name: string, fromPage: string | null, kind?: ComponentKind) => void;
    persistActiveSource: () => void;
};
export type UseComponentManagement = {
    componentEdit: ComponentEdit;
    setComponentEdit: Dispatch<SetStateAction<ComponentEdit>>;
    componentEditError: string | null;
    setComponentEditError: Dispatch<SetStateAction<string | null>>;
    creatingComponent: boolean;
    renamingComponent: boolean;
    handleAddComponent: (name: string, kind: ComponentKind) => Promise<void>;
    handleRenameComponent: (oldName: string, newName: string) => Promise<boolean>;
    openComponentMenu: (e: ReactMouseEvent, componentName: string) => void;
    componentMenu: ComponentMenuState | null;
    closeComponentMenu: () => void;
    requestDeleteComponent: (componentName: string) => void;
    deletingComponent: DeletingComponent | null;
    setDeletingComponent: Dispatch<SetStateAction<DeletingComponent | null>>;
    componentDeleteBusy: boolean;
    handleConfirmDeleteComponent: () => Promise<void>;
    /** "Add page": a view named from the slug, plus its route wrapper. Throws on failure. */
    handleAddView: (slug: string) => Promise<void>;
    /** Rename a view by its route slug (the Pages list's spelling). */
    handleRenameView: (viewName: string, newSlug: string) => Promise<boolean>;
    /** The page a "Convert to view" confirm dialog is open for. */
    convertingPage: string | null;
    setConvertingPage: Dispatch<SetStateAction<string | null>>;
    convertPageBusy: boolean;
    convertPageError: string | null;
    requestConvertPageToView: (pageName: string) => void;
    handleConfirmConvertPage: () => Promise<void>;
    /** Convert every plain page to a view, for the nextjs → scamp migration. */
    convertAllPagesToViews: () => Promise<ProjectData>;
};
/**
 * Owns the Components sidebar's inline-edit + context-menu state and the
 * multi-file component-management handlers: add (create + enter editor),
 * rename (rewrite the component + every referencing page, rekey nothing —
 * pages keep their order), and delete (strip every instance from each
 * page, then remove the folder). Delete/rename arm target-swap
 * suppression so the watcher doesn't fight the in-flight multi-file write.
 * see docs/notes/components-multi-file-ops.md
 */
export declare const useComponentManagement: ({ project, onProjectChange, activeComponent, setActiveComponentState, activePageName, setActivePageName, ensureRouteFor, renameRouteFor, openComponent, persistActiveSource, }: Args) => UseComponentManagement;
export {};

import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import type { ProjectData } from '@shared/types';
import type { PageMenuItem } from '../PageContextMenu';
import type { PageEdit, PageMenuState } from './types';
type ProjectChange = (next: ProjectData | ((prev: ProjectData) => ProjectData)) => void;
type Args = {
    /** Adds a "Convert to view…" item to the page menu when given. */
    onConvertPageToView?: (pageName: string) => void;
    /**
     * When given, "+ Add Page" creates a view (a page's design under
     * views/<Name>/ plus its route wrapper) instead of a legacy app/ page.
     * Resolves once the view is open.
     */
    onCreatePageAsView?: (slug: string) => Promise<void>;
    project: ProjectData;
    onProjectChange?: ProjectChange;
    activePageName: string | null;
    setActivePageName: (name: string | null) => void;
    persistActiveSource: () => void;
};
export type UsePageManagement = {
    existingPageNames: string[];
    pageEdit: PageEdit;
    setPageEdit: Dispatch<SetStateAction<PageEdit>>;
    pageEditBusy: boolean;
    pageEditError: string | null;
    setPageEditError: Dispatch<SetStateAction<string | null>>;
    isEditingPage: boolean;
    resetPageEdit: () => void;
    handleAddPage: (name: string) => Promise<boolean>;
    handleDuplicatePage: (sourcePageName: string, newName: string) => Promise<boolean>;
    handleRenamePage: (oldName: string, newName: string) => Promise<boolean>;
    openPageMenu: (e: ReactMouseEvent, pageName: string) => void;
    buildMenuItems: (pageName: string) => PageMenuItem[];
    pageMenu: PageMenuState | null;
    closePageMenu: () => void;
    deletingPageName: string | null;
    setDeletingPageName: Dispatch<SetStateAction<string | null>>;
    deletePageError: string | null;
    setDeletePageError: Dispatch<SetStateAction<string | null>>;
    handleDeletePage: (name: string) => Promise<void>;
};
/**
 * Owns the Pages sidebar's inline-edit + context-menu state and every
 * page CRUD handler (add / duplicate / rename / delete). Create/rename
 * flush the pending write and persist the outgoing target first so the
 * snapshot the load effect re-parses is current; rename also rekeys the
 * page's history bucket and pushes a `rename-page` entry.
 */
export declare const usePageManagement: ({ project, onProjectChange, activePageName, setActivePageName, persistActiveSource, onConvertPageToView, onCreatePageAsView, }: Args) => UsePageManagement;
export {};

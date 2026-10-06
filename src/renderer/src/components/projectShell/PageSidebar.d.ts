import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import type { ComponentFile, PageFile } from '@shared/types';
import type { ActiveComponent, PageEdit } from './types';
type Props = {
    pages: PageFile[];
    /** Views: a page's design under views/<Name>/. Listed by route slug. */
    views: ComponentFile[];
    existingPageNames: string[];
    pageEdit: PageEdit;
    pageEditError: string | null;
    pageEditBusy: boolean;
    isEditingPage: boolean;
    activePageName: string | null;
    activeComponent: ActiveComponent | null;
    setPageEdit: Dispatch<SetStateAction<PageEdit>>;
    setPageEditError: Dispatch<SetStateAction<string | null>>;
    resetPageEdit: () => void;
    handleAddPage: (name: string) => Promise<void>;
    handleDuplicatePage: (sourcePageName: string, newName: string) => Promise<void>;
    handleRenamePage: (oldName: string, newName: string) => Promise<void>;
    openPageMenu: (e: ReactMouseEvent, pageName: string) => void;
    openView: (viewName: string) => void;
    openViewMenu: (e: ReactMouseEvent, viewName: string) => void;
    handleRenameView: (viewName: string, newSlug: string) => Promise<void>;
    persistActiveSource: () => void;
    /** Opens the importer's browser window. Absent hides the entry point. */
    onImportWebsite?: () => void;
    /** Import pages from a React app's project folder. */
    onImportReact?: () => void;
    setActiveComponentState: (next: ActiveComponent | null) => void;
    setActivePageName: (name: string | null) => void;
};
export declare const PageSidebar: ({ pages, views, existingPageNames, pageEdit, pageEditError, pageEditBusy, isEditingPage, activePageName, activeComponent, setPageEdit, setPageEditError, resetPageEdit, handleAddPage, handleDuplicatePage, handleRenamePage, openPageMenu, openView, openViewMenu, handleRenameView, persistActiveSource, onImportWebsite, onImportReact, setActiveComponentState, setActivePageName, }: Props) => JSX.Element;
export {};

import { type Dispatch, type SetStateAction } from 'react';
import type { ComponentFile } from '@shared/types';
import { type PageMenuItem } from '../PageContextMenu';
import type { UseInstanceFlows } from './useInstanceFlows';
import type { ComponentEdit, ComponentMenuState, DeletingComponent, PageMenuState } from './types';
type Props = {
    components: ComponentFile[];
    instanceFlows: UseInstanceFlows;
    pageMenu: PageMenuState | null;
    buildMenuItems: (pageName: string) => PageMenuItem[];
    /** "Move to <group>" entries for a page or view, by its slug. */
    moveItemsFor: (slug: string) => PageMenuItem[];
    closePageMenu: () => void;
    deletingPageName: string | null;
    deletePageError: string | null;
    handleDeletePage: (name: string) => Promise<void>;
    setDeletingPageName: Dispatch<SetStateAction<string | null>>;
    setDeletePageError: Dispatch<SetStateAction<string | null>>;
    componentMenu: ComponentMenuState | null;
    closeComponentMenu: () => void;
    setComponentEdit: Dispatch<SetStateAction<ComponentEdit>>;
    setComponentEditError: Dispatch<SetStateAction<string | null>>;
    requestDeleteComponent: (componentName: string) => void;
    /** A view renames by its route slug, inline in the Pages list. */
    startRenameView: (viewName: string) => void;
    convertingPage: string | null;
    setConvertingPage: Dispatch<SetStateAction<string | null>>;
    convertPageBusy: boolean;
    convertPageError: string | null;
    handleConfirmConvertPage: () => Promise<void>;
    deletingComponent: DeletingComponent | null;
    componentDeleteBusy: boolean;
    handleConfirmDeleteComponent: () => Promise<void>;
    setDeletingComponent: Dispatch<SetStateAction<DeletingComponent | null>>;
};
/**
 * All of ProjectShell's floating UI: the page/component right-click menus,
 * the element context menu, and every confirmation dialog (delete page,
 * convert-to-component, lock-prop, delete-component, delete-prop-text,
 * detach). Purely presentational — state + handlers come from the page /
 * component / instance-flow hooks via props.
 */
export declare const ProjectModals: ({ components, instanceFlows, pageMenu, buildMenuItems, moveItemsFor, closePageMenu, deletingPageName, deletePageError, handleDeletePage, setDeletingPageName, setDeletePageError, componentMenu, closeComponentMenu, setComponentEdit, setComponentEditError, requestDeleteComponent, deletingComponent, componentDeleteBusy, handleConfirmDeleteComponent, setDeletingComponent, convertingPage, setConvertingPage, convertPageBusy, convertPageError, handleConfirmConvertPage, startRenameView, }: Props) => JSX.Element;
export {};

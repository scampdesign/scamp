import { useState, } from 'react';
import { componentKindOf } from '@shared/types';
import { viewSlugFor } from '@shared/templates';
import { errorMessage } from '@shared/errorMessage';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { flushPendingPageWrite } from '../../syncBridge';
/**
 * Owns the Pages sidebar's inline-edit + context-menu state and every
 * page CRUD handler (add / duplicate / rename / delete). Create/rename
 * flush the pending write and persist the outgoing target first so the
 * snapshot the load effect re-parses is current; rename also rekeys the
 * page's history bucket and pushes a `rename-page` entry.
 */
export const usePageManagement = ({ project, onProjectChange, activePageName, setActivePageName, persistActiveSource, onConvertPageToView, onCreatePageAsView, }) => {
    // Pages sidebar inline-edit state. `'new'` shows the Add page input at
    // the bottom of the list. `{ duplicate: name }` replaces the named row
    // with an input seeded from that page. `null` means no editing in
    // progress and the sidebar behaves normally.
    const [pageEdit, setPageEdit] = useState(null);
    const [pageEditBusy, setPageEditBusy] = useState(false);
    const [pageEditError, setPageEditError] = useState(null);
    // Right-click context menu — stores the viewport coords and the page
    // name the menu was opened for.
    const [pageMenu, setPageMenu] = useState(null);
    // Page pending deletion (confirmation dialog is open).
    const [deletingPageName, setDeletingPageName] = useState(null);
    // Inline error shown in the delete-confirmation dialog when the
    // delete IPC fails; keeps the dialog open so the user can retry.
    const [deletePageError, setDeletePageError] = useState(null);
    // Views share the route namespace: a view's slug is a page name.
    const existingPageNames = [
        ...project.pages.map((p) => p.name),
        ...project.components
            .filter((c) => componentKindOf(c) === 'view')
            .map((c) => viewSlugFor(c.name)),
    ];
    const resetPageEdit = () => {
        setPageEdit(null);
        setPageEditBusy(false);
        setPageEditError(null);
    };
    const handleAddPage = async (name) => {
        setPageEditBusy(true);
        setPageEditError(null);
        if (onCreatePageAsView) {
            try {
                await onCreatePageAsView(name);
                resetPageEdit();
                return true;
            }
            catch (e) {
                setPageEditError(errorMessage(e));
                setPageEditBusy(false);
                return false;
            }
        }
        try {
            const newPage = await window.scamp.createPage({
                projectPath: project.path,
                pageName: name,
            });
            // Mirror the outgoing page's in-memory state into project.pages
            // BEFORE switching. Without this, returning later via the sidebar
            // re-parses the page from a stale tsxContent (the snapshot
            // captured at project open) and any edits since then disappear.
            flushPendingPageWrite();
            persistActiveSource();
            onProjectChange?.((prev) => ({
                ...prev,
                pages: [...prev.pages, newPage],
            }));
            setActivePageName(newPage.name);
            resetPageEdit();
            return true;
        }
        catch (e) {
            setPageEditError(errorMessage(e));
            setPageEditBusy(false);
            return false;
        }
    };
    const handleDuplicatePage = async (sourcePageName, newName) => {
        setPageEditBusy(true);
        setPageEditError(null);
        try {
            const newPage = await window.scamp.duplicatePage({
                projectPath: project.path,
                sourcePageName,
                newPageName: newName,
            });
            onProjectChange?.({
                ...project,
                pages: [...project.pages, newPage],
            });
            setActivePageName(newPage.name);
            resetPageEdit();
            return true;
        }
        catch (e) {
            setPageEditError(errorMessage(e));
            setPageEditBusy(false);
            return false;
        }
    };
    const handleRenamePage = async (oldName, newName) => {
        setPageEditBusy(true);
        setPageEditError(null);
        try {
            // Ensure any pending debounced write lands on the OLD files
            // before the rename swaps them out from under us.
            flushPendingPageWrite();
            // Capture the old tsxPath so we can rekey the history bucket
            // after the rename. The page's path changes (the file moves on
            // disk), so without rekey the in-session history would be
            // stranded under the old key and lost.
            const oldTsxPath = project.pages.find((p) => p.name === oldName)?.tsxPath;
            const newPage = await window.scamp.renamePage({
                projectPath: project.path,
                oldPageName: oldName,
                newPageName: newName,
            });
            const nextPages = project.pages.map((p) => p.name === oldName ? newPage : p);
            onProjectChange?.({ ...project, pages: nextPages });
            if (activePageName === oldName) {
                setActivePageName(newPage.name);
            }
            // Move the history bucket to the new tsxPath, then push a
            // `rename-page` entry. The entry lives in the (now renamed)
            // page's bucket so undoing it surfaces the pre-rename state.
            if (oldTsxPath) {
                useHistoryStore.getState().rekeyPage(oldTsxPath, newPage.tsxPath);
            }
            useHistoryStore.getState().commitHistory({
                kind: 'rename-page',
                previousName: oldName,
                pageName: newName,
            }, useCanvasStore.getState().elements);
            resetPageEdit();
            return true;
        }
        catch (e) {
            setPageEditError(errorMessage(e));
            setPageEditBusy(false);
            return false;
        }
    };
    const handleDeletePage = async (name) => {
        setDeletePageError(null);
        try {
            await window.scamp.deletePage({ projectPath: project.path, pageName: name });
            const nextPages = project.pages.filter((p) => p.name !== name);
            onProjectChange?.({ ...project, pages: nextPages });
            if (activePageName === name) {
                setActivePageName(nextPages[0]?.name ?? null);
            }
            setDeletingPageName(null);
        }
        catch (e) {
            // Surface the failure inline in the confirm dialog and keep it
            // open so the user can retry — mirrors create/rename handling.
            setDeletePageError(errorMessage(e));
        }
    };
    const openPageMenu = (e, pageName) => {
        e.preventDefault();
        e.stopPropagation();
        setPageMenu({ x: e.clientX, y: e.clientY, pageName });
    };
    const buildMenuItems = (pageName) => [
        {
            label: 'Rename',
            onSelect: () => {
                setPageEditError(null);
                setPageEdit({ rename: pageName });
            },
        },
        {
            label: 'Duplicate',
            onSelect: () => {
                setPageEditError(null);
                setPageEdit({ duplicate: pageName });
            },
        },
        ...(onConvertPageToView
            ? [
                {
                    label: 'Convert to view…',
                    onSelect: () => onConvertPageToView(pageName),
                },
            ]
            : []),
        {
            label: 'Delete',
            destructive: true,
            disabled: project.pages.length <= 1,
            onSelect: () => setDeletingPageName(pageName),
        },
    ];
    return {
        existingPageNames,
        pageEdit,
        setPageEdit,
        pageEditBusy,
        pageEditError,
        setPageEditError,
        isEditingPage: pageEdit !== null,
        resetPageEdit,
        handleAddPage,
        handleDuplicatePage,
        handleRenamePage,
        openPageMenu,
        buildMenuItems,
        pageMenu,
        closePageMenu: () => setPageMenu(null),
        deletingPageName,
        setDeletingPageName,
        deletePageError,
        setDeletePageError,
        handleDeletePage,
    };
};

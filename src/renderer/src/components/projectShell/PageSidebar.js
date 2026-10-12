import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, } from 'react';
import { viewNameForPage, viewSlugFor } from '@shared/templates';
import { addGroup, groupNameError, groupPages, insertPageAfter, movePageToGroup, moveRow, nextGroupName, reconcileLayout, removeGroup, renameGroup, renamePage, } from '@lib/pageLayout';
import { flushPendingPageWrite } from '../../syncBridge';
import { PageContextMenu } from '../PageContextMenu';
import { PageNameInput } from '../PageNameInput';
import { PageGroupHeader } from './PageGroupHeader';
import styles from '../ProjectShell.module.css';
/** Every page and view by slug. A view and a page never share a slug. */
const rowsBySlug = (pages, views) => new Map([
    ...pages.map((page) => [page.name, { slug: page.name, kind: 'page', page }]),
    ...views.map((view) => {
        const slug = viewSlugFor(view.name);
        return [slug, { slug, kind: 'view', view }];
    }),
]);
const PAGE_MIME = 'application/x-scamp-page';
const GROUP_MIME = 'application/x-scamp-page-group';
/** Collapsed groups are one person's view of the list, so they stay on this machine. */
const collapsedKey = (projectPath) => `scamp:page-groups-collapsed:${projectPath}`;
const readCollapsed = (projectPath) => {
    try {
        const parsed = JSON.parse(globalThis.localStorage?.getItem(collapsedKey(projectPath)) ?? '[]');
        return new Set(Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : []);
    }
    catch {
        return new Set();
    }
};
const writeCollapsed = (projectPath, names) => {
    try {
        globalThis.localStorage?.setItem(collapsedKey(projectPath), JSON.stringify([...names]));
    }
    catch {
        // Only a preference: losing it shows the groups expanded.
    }
};
/** Where over a row the pointer is: a page-on-group drop has a middle "inside" band. */
const dropPositionFor = (e, intoGroup) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = rect.height === 0 ? 0.5 : (e.clientY - rect.top) / rect.height;
    if (intoGroup)
        return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
    return y < 0.5 ? 'before' : 'after';
};
export const PageSidebar = ({ projectPath, pages, views, existingPageNames, pageEdit, pageEditError, pageEditBusy, isEditingPage, activePageName, activeComponent, setPageEdit, setPageEditError, resetPageEdit, handleAddPage, handleDuplicatePage, handleRenamePage, openPageMenu, openView, openViewMenu, handleRenameView, persistActiveSource, onImportWebsite, onImportReact, setActiveComponentState, setActivePageName, pageLayout, onPageLayoutChange, }) => {
    const rows = rowsBySlug(pages, views);
    const layout = reconcileLayout([...rows.keys()], pageLayout);
    const [collapsed, setCollapsed] = useState(() => readCollapsed(projectPath));
    const [dragOver, setDragOver] = useState(null);
    const [groupMenu, setGroupMenu] = useState(null);
    const [renamingGroup, setRenamingGroup] = useState(null);
    /** The group "Add page here" was chosen from, while its name field is open. */
    const [addToGroup, setAddToGroup] = useState(null);
    /** Pages picked with Cmd/Ctrl+click, to group together. */
    const [selected, setSelected] = useState(() => new Set());
    const [selectionMenu, setSelectionMenu] = useState(null);
    const activeSlug = (() => {
        for (const row of rows.values()) {
            if (row.kind === 'view' ? activeComponent?.name === row.view.name : activeComponent === null && activePageName === row.page.name) {
                return row.slug;
            }
        }
        return null;
    })();
    /** Cmd/Ctrl+click: add or remove a page. The first one also picks up the open page. */
    const toggleSelected = (slug) => {
        setSelected((prev) => {
            const next = new Set(prev.size === 0 && activeSlug !== null ? [activeSlug] : prev);
            if (next.has(slug) && prev.size > 0)
                next.delete(slug);
            else
                next.add(slug);
            return next;
        });
    };
    const groupSelection = () => {
        const slugs = [...selected].filter((slug) => rows.has(slug));
        setSelected(new Set());
        if (slugs.length === 0)
            return;
        const name = nextGroupName(layout);
        arrange((shown) => groupPages(shown, slugs, name));
        setRenamingGroup(name);
    };
    /** Right-click inside a multi-page selection acts on the selection. */
    const handleRowContextMenu = (e, slug, open) => {
        if (selected.has(slug) && selected.size > 1) {
            e.preventDefault();
            setSelectionMenu({ x: e.clientX, y: e.clientY });
            return;
        }
        setSelected(new Set());
        open(e);
    };
    /** Apply an arrangement to the whole list as shown, so it's stored complete. */
    const arrange = (change) => {
        onPageLayoutChange(() => change(layout));
    };
    /** Keep a stored layout in step with a page operation; nothing to do if there isn't one. */
    const follow = (change) => {
        onPageLayoutChange((stored) => (stored === undefined ? undefined : change(stored)));
    };
    const setGroupCollapsed = (name, value, rename) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.delete(name);
            if (value)
                next.add(rename ?? name);
            writeCollapsed(projectPath, next);
            return next;
        });
    };
    const keyOf = (ref) => (ref.kind === 'page' ? `page:${ref.slug}` : `group:${ref.name}`);
    const dropClass = (ref) => {
        if (dragOver === null || dragOver.key !== keyOf(ref))
            return '';
        if (dragOver.position === 'inside')
            return styles.dropInside ?? '';
        return (dragOver.position === 'before' ? styles.dropBefore : styles.dropAfter) ?? '';
    };
    /** Drag handlers for one row: pages and group headers both move and accept drops. */
    const dragFor = (ref) => {
        const accepts = (e) => e.dataTransfer.types.includes(PAGE_MIME) ? 'page' : e.dataTransfer.types.includes(GROUP_MIME) ? 'group' : null;
        return {
            draggable: !isEditingPage,
            onDragStart: (e) => {
                e.dataTransfer.setData(ref.kind === 'page' ? PAGE_MIME : GROUP_MIME, ref.kind === 'page' ? ref.slug : ref.name);
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragOver: (e) => {
                const kind = accepts(e);
                if (kind === null)
                    return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const position = dropPositionFor(e, ref.kind === 'group' && kind === 'page');
                if (dragOver?.key !== keyOf(ref) || dragOver.position !== position)
                    setDragOver({ key: keyOf(ref), position });
            },
            onDragLeave: () => {
                setDragOver((prev) => (prev?.key === keyOf(ref) ? null : prev));
            },
            onDrop: (e) => {
                const kind = accepts(e);
                setDragOver(null);
                if (kind === null)
                    return;
                e.preventDefault();
                const id = e.dataTransfer.getData(kind === 'page' ? PAGE_MIME : GROUP_MIME);
                const moving = kind === 'page' ? { kind: 'page', slug: id } : { kind: 'group', name: id };
                const position = dropPositionFor(e, ref.kind === 'group' && kind === 'page');
                arrange((shown) => moveRow(shown, moving, ref, position));
            },
            onDragEnd: () => setDragOver(null),
        };
    };
    const handleNewGroup = () => {
        const name = nextGroupName(layout);
        arrange((shown) => addGroup(shown, name));
        setRenamingGroup(name);
    };
    const renderRow = (row) => {
        const ref = { kind: 'page', slug: row.slug };
        const drag = dragFor(ref);
        const dropping = dropClass(ref);
        return renderPageRow(row, drag, dropping);
    };
    const newPageInput = (_jsx("li", { children: _jsx(PageNameInput, { existingNames: existingPageNames, onConfirm: (name) => void handleAddPage(name).then((ok) => {
                const group = addToGroup;
                setAddToGroup(null);
                if (ok && group !== null)
                    arrange((shown) => movePageToGroup(reconcileLayout([...rows.keys(), name], shown), name, group));
            }), onCancel: () => {
                setAddToGroup(null);
                resetPageEdit();
            }, error: pageEditError, busy: pageEditBusy }) }));
    const renderPageRow = (row, drag, dropping) => {
        if (row.kind === 'view') {
            const view = row.view;
            const isRenaming = pageEdit !== null &&
                pageEdit !== 'new' &&
                'rename' in pageEdit &&
                pageEdit.rename === row.slug;
            if (isRenaming) {
                return (_jsx("li", { children: _jsx(PageNameInput, { initialValue: row.slug, existingNames: existingPageNames.filter((n) => n !== row.slug), onConfirm: (name) => void handleRenameView(view.name, name).then((ok) => {
                            if (ok)
                                follow((stored) => renamePage(stored, row.slug, viewSlugFor(viewNameForPage(name))));
                        }), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }, `view:${view.name}`));
            }
            const isActive = activeComponent !== null && activeComponent.name === view.name;
            return (_jsx("li", { children: _jsx("button", { className: `${styles.pageButton} ${isActive ? styles.pageActive : ''} ${selected.has(row.slug) ? styles.pageSelected : ''} ${dropping}`, "aria-pressed": selected.has(row.slug), onClick: (e) => {
                        if (e.metaKey || e.ctrlKey) {
                            toggleSelected(row.slug);
                            // Focused, so Cmd+G lands on the list's handler.
                            e.currentTarget.focus();
                            return;
                        }
                        setSelected(new Set());
                        if (isEditingPage || isActive)
                            return;
                        openView(view.name);
                    }, onContextMenu: (e) => handleRowContextMenu(e, row.slug, (ev) => openViewMenu(ev, view.name)), type: "button", "data-page-slug": row.slug, ...drag, children: row.slug }) }, `view:${view.name}`));
        }
        const page = row.page;
        const isDuplicating = pageEdit !== null &&
            pageEdit !== 'new' &&
            'duplicate' in pageEdit &&
            pageEdit.duplicate === page.name;
        const isRenaming = pageEdit !== null &&
            pageEdit !== 'new' &&
            'rename' in pageEdit &&
            pageEdit.rename === page.name;
        if (isDuplicating) {
            // Seed with `[name]-copy` and select just the "-copy"
            // portion so the user can retype it instantly.
            const seed = `${page.name}-copy`;
            return (_jsx("li", { children: _jsx(PageNameInput, { initialValue: seed, existingNames: existingPageNames, selectRange: [page.name.length, seed.length], onConfirm: (name) => void handleDuplicatePage(page.name, name).then((ok) => {
                        if (ok)
                            follow((stored) => insertPageAfter(stored, name, page.name));
                    }), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }, page.name));
        }
        if (isRenaming) {
            // Exclude the current name from collision checks so
            // "rename home → home" surfaces as an explicit no-op
            // from the IPC rather than as a spurious collision.
            const otherNames = existingPageNames.filter((n) => n !== page.name);
            return (_jsx("li", { children: _jsx(PageNameInput, { initialValue: page.name, existingNames: otherNames, onConfirm: (name) => void handleRenamePage(page.name, name).then((ok) => {
                        if (ok)
                            follow((stored) => renamePage(stored, page.name, name));
                    }), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }, page.name));
        }
        return (_jsx("li", { children: _jsx("button", { className: `${styles.pageButton} ${activeComponent === null &&
                    activePageName === page.name
                    ? styles.pageActive
                    : ''} ${selected.has(page.name) ? styles.pageSelected : ''} ${dropping}`, "aria-pressed": selected.has(page.name), onClick: (e) => {
                    if (e.metaKey || e.ctrlKey) {
                        toggleSelected(page.name);
                        // Focused, so Cmd+G lands on the list's handler.
                        e.currentTarget.focus();
                        return;
                    }
                    setSelected(new Set());
                    if (isEditingPage)
                        return;
                    // Clicking the same page that's already
                    // active is a no-op for state but we
                    // still want to keep the early-return so
                    // we don't pointlessly thrash the project
                    // snapshot.
                    const sameTargetClicked = activeComponent === null &&
                        activePageName === page.name;
                    if (sameTargetClicked)
                        return;
                    // Flush any in-flight write on the
                    // outgoing target (component or other
                    // page) BEFORE swapping so the disk has
                    // the user's latest edits. Then persist
                    // those edits into the React snapshot so
                    // re-entering the outgoing target later
                    // shows the work, not the stale
                    // initial-load template.
                    flushPendingPageWrite();
                    persistActiveSource();
                    if (activeComponent !== null) {
                        setActiveComponentState(null);
                    }
                    setActivePageName(page.name);
                }, onContextMenu: (e) => handleRowContextMenu(e, page.name, (ev) => openPageMenu(ev, page.name)), type: "button", "data-page-slug": page.name, ...drag, children: page.name }) }, page.name));
    };
    const groupMenuItems = (name) => [
        {
            label: 'Add page here',
            disabled: isEditingPage,
            onSelect: () => {
                setAddToGroup(name);
                setPageEditError(null);
                setPageEdit('new');
                setGroupCollapsed(name, false);
            },
        },
        { label: 'Rename group…', onSelect: () => setRenamingGroup(name) },
        { label: 'Delete group', onSelect: () => arrange((shown) => removeGroup(shown, name)) },
    ];
    return (_jsxs("div", { className: styles.sidebarSection, children: [_jsx("h2", { className: styles.sidebarTitle, children: "Pages" }), _jsxs("ul", { className: styles.pageList, onKeyDown: (e) => {
                    // Only with pages picked: otherwise Cmd+G stays the canvas's
                    // "group elements", and Escape the canvas's own.
                    if (selected.size === 0)
                        return;
                    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
                        e.preventDefault();
                        e.stopPropagation();
                        groupSelection();
                    }
                    else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setSelected(new Set());
                    }
                }, children: [layout.map((entry) => {
                        if ('page' in entry) {
                            const row = rows.get(entry.page);
                            return row === undefined ? null : renderRow(row);
                        }
                        const name = entry.group;
                        const ref = { kind: 'group', name };
                        const isCollapsed = collapsed.has(name);
                        const holdsActivePage = entry.pages.some((slug) => {
                            const row = rows.get(slug);
                            if (row === undefined)
                                return false;
                            return row.kind === 'view'
                                ? activeComponent !== null && activeComponent.name === row.view.name
                                : activeComponent === null && activePageName === row.page.name;
                        });
                        return (_jsxs("li", { className: styles.pageGroup, children: [_jsx(PageGroupHeader, { name: name, collapsed: isCollapsed, holdsActivePage: holdsActivePage, renaming: renamingGroup === name, dropClass: dropClass(ref), drag: dragFor(ref), onToggle: () => setGroupCollapsed(name, !isCollapsed), onContextMenu: (e) => {
                                        e.preventDefault();
                                        setGroupMenu({ x: e.clientX, y: e.clientY, name });
                                    }, nameError: (next) => groupNameError(layout, next, name), onRename: (next) => {
                                        setRenamingGroup(null);
                                        if (next === name)
                                            return;
                                        arrange((shown) => renameGroup(shown, name, next));
                                        if (isCollapsed)
                                            setGroupCollapsed(name, true, next);
                                    }, onCancelRename: () => setRenamingGroup(null) }), !isCollapsed && (_jsxs("ul", { className: styles.groupPages, children: [entry.pages.map((slug) => {
                                            const row = rows.get(slug);
                                            return row === undefined ? null : renderRow(row);
                                        }), entry.pages.length === 0 && !(pageEdit === 'new' && addToGroup === name) && (_jsx("li", { className: styles.groupEmpty, children: "Drag pages here" })), pageEdit === 'new' && addToGroup === name && newPageInput] }))] }, `group:${name}`));
                    }), pageEdit === 'new' && addToGroup === null && newPageInput] }), selectionMenu !== null && (_jsx(PageContextMenu, { x: selectionMenu.x, y: selectionMenu.y, items: [{ label: `Group ${selected.size} pages`, onSelect: groupSelection }], onClose: () => setSelectionMenu(null) })), groupMenu !== null && (_jsx(PageContextMenu, { x: groupMenu.x, y: groupMenu.y, items: groupMenuItems(groupMenu.name), onClose: () => setGroupMenu(null) })), pageEdit !== 'new' && (_jsx("button", { className: styles.addPageButton, onClick: () => {
                    if (isEditingPage)
                        return;
                    setPageEditError(null);
                    setPageEdit('new');
                }, type: "button", children: "+ Add Page" })), pageEdit !== 'new' && (_jsx("button", { className: styles.addPageButton, onClick: handleNewGroup, type: "button", disabled: isEditingPage, children: "+ New group" })), pageEdit !== 'new' && onImportWebsite && (_jsx("button", { className: styles.addPageButton, onClick: onImportWebsite, type: "button", title: "Open a browser, navigate to a page, and import it as a view", children: "\u21A7 Import a page\u2026" })), pageEdit !== 'new' && onImportReact && (_jsx("button", { className: styles.addPageButton, onClick: onImportReact, type: "button", title: "Run a React app from its project folder and import its pages as views", children: "\u21A7 Import a React app\u2026" }))] }));
};

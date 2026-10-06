import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { viewSlugFor } from '@shared/templates';
import { flushPendingPageWrite } from '../../syncBridge';
import { PageNameInput } from '../PageNameInput';
import styles from '../ProjectShell.module.css';
/** Home first, then by slug. A view and a page never share a slug. */
const rowsFor = (pages, views) => {
    const rows = [
        ...pages.map((page) => ({ slug: page.name, kind: 'page', page })),
        ...views.map((view) => ({ slug: viewSlugFor(view.name), kind: 'view', view })),
    ];
    return rows.sort((a, b) => {
        if (a.slug === 'home')
            return -1;
        if (b.slug === 'home')
            return 1;
        return a.slug.localeCompare(b.slug);
    });
};
export const PageSidebar = ({ pages, views, existingPageNames, pageEdit, pageEditError, pageEditBusy, isEditingPage, activePageName, activeComponent, setPageEdit, setPageEditError, resetPageEdit, handleAddPage, handleDuplicatePage, handleRenamePage, openPageMenu, openView, openViewMenu, handleRenameView, persistActiveSource, onImportWebsite, onImportReact, setActiveComponentState, setActivePageName, }) => {
    return (_jsxs("div", { className: styles.sidebarSection, children: [_jsx("h2", { className: styles.sidebarTitle, children: "Pages" }), _jsxs("ul", { className: styles.pageList, children: [rowsFor(pages, views).map((row) => {
                        if (row.kind === 'view') {
                            const view = row.view;
                            const isRenaming = pageEdit !== null &&
                                pageEdit !== 'new' &&
                                'rename' in pageEdit &&
                                pageEdit.rename === row.slug;
                            if (isRenaming) {
                                return (_jsx("li", { children: _jsx(PageNameInput, { initialValue: row.slug, existingNames: existingPageNames.filter((n) => n !== row.slug), onConfirm: (name) => void handleRenameView(view.name, name), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }, `view:${view.name}`));
                            }
                            const isActive = activeComponent !== null && activeComponent.name === view.name;
                            return (_jsx("li", { children: _jsx("button", { className: `${styles.pageButton} ${isActive ? styles.pageActive : ''}`, onClick: () => {
                                        if (isEditingPage || isActive)
                                            return;
                                        openView(view.name);
                                    }, onContextMenu: (e) => openViewMenu(e, view.name), type: "button", children: row.slug }) }, `view:${view.name}`));
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
                            return (_jsx("li", { children: _jsx(PageNameInput, { initialValue: seed, existingNames: existingPageNames, selectRange: [page.name.length, seed.length], onConfirm: (name) => void handleDuplicatePage(page.name, name), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }, page.name));
                        }
                        if (isRenaming) {
                            // Exclude the current name from collision checks so
                            // "rename home → home" surfaces as an explicit no-op
                            // from the IPC rather than as a spurious collision.
                            const otherNames = existingPageNames.filter((n) => n !== page.name);
                            return (_jsx("li", { children: _jsx(PageNameInput, { initialValue: page.name, existingNames: otherNames, onConfirm: (name) => void handleRenamePage(page.name, name), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }, page.name));
                        }
                        return (_jsx("li", { children: _jsx("button", { className: `${styles.pageButton} ${activeComponent === null &&
                                    activePageName === page.name
                                    ? styles.pageActive
                                    : ''}`, onClick: () => {
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
                                }, onContextMenu: (e) => openPageMenu(e, page.name), type: "button", children: page.name }) }, page.name));
                    }), pageEdit === 'new' && (_jsx("li", { children: _jsx(PageNameInput, { existingNames: existingPageNames, onConfirm: (name) => void handleAddPage(name), onCancel: resetPageEdit, error: pageEditError, busy: pageEditBusy }) }))] }), pageEdit !== 'new' && (_jsx("button", { className: styles.addPageButton, onClick: () => {
                    if (isEditingPage)
                        return;
                    setPageEditError(null);
                    setPageEdit('new');
                }, type: "button", children: "+ Add Page" })), pageEdit !== 'new' && onImportWebsite && (_jsx("button", { className: styles.addPageButton, onClick: onImportWebsite, type: "button", title: "Open a browser, navigate to a page, and import it as a view", children: "\u21A7 Import a page\u2026" })), pageEdit !== 'new' && onImportReact && (_jsx("button", { className: styles.addPageButton, onClick: onImportReact, type: "button", title: "Run a React app from its project folder and import its pages as views", children: "\u21A7 Import a React app\u2026" }))] }));
};

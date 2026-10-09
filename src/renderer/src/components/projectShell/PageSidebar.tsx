import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';

import type { ComponentFile, PageFile } from '@shared/types';
import { viewSlugFor } from '@shared/templates';

import { flushPendingPageWrite } from '../../syncBridge';
import { PageNameInput } from '../PageNameInput';
import type { ActiveComponent, PageEdit } from './types';
import styles from '../ProjectShell.module.css';

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

/** The Pages section of the left sidebar: page list + inline add/rename. */
type Row =
  | { slug: string; kind: 'page'; page: PageFile }
  | { slug: string; kind: 'view'; view: ComponentFile };

/** Home first, then by slug. A view and a page never share a slug. */
const rowsFor = (pages: PageFile[], views: ComponentFile[]): Row[] => {
  const rows: Row[] = [
    ...pages.map((page): Row => ({ slug: page.name, kind: 'page', page })),
    ...views.map((view): Row => ({ slug: viewSlugFor(view.name), kind: 'view', view })),
  ];
  return rows.sort((a, b) => {
    if (a.slug === 'home') return -1;
    if (b.slug === 'home') return 1;
    return a.slug.localeCompare(b.slug);
  });
};

export const PageSidebar = ({
  pages,
  views,
  existingPageNames,
  pageEdit,
  pageEditError,
  pageEditBusy,
  isEditingPage,
  activePageName,
  activeComponent,
  setPageEdit,
  setPageEditError,
  resetPageEdit,
  handleAddPage,
  handleDuplicatePage,
  handleRenamePage,
  openPageMenu,
  openView,
  openViewMenu,
  handleRenameView,
  persistActiveSource,
  onImportWebsite,
  onImportReact,
  setActiveComponentState,
  setActivePageName,
}: Props): JSX.Element => {
  return (
    <div className={styles.sidebarSection}>
      <h2 className={styles.sidebarTitle}>Pages</h2>
      <ul className={styles.pageList}>
        {rowsFor(pages, views).map((row) => {
          if (row.kind === 'view') {
            const view = row.view;
            const isRenaming =
              pageEdit !== null &&
              pageEdit !== 'new' &&
              'rename' in pageEdit &&
              pageEdit.rename === row.slug;
            if (isRenaming) {
              return (
                <li key={`view:${view.name}`}>
                  <PageNameInput
                    initialValue={row.slug}
                    existingNames={existingPageNames.filter((n) => n !== row.slug)}
                    onConfirm={(name) => void handleRenameView(view.name, name)}
                    onCancel={resetPageEdit}
                    error={pageEditError}
                    busy={pageEditBusy}
                  />
                </li>
              );
            }
            const isActive =
              activeComponent !== null && activeComponent.name === view.name;
            return (
              <li key={`view:${view.name}`}>
                <button
                  className={`${styles.pageButton} ${isActive ? styles.pageActive : ''}`}
                  onClick={() => {
                    if (isEditingPage || isActive) return;
                    openView(view.name);
                  }}
                  onContextMenu={(e) => openViewMenu(e, view.name)}
                  type="button"
                >
                  {row.slug}
                </button>
              </li>
            );
          }
          const page = row.page;
          const isDuplicating =
            pageEdit !== null &&
            pageEdit !== 'new' &&
            'duplicate' in pageEdit &&
            pageEdit.duplicate === page.name;
          const isRenaming =
            pageEdit !== null &&
            pageEdit !== 'new' &&
            'rename' in pageEdit &&
            pageEdit.rename === page.name;
          if (isDuplicating) {
            // Seed with `[name]-copy` and select just the "-copy"
            // portion so the user can retype it instantly.
            const seed = `${page.name}-copy`;
            return (
              <li key={page.name}>
                <PageNameInput
                  initialValue={seed}
                  existingNames={existingPageNames}
                  selectRange={[page.name.length, seed.length]}
                  onConfirm={(name) => void handleDuplicatePage(page.name, name)}
                  onCancel={resetPageEdit}
                  error={pageEditError}
                  busy={pageEditBusy}
                />
              </li>
            );
          }
          if (isRenaming) {
            // Exclude the current name from collision checks so
            // "rename home → home" surfaces as an explicit no-op
            // from the IPC rather than as a spurious collision.
            const otherNames = existingPageNames.filter(
              (n) => n !== page.name
            );
            return (
              <li key={page.name}>
                <PageNameInput
                  initialValue={page.name}
                  existingNames={otherNames}
                  onConfirm={(name) => void handleRenamePage(page.name, name)}
                  onCancel={resetPageEdit}
                  error={pageEditError}
                  busy={pageEditBusy}
                />
              </li>
            );
          }
          return (
            <li key={page.name}>
              <button
                className={`${styles.pageButton} ${
                  activeComponent === null &&
                  activePageName === page.name
                    ? styles.pageActive
                    : ''
                }`}
                onClick={() => {
                  if (isEditingPage) return;
                  // Clicking the same page that's already
                  // active is a no-op for state but we
                  // still want to keep the early-return so
                  // we don't pointlessly thrash the project
                  // snapshot.
                  const sameTargetClicked =
                    activeComponent === null &&
                    activePageName === page.name;
                  if (sameTargetClicked) return;
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
                }}
                onContextMenu={(e) => openPageMenu(e, page.name)}
                type="button"
              >
                {page.name}
              </button>
            </li>
          );
        })}
        {pageEdit === 'new' && (
          <li>
            <PageNameInput
              existingNames={existingPageNames}
              onConfirm={(name) => void handleAddPage(name)}
              onCancel={resetPageEdit}
              error={pageEditError}
              busy={pageEditBusy}
            />
          </li>
        )}
      </ul>
      {pageEdit !== 'new' && (
        <button
          className={styles.addPageButton}
          onClick={() => {
            if (isEditingPage) return;
            setPageEditError(null);
            setPageEdit('new');
          }}
          type="button"
        >
          + Add Page
        </button>
      )}
      {pageEdit !== 'new' && onImportWebsite && (
        <button
          className={styles.addPageButton}
          onClick={onImportWebsite}
          type="button"
          title="Open a browser, navigate to a page, and import it as a view"
        >
          ↧ Import a page…
        </button>
      )}
      {pageEdit !== 'new' && onImportReact && (
        <button
          className={styles.addPageButton}
          onClick={onImportReact}
          type="button"
          title="Run a React app from its project folder and import its pages as views"
        >
          ↧ Import a React app…
        </button>
      )}
    </div>
  );
};

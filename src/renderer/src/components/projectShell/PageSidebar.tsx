import {
  useState,
  type Dispatch,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';
import { IconDownload, IconPlus } from '@tabler/icons-react';

import type { ComponentFile, PageFile, PageLayoutEntry } from '@shared/types';
import { viewNameForPage, viewSlugFor } from '@shared/templates';
import {
  groupNameError,
  groupPages,
  insertPageAfter,
  movePageToGroup,
  moveRow,
  nextGroupName,
  pagesBetween,
  reconcileLayout,
  removeGroup,
  renameGroup,
  renamePage,
  type DropPosition,
  type RowRef,
} from '@lib/pageLayout';

import { flushPendingPageWrite } from '../../syncBridge';
import { Tooltip } from '../controls/Tooltip';
import { PageContextMenu, type PageMenuItem } from '../PageContextMenu';
import { PageNameInput } from '../PageNameInput';
import { PageGroupHeader } from './PageGroupHeader';
import type { ActiveComponent, PageEdit } from './types';
import type { PageLayoutUpdate } from './useProjectConfig';
import styles from '../ProjectShell.module.css';

type Props = {
  projectPath: string;
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
  handleAddPage: (name: string) => Promise<boolean>;
  handleDuplicatePage: (sourcePageName: string, newName: string) => Promise<boolean>;
  handleRenamePage: (oldName: string, newName: string) => Promise<boolean>;
  openPageMenu: (e: ReactMouseEvent, pageName: string) => void;
  openView: (viewName: string) => void;
  openViewMenu: (e: ReactMouseEvent, viewName: string) => void;
  handleRenameView: (viewName: string, newSlug: string) => Promise<boolean>;
  /** The stored groups and order; undefined until the user first arranges the list. */
  pageLayout: PageLayoutEntry[] | undefined;
  onPageLayoutChange: (update: PageLayoutUpdate) => void;
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

/** Every page and view by slug. A view and a page never share a slug. */
const rowsBySlug = (pages: PageFile[], views: ComponentFile[]): Map<string, Row> =>
  new Map<string, Row>([
    ...pages.map((page): [string, Row] => [page.name, { slug: page.name, kind: 'page', page }]),
    ...views.map((view): [string, Row] => {
      const slug = viewSlugFor(view.name);
      return [slug, { slug, kind: 'view', view }];
    }),
  ]);

const PAGE_MIME = 'application/x-scamp-page';
const GROUP_MIME = 'application/x-scamp-page-group';

/** Collapsed groups are one person's view of the list, so they stay on this machine. */
const collapsedKey = (projectPath: string): string => `scamp:page-groups-collapsed:${projectPath}`;

const readCollapsed = (projectPath: string): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(collapsedKey(projectPath)) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []);
  } catch {
    return new Set();
  }
};

const writeCollapsed = (projectPath: string, names: Set<string>): void => {
  try {
    globalThis.localStorage?.setItem(collapsedKey(projectPath), JSON.stringify([...names]));
  } catch {
    // Only a preference: losing it shows the groups expanded.
  }
};

/** Where over a row the pointer is: a page-on-group drop has a middle "inside" band. */
const dropPositionFor = (e: DragEvent<HTMLElement>, intoGroup: boolean): DropPosition => {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = rect.height === 0 ? 0.5 : (e.clientY - rect.top) / rect.height;
  if (intoGroup) return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
  return y < 0.5 ? 'before' : 'after';
};

export const PageSidebar = ({
  projectPath,
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
  pageLayout,
  onPageLayoutChange,
}: Props): JSX.Element => {
  const rows = rowsBySlug(pages, views);
  const layout = reconcileLayout([...rows.keys()], pageLayout);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(projectPath));
  const [dragOver, setDragOver] = useState<{ key: string; position: DropPosition } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  /** The group "Add page here" was chosen from, while its name field is open. */
  const [addToGroup, setAddToGroup] = useState<string | null>(null);
  /** Pages picked with Cmd/Ctrl+click, to group together. */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [importMenu, setImportMenu] = useState<{ x: number; y: number } | null>(null);
  /** Where a Shift+click range starts: the last page clicked or Cmd+clicked. */
  const [anchor, setAnchor] = useState<string | null>(null);

  const activeSlug = (() => {
    for (const row of rows.values()) {
      if (row.kind === 'view' ? activeComponent?.name === row.view.name : activeComponent === null && activePageName === row.page.name) {
        return row.slug;
      }
    }
    return null;
  })();

  /** Pages in the order the list shows them; a collapsed group's are hidden. */
  const visibleOrder = layout.flatMap((e) => ('page' in e ? [e.page] : collapsed.has(e.group) ? [] : e.pages));

  /**
   * Picking with a modifier. Shift+click picks the run from the anchor (or
   * the open page) to here; Cmd/Ctrl+click adds or removes one page. Returns
   * false for a plain click, which opens the page as before.
   */
  const handlePick = (e: ReactMouseEvent<HTMLButtonElement>, slug: string): boolean => {
    if (e.shiftKey) {
      setSelected(new Set(pagesBetween(visibleOrder, anchor ?? activeSlug ?? slug, slug)));
    } else if (e.metaKey || e.ctrlKey) {
      toggleSelected(slug);
      setAnchor(slug);
    } else {
      setSelected(new Set());
      setAnchor(slug);
      return false;
    }
    // Focused, so Cmd+G lands on the list's handler.
    e.currentTarget.focus();
    return true;
  };

  /** Cmd/Ctrl+click: add or remove a page. The first one also picks up the open page. */
  const toggleSelected = (slug: string): void => {
    setSelected((prev) => {
      const next = new Set(prev.size === 0 && activeSlug !== null ? [activeSlug] : prev);
      if (next.has(slug) && prev.size > 0) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const groupSelection = (): void => {
    const slugs = [...selected].filter((slug) => rows.has(slug));
    setSelected(new Set());
    if (slugs.length === 0) return;
    const name = nextGroupName(layout);
    arrange((shown) => groupPages(shown, slugs, name));
    setRenamingGroup(name);
  };

  /** Right-click inside a multi-page selection acts on the selection. */
  const handleRowContextMenu = (e: ReactMouseEvent, slug: string, open: (e: ReactMouseEvent) => void): void => {
    if (selected.has(slug) && selected.size > 1) {
      e.preventDefault();
      setSelectionMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    setSelected(new Set());
    open(e);
  };

  /** Apply an arrangement to the whole list as shown, so it's stored complete. */
  const arrange = (change: (shown: PageLayoutEntry[]) => PageLayoutEntry[]): void => {
    onPageLayoutChange(() => change(layout));
  };
  /** Keep a stored layout in step with a page operation; nothing to do if there isn't one. */
  const follow = (change: (stored: PageLayoutEntry[]) => PageLayoutEntry[]): void => {
    onPageLayoutChange((stored) => (stored === undefined ? undefined : change(stored)));
  };

  const setGroupCollapsed = (name: string, value: boolean, rename?: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(name);
      if (value) next.add(rename ?? name);
      writeCollapsed(projectPath, next);
      return next;
    });
  };

  const keyOf = (ref: RowRef): string => (ref.kind === 'page' ? `page:${ref.slug}` : `group:${ref.name}`);
  const dropClass = (ref: RowRef): string => {
    if (dragOver === null || dragOver.key !== keyOf(ref)) return '';
    if (dragOver.position === 'inside') return styles.dropInside ?? '';
    return (dragOver.position === 'before' ? styles.dropBefore : styles.dropAfter) ?? '';
  };

  /** Drag handlers for one row: pages and group headers both move and accept drops. */
  const dragFor = (ref: RowRef) => {
    const accepts = (e: DragEvent<HTMLElement>): 'page' | 'group' | null =>
      e.dataTransfer.types.includes(PAGE_MIME) ? 'page' : e.dataTransfer.types.includes(GROUP_MIME) ? 'group' : null;
    return {
      draggable: !isEditingPage,
      onDragStart: (e: DragEvent<HTMLElement>): void => {
        e.dataTransfer.setData(ref.kind === 'page' ? PAGE_MIME : GROUP_MIME, ref.kind === 'page' ? ref.slug : ref.name);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (e: DragEvent<HTMLElement>): void => {
        const kind = accepts(e);
        if (kind === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const position = dropPositionFor(e, ref.kind === 'group' && kind === 'page');
        if (dragOver?.key !== keyOf(ref) || dragOver.position !== position) setDragOver({ key: keyOf(ref), position });
      },
      onDragLeave: (): void => {
        setDragOver((prev) => (prev?.key === keyOf(ref) ? null : prev));
      },
      onDrop: (e: DragEvent<HTMLElement>): void => {
        const kind = accepts(e);
        setDragOver(null);
        if (kind === null) return;
        e.preventDefault();
        const id = e.dataTransfer.getData(kind === 'page' ? PAGE_MIME : GROUP_MIME);
        const moving: RowRef = kind === 'page' ? { kind: 'page', slug: id } : { kind: 'group', name: id };
        const position = dropPositionFor(e, ref.kind === 'group' && kind === 'page');
        arrange((shown) => moveRow(shown, moving, ref, position));
      },
      onDragEnd: (): void => setDragOver(null),
    };
  };

  const renderRow = (row: Row): JSX.Element => {
    const ref: RowRef = { kind: 'page', slug: row.slug };
    const drag = dragFor(ref);
    const dropping = dropClass(ref);
    return renderPageRow(row, drag, dropping);
  };

  const newPageInput = (
    <li>
      <PageNameInput
        existingNames={existingPageNames}
        onConfirm={(name) =>
          void handleAddPage(name).then((ok) => {
            const group = addToGroup;
            setAddToGroup(null);
            if (ok && group !== null) arrange((shown) => movePageToGroup(reconcileLayout([...rows.keys(), name], shown), name, group));
          })
        }
        onCancel={() => {
          setAddToGroup(null);
          resetPageEdit();
        }}
        error={pageEditError}
        busy={pageEditBusy}
      />
    </li>
  );

  const renderPageRow = (
    row: Row,
    drag: ReturnType<typeof dragFor>,
    dropping: string
  ): JSX.Element => {
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
              onConfirm={(name) =>
                void handleRenameView(view.name, name).then((ok) => {
                  if (ok) follow((stored) => renamePage(stored, row.slug, viewSlugFor(viewNameForPage(name))));
                })
              }
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
            className={`${styles.pageButton} ${isActive ? styles.pageActive : ''} ${
              selected.has(row.slug) ? styles.pageSelected : ''
            } ${dropping}`}
            aria-pressed={selected.has(row.slug)}
            onClick={(e) => {
              if (handlePick(e, row.slug)) return;
              if (isEditingPage || isActive) return;
              openView(view.name);
            }}
            onContextMenu={(e) => handleRowContextMenu(e, row.slug, (ev) => openViewMenu(ev, view.name))}
            type="button"
            data-page-slug={row.slug}
            {...drag}
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
            onConfirm={(name) =>
              void handleDuplicatePage(page.name, name).then((ok) => {
                if (ok) follow((stored) => insertPageAfter(stored, name, page.name));
              })
            }
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
            onConfirm={(name) =>
              void handleRenamePage(page.name, name).then((ok) => {
                if (ok) follow((stored) => renamePage(stored, page.name, name));
              })
            }
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
          } ${selected.has(page.name) ? styles.pageSelected : ''} ${dropping}`}
          aria-pressed={selected.has(page.name)}
          onClick={(e) => {
            if (handlePick(e, page.name)) return;
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
          onContextMenu={(e) => handleRowContextMenu(e, page.name, (ev) => openPageMenu(ev, page.name))}
          type="button"
          data-page-slug={page.name}
          {...drag}
        >
          {page.name}
        </button>
      </li>
    );
  };

  const importItems: PageMenuItem[] = [
    ...(onImportWebsite ? [{ label: 'Import from website…', onSelect: onImportWebsite }] : []),
    ...(onImportReact ? [{ label: 'Import from React app…', onSelect: onImportReact }] : []),
  ];

  const groupMenuItems = (name: string): PageMenuItem[] => [
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

  return (
    <div className={styles.sidebarSection}>
      <div className={styles.sidebarHeader}>
        <h2 className={styles.sidebarTitle}>Pages</h2>
        <div className={styles.headerActions}>
          <Tooltip label="Add page">
            <button
              type="button"
              className={styles.headerIconButton}
              aria-label="Add page"
              disabled={isEditingPage || pageEdit === 'new'}
              onClick={() => {
                setAddToGroup(null);
                setPageEditError(null);
                setPageEdit('new');
              }}
            >
              <IconPlus size={14} />
            </button>
          </Tooltip>
          {importItems.length > 0 && (
            <Tooltip label="Import">
              <button
                type="button"
                className={styles.headerIconButton}
                aria-label="Import"
                aria-haspopup="menu"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setImportMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <IconDownload size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <ul
        data-testid="pages-list"
        className={styles.pageList}
        onKeyDown={(e) => {
          // Only with pages picked: otherwise Cmd+G stays the canvas's
          // "group elements", and Escape the canvas's own.
          if (selected.size === 0) return;
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            e.stopPropagation();
            groupSelection();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setSelected(new Set());
          }
        }}
      >
        {layout.map((entry) => {
          if ('page' in entry) {
            const row = rows.get(entry.page);
            return row === undefined ? null : renderRow(row);
          }
          const name = entry.group;
          const ref: RowRef = { kind: 'group', name };
          const isCollapsed = collapsed.has(name);
          const holdsActivePage = entry.pages.some((slug) => {
            const row = rows.get(slug);
            if (row === undefined) return false;
            return row.kind === 'view'
              ? activeComponent !== null && activeComponent.name === row.view.name
              : activeComponent === null && activePageName === row.page.name;
          });
          return (
            <li key={`group:${name}`} className={styles.pageGroup}>
              <PageGroupHeader
                name={name}
                collapsed={isCollapsed}
                holdsActivePage={holdsActivePage}
                renaming={renamingGroup === name}
                dropClass={dropClass(ref)}
                drag={dragFor(ref)}
                onToggle={() => setGroupCollapsed(name, !isCollapsed)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setGroupMenu({ x: e.clientX, y: e.clientY, name });
                }}
                nameError={(next) => groupNameError(layout, next, name)}
                onRename={(next) => {
                  setRenamingGroup(null);
                  if (next === name) return;
                  arrange((shown) => renameGroup(shown, name, next));
                  if (isCollapsed) setGroupCollapsed(name, true, next);
                }}
                onCancelRename={() => setRenamingGroup(null)}
              />
              {!isCollapsed && (
                <ul className={styles.groupPages}>
                  {entry.pages.map((slug) => {
                    const row = rows.get(slug);
                    return row === undefined ? null : renderRow(row);
                  })}
                  {entry.pages.length === 0 && !(pageEdit === 'new' && addToGroup === name) && (
                    <li className={styles.groupEmpty}>Drag pages here</li>
                  )}
                  {pageEdit === 'new' && addToGroup === name && newPageInput}
                </ul>
              )}
            </li>
          );
        })}
        {pageEdit === 'new' && addToGroup === null && newPageInput}
      </ul>
      {selectionMenu !== null && (
        <PageContextMenu
          x={selectionMenu.x}
          y={selectionMenu.y}
          items={[{ label: `Group ${selected.size} pages`, onSelect: groupSelection }]}
          onClose={() => setSelectionMenu(null)}
        />
      )}
      {groupMenu !== null && (
        <PageContextMenu
          x={groupMenu.x}
          y={groupMenu.y}
          items={groupMenuItems(groupMenu.name)}
          onClose={() => setGroupMenu(null)}
        />
      )}
      {importMenu !== null && (
        <PageContextMenu x={importMenu.x} y={importMenu.y} items={importItems} onClose={() => setImportMenu(null)} />
      )}
    </div>
  );
};

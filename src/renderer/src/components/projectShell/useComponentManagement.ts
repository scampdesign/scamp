import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useState,
} from 'react';

import type { ComponentFile, ComponentKind, PageFile, ProjectData } from '@shared/types';
import { componentKindOf } from '@shared/types';
import { viewNameForPage, viewSlugFor } from '@shared/templates';
import { errorMessage } from '@shared/errorMessage';
import { useCanvasStore } from '@store/canvasSlice';
import { useAppLogStore } from '@store/appLogSlice';
import type { ScampElement } from '@lib/element';
import { parseCode } from '@lib/parseCode';
import { generateCode } from '@lib/generateCode';
import {
  findInstanceUsagesAcrossPages,
  groupUsagesByPage,
} from '@lib/componentUsage';
import {
  rewriteComponentForRename,
  rewritePageForComponentRename,
} from '@lib/componentRename';

import {
  armTargetSwapSuppression,
  disarmTargetSwapSuppression,
  flushPendingPageWrite,
} from '../../syncBridge';
import type {
  ActiveComponent,
  ComponentEdit,
  ComponentMenuState,
  DeletingComponent,
} from './types';

type ProjectChange = (
  next: ProjectData | ((prev: ProjectData) => ProjectData)
) => void;

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
  openComponent: (
    name: string,
    fromPage: string | null,
    kind?: ComponentKind
  ) => void;
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
  /** "+ Add Page": a view named from the slug, plus its route wrapper. Throws on failure. */
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
export const useComponentManagement = ({
  project,
  onProjectChange,
  activeComponent,
  setActiveComponentState,
  activePageName,
  setActivePageName,
  ensureRouteFor,
  renameRouteFor,
  openComponent,
  persistActiveSource,
}: Args): UseComponentManagement => {
  // Brief in-progress flag while `+ component` is creating a new
  // component on disk. Disables the add-button + name input.
  const [creatingComponent, setCreatingComponent] = useState(false);
  // Inline-edit state for the components list.
  //   `'new'` — PascalCase name input at the bottom (Create).
  //   `{ rename: name }` — replaces that component's button with
  //     a name input pre-filled with `name`.
  //   `null` — no editing in progress.
  const [componentEdit, setComponentEdit] = useState<ComponentEdit>(null);
  const [componentEditError, setComponentEditError] = useState<string | null>(
    null
  );
  const [renamingComponent, setRenamingComponent] = useState(false);
  // Phase 7: component-sidebar context menu (right-click) +
  // delete-component flow. Holds the menu coords + target name
  // while open; cleared on dismiss.
  const [componentMenu, setComponentMenu] =
    useState<ComponentMenuState | null>(null);
  const [deletingComponent, setDeletingComponent] =
    useState<DeletingComponent | null>(null);
  const [componentDeleteBusy, setComponentDeleteBusy] = useState(false);
  const [convertingPage, setConvertingPage] = useState<string | null>(null);
  const [convertPageBusy, setConvertPageBusy] = useState(false);
  const [convertPageError, setConvertPageError] = useState<string | null>(null);

  /**
   * Atomic add: create the component on disk, append to the
   * project list, and immediately enter its editor. PascalCase
   * validation happens main-side too; this rejects locally first
   * so users see invalid-name errors without an IPC round trip.
   */
  /**
   * A view previews through a wrapper page at its slug. When a real
   * page already owns that slug, the view is created without one and
   * the log says how to get a preview (convert the page instead).
   */
  const wrapperSlugFor = (viewName: string): string | null => {
    // Only a Next.js project needs a wrapper page; in a scamp-format
    // project the route that renders a view lives in routes/, which is
    // the user's.
    if (project.format !== 'nextjs') return null;
    const slug = viewSlugFor(viewName);
    const taken = project.pages.some((p) => p.name === slug);
    if (taken) {
      useAppLogStore
        .getState()
        .log(
          'warn',
          `View "${viewName}" has no preview route: the page "${slug}" already owns /${slug === 'home' ? '' : slug}. Convert that page to a view, or rename one of them.`
        );
      return null;
    }
    return slug;
  };

  const kindOfNamed = (componentName: string): ComponentKind => {
    const file = project.components.find((c) => c.name === componentName);
    return file ? componentKindOf(file) : 'component';
  };

  const handleAddComponent = async (
    name: string,
    kind: ComponentKind
  ): Promise<void> => {
    setCreatingComponent(true);
    setComponentEditError(null);
    try {
      const created = await window.scamp.createComponent({
        projectPath: project.path,
        componentName: name,
        kind,
        wrapperSlug: kind === 'view' ? wrapperSlugFor(name) : null,
      });
      // Functional updater so this composes with `openComponent`'s
      // follow-on `persistActiveSource` if the outgoing page has
      // unsaved edits — otherwise the second setProject would
      // clobber the new component out of `project.components`.
      onProjectChange?.((prev) => ({
        ...prev,
        components: [...prev.components, created],
      }));
      setComponentEdit(null);
      openComponent(created.name, null, kind);
    } catch (e) {
      setComponentEditError(errorMessage(e));
    } finally {
      setCreatingComponent(false);
    }
  };

  const openComponentMenu = (
    e: ReactMouseEvent,
    componentName: string
  ): void => {
    e.preventDefault();
    e.stopPropagation();
    setComponentMenu({
      x: e.clientX,
      y: e.clientY,
      componentName,
      kind: kindOfNamed(componentName),
    });
  };

  const requestDeleteComponent = (componentName: string): void => {
    const kind = kindOfNamed(componentName);
    // Views are never instanced, so there is nothing on any page to remove.
    const usages =
      kind === 'view'
        ? []
        : findInstanceUsagesAcrossPages(project.pages, componentName);
    setDeletingComponent({
      componentName,
      kind,
      impactByPage: groupUsagesByPage(usages),
    });
  };

  /**
   * Write a page rewritten from `page`, only if the file still holds
   * `page`'s content. Something else changing it in between stops the
   * operation rather than overwrite that change.
   */
  const writeIfUnchanged = async (page: PageFile, tsx: string, css: string): Promise<void> => {
    const result = await window.scamp.writeFile({
      tsxPath: page.tsxPath,
      cssPath: page.cssPath,
      tsxContent: tsx,
      cssContent: css,
      expectedTsxContent: page.tsxContent,
      expectedCssContent: page.cssContent,
    });
    if (!result.ok) {
      throw new Error(`${page.name} changed on disk while it was being updated; it was left as it is.`);
    }
  };

  const handleConfirmDeleteComponent = async (): Promise<void> => {
    if (!deletingComponent) return;
    const { componentName } = deletingComponent;
    setComponentDeleteBusy(true);
    armTargetSwapSuppression();
    try {
      // Rewrite pages from disk, not from `project`: that copy is from when
      // each page was last loaded, and rewriting it dropped edits made since.
      flushPendingPageWrite();
      const fresh = await window.scamp.readProject({ folderPath: project.path });
      const breakpoints = useCanvasStore.getState().breakpoints;
      const updatedPages: PageFile[] = [];
      for (const page of fresh.pages) {
        const parsed = parseCode(page.tsxContent, page.cssContent, {
          breakpoints,
        });
        const toRemove = new Set<string>();
        for (const el of Object.values(parsed.elements)) {
          if (el.type === 'component-instance' && el.componentName === componentName) {
            toRemove.add(el.id);
          }
        }
        if (toRemove.size === 0) {
          updatedPages.push(page);
          continue;
        }
        const nextElements: Record<string, ScampElement> = {};
        for (const [id, el] of Object.entries(parsed.elements)) {
          if (toRemove.has(id)) continue;
          nextElements[id] = {
            ...el,
            childIds: el.childIds.filter((c) => !toRemove.has(c)),
          };
        }
        const rewritten = generateCode({
          elements: nextElements,
          rootId: parsed.rootId,
          pageName: page.name,
          breakpoints,
          customMediaBlocks: parsed.customMediaBlocks,
          pageKeyframesBlocks: parsed.keyframesBlocks,
          cssModuleImportName:
            project.format === 'nextjs' ? 'page' : page.name,
        });
        await writeIfUnchanged(page, rewritten.tsx, rewritten.css);
        updatedPages.push({
          ...page,
          tsxContent: rewritten.tsx,
          cssContent: rewritten.css,
        });
      }
      // Folder removal AFTER page rewrites so imports don't dangle.
      await window.scamp.deleteComponent({
        projectPath: project.path,
        componentName,
        kind: deletingComponent.kind,
      });
      const wasEditingDeleted =
        activeComponent !== null && activeComponent.name === componentName;
      if (wasEditingDeleted) {
        setActiveComponentState(null);
      }
      onProjectChange?.({
        ...project,
        pages: updatedPages,
        components: fresh.components.filter((c) => c.name !== componentName),
      });
      setDeletingComponent(null);
    } catch (err) {
      disarmTargetSwapSuppression();
      const message = errorMessage(err);
      useAppLogStore
        .getState()
        .log('warn', `Delete component "${componentName}" failed: ${message}`);
    } finally {
      setComponentDeleteBusy(false);
    }
  };

  const handleRenameComponent = async (
    oldName: string,
    newName: string
  ): Promise<boolean> => {
    if (oldName === newName) {
      setComponentEdit(null);
      return true;
    }
    setRenamingComponent(true);
    setComponentEditError(null);
    armTargetSwapSuppression();
    try {
      flushPendingPageWrite();
      persistActiveSource();
      // From disk, not `project` — see the delete handler.
      const fresh = await window.scamp.readProject({ folderPath: project.path });
      const breakpoints = useCanvasStore.getState().breakpoints;

      const sourceComponent = fresh.components.find(
        (c) => c.name === oldName
      );
      if (!sourceComponent) {
        throw new Error(`Component "${oldName}" not found in project.`);
      }

      const newContent = rewriteComponentForRename(
        sourceComponent.tsxContent,
        sourceComponent.cssContent,
        oldName,
        newName,
        { breakpoints }
      );

      // Skip pages that don't reference oldName — keeps them byte-stable.
      const rewrittenPages: Array<{
        file: PageFile;
        tsx: string;
        css: string;
      }> = [];
      for (const page of fresh.pages) {
        const result = rewritePageForComponentRename(
          page.tsxContent,
          page.cssContent,
          oldName,
          newName,
          page.name,
          project.format,
          { breakpoints }
        );
        if (result.changed) {
          rewrittenPages.push({
            file: page,
            tsx: result.tsx,
            css: result.css,
          });
        }
      }

      const kind = componentKindOf(sourceComponent);
      const newComponentFile = await window.scamp.createComponent({
        projectPath: project.path,
        componentName: newName,
        kind,
        wrapperSlug: kind === 'view' ? wrapperSlugFor(newName) : null,
        tsxContent: newContent.tsx,
        cssContent: newContent.css,
      });

      for (const entry of rewrittenPages) {
        await writeIfUnchanged(entry.file, entry.tsx, entry.css);
      }

      // Old folder removed last so page imports don't dangle.
      await window.scamp.deleteComponent({
        projectPath: project.path,
        componentName: oldName,
        kind,
      });

      const nextComponents = fresh.components.map((c) =>
        c.name === oldName ? newComponentFile : c
      );
      // Preserve original page order so the sidebar doesn't reshuffle.
      const orderedPages = fresh.pages.map((p) => {
        const rewritten = rewrittenPages.find(
          (e) => e.file.name === p.name
        );
        if (rewritten) {
          return {
            ...p,
            tsxContent: rewritten.tsx,
            cssContent: rewritten.css,
          };
        }
        return p;
      });
      onProjectChange?.({
        ...project,
        components: nextComponents,
        pages: orderedPages,
      });

      if (activeComponent !== null && activeComponent.name === oldName) {
        setActiveComponentState({
          name: newName,
          kind,
          returnToPage: activeComponent.returnToPage,
          ...(activeComponent.returnTo !== undefined ? { returnTo: activeComponent.returnTo } : {}),
        });
      }
      // Keep active page's in-memory componentName fields consistent.
      useCanvasStore.getState().renameComponentReferences(oldName, newName);

      setComponentEdit(null);
      return true;
    } catch (err) {
      disarmTargetSwapSuppression();
      const message = errorMessage(err);
      setComponentEditError(message);
      useAppLogStore
        .getState()
        .log('warn', `Rename component "${oldName}" → "${newName}" failed: ${message}`);
      return false;
    } finally {
      setRenamingComponent(false);
    }
  };

  const handleAddView = async (slug: string): Promise<void> => {
    const viewName = viewNameForPage(slug);
    if (project.components.some((c) => c.name === viewName)) {
      throw new Error(`A component named "${viewName}" already uses this name.`);
    }
    const created = await window.scamp.createComponent({
      projectPath: project.path,
      componentName: viewName,
      kind: 'view',
      wrapperSlug: wrapperSlugFor(viewName),
    });
    flushPendingPageWrite();
    persistActiveSource();
    onProjectChange?.((prev) => ({
      ...prev,
      components: [...prev.components, created],
    }));
    openComponent(created.name, null, 'view');
    // The route is the page's address. Writing it here is what makes
    // "add a page" produce something the user can open; `routes/` is
    // still theirs afterwards, and an existing route is never touched.
    await ensureRouteFor?.(viewName);
  };

  const handleRenameView = async (
    viewName: string,
    newSlug: string
  ): Promise<boolean> => {
    const newName = viewNameForPage(newSlug);
    // A failed rename leaves the route alone: it still names the old view.
    if (!(await handleRenameComponent(viewName, newName))) return false;
    // After the view moved, not before: the route should point at a
    // folder that exists by the time anything reads it.
    await renameRouteFor?.(viewName, newName);
    return true;
  };

  const requestConvertPageToView = (pageName: string): void => {
    setConvertPageError(null);
    setConvertingPage(pageName);
  };

  /**
   * Convert a page into a view: the page's elements become
   * `views/<Name>/` in the component file shape, and the page file
   * becomes the one-line wrapper that previews the view. A snapshot is
   * taken first, so the page is one restore away.
   * see docs/plans/framework-phase-1-plan.md, step 2
   */
  /**
   * Turn one page into a view: generate the view files from the page's
   * latest content (the store for the open page, the file otherwise),
   * create them, and replace the page with a wrapper. Returns the new
   * view. Shared by the page menu's Convert and the framework migration.
   */
  const createViewFromPage = async (current: ProjectData, pageName: string): Promise<ComponentFile> => {
    const viewName = viewNameForPage(pageName);
    if (current.components.some((c) => c.name === viewName)) {
      throw new Error(
        `A component or view named "${viewName}" already exists. Rename it first.`
      );
    }
    flushPendingPageWrite();
    persistActiveSource();
    const page = current.pages.find((p) => p.name === pageName);
    if (!page) throw new Error(`Page "${pageName}" not found in current.`);

    const snapshot = await window.scamp.createSnapshot({
      projectPath: current.path,
      trigger: 'manual',
      label: `Before converting "${pageName}" to a view`,
    });
    if (snapshot.snapshot === null) {
      // Snapshots never block the user (see snapshotOps), but the
      // conversion is meant to be one restore away, so say so.
      useAppLogStore
        .getState()
        .log('warn', `No snapshot was taken before converting "${pageName}"; see the main-process log.`);
    }

    const store = useCanvasStore.getState();
    const breakpoints = store.breakpoints;
    // The open page's latest edits live in the store; any other page
    // is read from its file.
    const source =
      store.activePage?.name === pageName
        ? {
            elements: store.elements,
            rootId: store.rootElementId,
            customMediaBlocks: store.pageCustomMediaBlocks,
            keyframesBlocks: store.pageKeyframesBlocks,
          }
        : (() => {
            const parsed = parseCode(page.tsxContent, page.cssContent, { breakpoints });
            return {
              elements: parsed.elements,
              rootId: parsed.rootId,
              customMediaBlocks: parsed.customMediaBlocks,
              keyframesBlocks: parsed.keyframesBlocks,
            };
          })();
    // A view root is a component root: no page-root `100vh` floor.
    const root = source.elements[source.rootId];
    const elements: Record<string, ScampElement> = root
      ? { ...source.elements, [source.rootId]: { ...root, minHeight: undefined } }
      : source.elements;
    const generated = generateCode({
      elements,
      rootId: source.rootId,
      pageName: viewName,
      cssModuleImportName: viewName,
      breakpoints,
      customMediaBlocks: source.customMediaBlocks,
      pageKeyframesBlocks: source.keyframesBlocks,
      isComponent: true,
    });

    const created = await window.scamp.createComponent({
      projectPath: current.path,
      componentName: viewName,
      kind: 'view',
      wrapperSlug: pageName,
      replacePage: true,
      tsxContent: generated.tsx,
      cssContent: generated.css,
    });
    return created;
  };

  /**
   * Convert every plain page to a view, in order, for the nextjs → scamp
   * migration; the main process then turns the wrappers into routes.
   * Threads the project through so each step sees the last one's result.
   *
   * The canvas moves off the open page first. Converting replaces that
   * page's files with a one-line wrapper and deletes its stylesheet; a
   * canvas still pointed at them reloads from the wrapper, comes back
   * empty, and writes that empty canvas out as a page again — which
   * left the migration refusing to run, because the page it had just
   * converted was still a page. The single-page convert path always
   * swapped the target, and never had the problem.
   */
  const convertAllPagesToViews = async (): Promise<ProjectData> => {
    armTargetSwapSuppression();
    if (activePageName !== null) setActivePageName(null);
    let current = project;
    try {
      for (const page of project.pages) {
        const created = await createViewFromPage(current, page.name);
        current = {
          ...current,
          pages: current.pages.filter((p) => p.name !== page.name),
          components: [...current.components, created],
        };
      }
      onProjectChange?.(current);
      return current;
    } catch (err) {
      disarmTargetSwapSuppression();
      throw err;
    }
  };

  const handleConfirmConvertPage = async (): Promise<void> => {
    if (convertingPage === null) return;
    const pageName = convertingPage;
    const viewName = viewNameForPage(pageName);
    setConvertPageBusy(true);
    setConvertPageError(null);
    armTargetSwapSuppression();
    try {
      const created = await createViewFromPage(project, pageName);
      const nextPages = project.pages.filter((p) => p.name !== pageName);
      onProjectChange?.({
        ...project,
        pages: nextPages,
        components: [...project.components, created],
      });
      if (activePageName === pageName) {
        setActivePageName(nextPages[0]?.name ?? null);
      }
      setConvertingPage(null);
      openComponent(viewName, null, 'view');
    } catch (err) {
      disarmTargetSwapSuppression();
      const message = errorMessage(err);
      setConvertPageError(message);
      useAppLogStore
        .getState()
        .log('warn', `Convert page "${pageName}" to a view failed: ${message}`);
    } finally {
      setConvertPageBusy(false);
    }
  };

  return {
    handleAddView,
    handleRenameView,
    convertingPage,
    setConvertingPage,
    convertPageBusy,
    convertPageError,
    requestConvertPageToView,
    handleConfirmConvertPage,
    convertAllPagesToViews,
    componentEdit,
    setComponentEdit,
    componentEditError,
    setComponentEditError,
    creatingComponent,
    renamingComponent,
    handleAddComponent,
    handleRenameComponent,
    openComponentMenu,
    componentMenu,
    closeComponentMenu: () => setComponentMenu(null),
    requestDeleteComponent,
    deletingComponent,
    setDeletingComponent,
    componentDeleteBusy,
    handleConfirmDeleteComponent,
  };
};

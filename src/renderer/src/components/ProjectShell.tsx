// Top-level shell for an open project: composes the canvas, panels, and
// sidebar, and wires together the projectShell/ hooks that own the real
// logic. Canvas/element state lives in the Zustand store, not here.
//
// The body is now mostly hook calls + a render tree. The logic lives in
// components/projectShell/:
//   useProjectConfig        — scamp.config.json + breakpoint mirror
//   useProjectStoreSync      — project state → canvas store mirrors
//   useFontLinkReconciler /  — font <link> injection + theme.css load
//     useProjectTheme
//   useActiveTarget          — active page/component, load pipeline,
//                              parse-error/migration banners, source
//                              persistence, component enter/exit, nav
//   usePageManagement        — Pages sidebar state + page CRUD
//   useComponentManagement   — Components sidebar state + component CRUD
//   useInstanceFlows         — convert / lock-prop / detach / del-prop-text
//   useCanvasKeyboardShortcuts — global canvas shortcuts + editor Esc
// Render is split into ProjectHeader, PageSidebar, ComponentSidebar,
// CanvasArea, and ProjectModals; only the panel toggles and a thin layout
// frame stay here.
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { ProjectData } from '@shared/types';
import { viewSlugFor } from '@shared/templates';
import { componentKindOf } from '@shared/types';
import { movePageToGroup, moveTargets, reconcileLayout } from '@lib/pageLayout';
import { previewTargetFor } from '@lib/previewTarget';
import { useCanvasStore } from '@store/canvasSlice';
import { useIsSignedIn } from '@store/authSlice';
import { PropertiesPanel } from './PropertiesPanel';
import { CodePanel } from './CodePanel';
import { TerminalPanel } from './TerminalPanel';
import { ElementTree } from './ElementTree';
import { HistoryPanel } from './HistoryPanel';
import { ThemePanel } from './ThemePanel';
import { MigrationBanner } from './MigrationBanner';
import { NextjsMigrationBanner } from './NextjsMigrationBanner';
import { ScampMigrationNotice } from './ScampMigrationNotice';
import { FrameworkContractBanner } from './FrameworkContractBanner';
import { ParseErrorBanner } from './ParseErrorBanner';
import { SaveStatusToast } from './SaveStatusToast';
import { ProjectSettingsPage } from './ProjectSettingsPage';
import { ProjectHeader } from './projectShell/ProjectHeader';
import { CanvasArea } from './projectShell/CanvasArea';
import { PageSidebar } from './projectShell/PageSidebar';
import { ComponentSidebar } from './projectShell/ComponentSidebar';
import { SidebarRail } from './projectShell/SidebarRail';
import { AgentPanel } from './agent/AgentPanel';
import { ThemeSectionNav } from './projectShell/ThemeSectionNav';
import { ProjectModals } from './projectShell/ProjectModals';
import { useCanvasKeyboardShortcuts } from './projectShell/useCanvasKeyboardShortcuts';
import { useProjectConfig } from './projectShell/useProjectConfig';
import { useSvgAssetReload } from './projectShell/useSvgAssetReload';
import { useSnapshotAutoSave } from './projectShell/useSnapshotAutoSave';
import { useProjectStoreSync } from './projectShell/useProjectStoreSync';
import { useRoutes } from './projectShell/useRoutes';
import { useFrameworkUpdate } from './projectShell/useFrameworkUpdate';
import { allUnroutedViews, RoutesSection } from './projectShell/RoutesSection';
import { useAppLogStore } from '@store/appLogSlice';
import { useWebsiteImport } from './projectShell/useWebsiteImport';
import { useHtmlExport } from './projectShell/useHtmlExport';
import {
  useFontLinkReconciler,
  useProjectTheme,
} from './projectShell/useProjectFonts';
import { useDesignMdSync } from './projectShell/useDesignMdSync';
import { useActiveTarget } from './projectShell/useActiveTarget';
import { usePageManagement } from './projectShell/usePageManagement';
import { useComponentManagement } from './projectShell/useComponentManagement';
import { useInstanceFlows } from './projectShell/useInstanceFlows';
import { useLatest } from './projectShell/useLatest';
import { ReactImportDialog } from './projectShell/ReactImportDialog';
import styles from './ProjectShell.module.css';

type Props = {
  project: ProjectData;
  onClose: () => void;
  /**
   * Called after a page or component change. Accepts either a
   * replacement `ProjectData` OR a functional updater that
   * receives the latest committed state. Multi-step handlers
   * (convert-to-component, rename, etc.) MUST use the functional
   * form so sequential calls compose against React's queued
   * state instead of stomping each other via stale closure refs.
   */
  onProjectChange?: (
    next: ProjectData | ((prev: ProjectData) => ProjectData)
  ) => void;
  /**
   * Close this project and open another, then open the import window on
   * a React app there — a React import into a new project.
   */
  onSwitchProject?: (next: ProjectData, thenImport: PendingReactImport) => void;
  /** A React import to open as soon as this project is up. */
  pendingImport?: PendingReactImport | null;
  onPendingImportHandled?: () => void;
};

/** A React app running at `url`, waiting for its import window. */
export type PendingReactImport = { url: string; appName: string; tokens: boolean };

export const ProjectShell = ({
  project,
  onClose,
  onProjectChange,
  onSwitchProject,
  pendingImport,
  onPendingImportHandled,
}: Props): JSX.Element => {
  // Per-project config (scamp.config.json) + its canvas-store breakpoint
  // mirror, owned by the hook. Defaults render immediately so the canvas
  // doesn't flash a wrong background while the first read is in flight.
  const { projectConfig, handleProjectConfigChange, handlePageLayoutChange } = useProjectConfig(
    project.path
  );
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [reactImportOpen, setReactImportOpen] = useState(false);
  // Ref to the artboard scroll container. Passed to `Viewport` so
  // fit-to-width zoom can observe the real scroll area, and used here
  // for the click-to-deselect handler on empty canvas space.
  const artboardScrollRef = useRef<HTMLDivElement>(null);

  // Which page or component is open + the load pipeline, parse-error /
  // migration banner state, source persistence, and component enter/exit.
  const {
    activePageName,
    setActivePageName,
    activeComponent,
    setActiveComponentState,
    parseError,
    clearParseError,
    showMigrationBanner,
    handleDismissMigrationBanner,
    persistActiveSource,
    openComponent,
    exitComponentEditor,
    latestExit,
  } = useActiveTarget({
    project,
    onProjectChange,
    projectConfig,
    handleProjectConfigChange,
  });

  // Mirror read-only project + config state into the canvas store for
  // deeply-nested readers (format, root path, page list, component-tree
  // cache, active-target canvas min-height).
  useProjectStoreSync({ project, projectConfig, activeComponent });
  // A React import into a new project: this is that project, now open, so
  // the import window opens on the app here.
  useEffect(() => {
    if (pendingImport === null || pendingImport === undefined) return;
    onPendingImportHandled?.();
    void window.scamp.openImport({
      projectPath: project.path,
      url: pendingImport.url,
      breakpoints: projectConfig.breakpoints,
      react: { appName: pendingImport.appName, tokens: pendingImport.tokens },
    });
  }, [pendingImport, onPendingImportHandled, project.path, projectConfig.breakpoints]);

  // An undone multi-page import can remove the view that's open.
  const handleImportedViewsRemoved = useCallback(
    (names: ReadonlyArray<string>): void => {
      if (activeComponent !== null && names.includes(activeComponent.name)) setActiveComponentState(null);
    },
    [activeComponent, setActiveComponentState]
  );
  // A captured page arriving from the import window lands here: this is
  // where the project, the reducer and the generator all are.
  // see docs/archive/2026-09-23-website-import-plan.md
  useWebsiteImport({
    project,
    breakpoints: projectConfig.breakpoints,
    onProjectChange,
    openView: (name) => openComponent(name, null, 'view'),
    onViewsRemoved: handleImportedViewsRemoved,
  });

  // Routes in a Scamp-framework project, and the dev server's request
  // log in the app log. see docs/notes/routes-in-the-app.md
  const routesApi = useRoutes(project);
  const frameworkUpdate = useFrameworkUpdate(project, showProjectSettings, onProjectChange);
  useEffect(() => {
    if (project.format !== 'scamp') return;
    return window.scamp.onDevServerLog((payload) => {
      if (payload.projectPath !== project.path) return;
      useAppLogStore.getState().log(payload.level, `preview: ${payload.message}`);
    });
  }, [project.format, project.path]);
  const [devVars, setDevVars] = useState<{ exists: boolean; keys: string[] } | null>(null);
  useEffect(() => {
    if (project.format !== 'scamp' || !showProjectSettings) return;
    let cancelled = false;
    void window.scamp.readDevVars({ projectPath: project.path }).then((result) => {
      if (!cancelled) setDevVars(result);
    });
    return () => {
      cancelled = true;
    };
  }, [project.format, project.path, showProjectSettings]);

  // Pages sidebar inline-edit / context-menu state + page CRUD handlers.
  const {
    existingPageNames,
    pageEdit,
    setPageEdit,
    pageEditBusy,
    pageEditError,
    setPageEditError,
    isEditingPage,
    resetPageEdit,
    handleAddPage,
    handleDuplicatePage,
    handleRenamePage,
    openPageMenu,
    buildMenuItems,
    pageMenu,
    closePageMenu,
    deletingPageName,
    setDeletingPageName,
    deletePageError,
    setDeletePageError,
    handleDeletePage,
  } = usePageManagement({
    project,
    onProjectChange,
    activePageName,
    setActivePageName,
    persistActiveSource,
    // Defined by useComponentManagement below; routed through a ref
    // because the page menu is built before that hook runs.
    onConvertPageToView: (name) => convertPageRef.current?.(name),
    // Views need a components/ layout (Next.js or Scamp); a legacy project
    // keeps creating flat pages.
    onCreatePageAsView:
      project.format !== 'legacy'
        ? (slug) => addViewRef.current?.(slug) ?? Promise.resolve()
        : undefined,
  });
  const convertPageRef = useRef<((pageName: string) => void) | null>(null);
  const [showFrameworkBanner, setShowFrameworkBanner] = useState(true);
  const addViewRef = useRef<((slug: string) => Promise<void>) | null>(null);

  // Components sidebar inline-edit / context-menu state + the multi-file
  // add / rename / delete handlers.
  const {
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
    closeComponentMenu,
    requestDeleteComponent,
    deletingComponent,
    setDeletingComponent,
    componentDeleteBusy,
    handleConfirmDeleteComponent,
    handleAddView,
    handleRenameView,
    convertingPage,
    setConvertingPage,
    convertPageBusy,
    convertPageError,
    requestConvertPageToView,
    convertAllPagesToViews,
    handleConfirmConvertPage,
  } = useComponentManagement({
    project,
    onProjectChange,
    activeComponent,
    setActiveComponentState,
    activePageName,
    setActivePageName,
    ensureRouteFor: routesApi.ensureRoute,
    renameRouteFor: routesApi.renameRouteView,
    openComponent,
    persistActiveSource,
  });
  convertPageRef.current = requestConvertPageToView;
  addViewRef.current = handleAddView;

  const bottomPanel = useCanvasStore((s) => s.bottomPanel);
  const toggleBottomPanel = useCanvasStore((s) => s.toggleBottomPanel);
  const storedSidebarSection = useCanvasStore((s) => s.sidebarSection);
  const signedIn = useIsSignedIn();
  // The agent is for signed-in users; signing out mid-session falls back
  // to the default section rather than leaving an empty panel.
  const sidebarSection =
    storedSidebarSection === 'agent' && !signedIn ? 'pages' : storedSidebarSection;
  const setSidebarSection = useCanvasStore((s) => s.setSidebarSection);

  // Once the user opens the terminal we keep TerminalPanel mounted for
  // the lifetime of the project, even when the panel is hidden, so any
  // long-running pty processes (Claude Code, dev servers, watches…)
  // survive being toggled out of view.
  const [showThemePanel, setShowThemePanel] = useState(false);
  const setOpenThemePanel = useCanvasStore((s) => s.setOpenThemePanel);
  useEffect(() => {
    setOpenThemePanel(() => setShowThemePanel(true));
    return () => setOpenThemePanel(null);
  }, [setOpenThemePanel]);
  const [terminalEverOpened, setTerminalEverOpened] = useState(false);
  useEffect(() => {
    if (bottomPanel === 'terminal') setTerminalEverOpened(true);
  }, [bottomPanel]);
  // Reset the "ever opened" flag when the project changes so a fresh
  // project starts with no background pty processes.
  useEffect(() => {
    setTerminalEverOpened(false);
  }, [project.path]);

  // Inject a `<link>` per project font URL so the canvas preview loads the
  // referenced Google Fonts stylesheets, and load theme tokens + font
  // imports from theme.css on open.
  useFontLinkReconciler();
  useProjectTheme(project.path);
  useDesignMdSync(project.path, project.name);

  // Auto-save snapshot trigger (every ~5 min of canvas activity), unless
  // disabled via the project's `snapshotAutoSave` config flag.
  useSnapshotAutoSave(project.path, projectConfig.snapshotAutoSave !== false);

  // Background click on the artboard scroll area (outside any frame
  // content) clears selection. Lives here rather than inside Viewport
  // because the scroll container moved up with the "artboard is the
  // scroll" restructure.
  useEffect(() => {
    const node = artboardScrollRef.current;
    if (!node) return;
    const handler = (e: MouseEvent): void => {
      if (e.target === node) {
        useCanvasStore.getState().selectElement(null);
      }
    };
    node.addEventListener('mousedown', handler);
    return () => node.removeEventListener('mousedown', handler);
    // The scroll node is remounted when the editor switches between a
    // page and a component or view; bind to whichever one is current.
  }, [activeComponent, activePageName]);

  // Same store action the canvas-toolbar buttons call, so the keyboard
  // shortcut and the buttons can't drift apart.
  const toggleCodePanel = (): void => toggleBottomPanel('code');
  const toggleTerminalPanel = (): void => toggleBottomPanel('terminal');

  // Where Preview goes: a page, a view, or in a Scamp framework project a
  // component alone, to try its interactions. see lib/previewTarget.ts
  const projectFormatForPreview = useCanvasStore((s) => s.projectFormat);
  const projectPathForPreview = useCanvasStore((s) => s.projectPath);
  const activeViewName = activeComponent?.kind === 'view' ? activeComponent.name : null;
  const previewTarget = useMemo(
    () =>
      previewTargetFor(
        projectFormatForPreview,
        {
          page: activePageName,
          view: activeViewName,
          component: activeComponent?.kind === 'component' ? activeComponent.name : null,
        },
        project
      ),
    [projectFormatForPreview, activePageName, activeComponent, project]
  );
  const canPreview = previewTarget !== null && projectPathForPreview.length > 0;
  const openPreview = useCallback((): void => {
    if (!canPreview || previewTarget === null) return;
    void window.scamp.openPreview({ projectPath: projectPathForPreview, ...previewTarget });
  }, [canPreview, projectPathForPreview, previewTarget]);

  // Push page-list updates to an already-open preview window so the
  // URL-bar dropdown stays current as the user adds / renames /
  // deletes pages in the canvas. No-op when preview isn't open —
  // main bails on a missing window for this project.
  useEffect(() => {
    if (!canPreview || previewTarget === null) return;
    void window.scamp.updatePreview({ projectPath: projectPathForPreview, ...previewTarget });
  }, [canPreview, projectPathForPreview, previewTarget]);

  // Multi-file component-instance flows (convert-to-component, lock-prop,
  // delete-prop-text, detach) + their confirmation-modal state. The
  // delete-prop-text request is raised from the keyboard handler below via
  // `instanceFlows.setDeletePropTextRequest`.
  const instanceFlows = useInstanceFlows({
    project,
    onProjectChange,
    projectConfig,
    onProjectConfigChange: handleProjectConfigChange,
    openComponent,
    activePageName,
  });

  // Latest refs for the global keydown effect, which binds once and
  // reads these via `.current` (see useLatest) instead of re-binding.
  const keyDeps = useLatest({
    toggleTerminalPanel,
    canPreview,
    openPreview,
    projectPages: project.pages,
    setDeletePropTextRequest: instanceFlows.setDeletePropTextRequest,
  });

  // Global canvas keyboard shortcuts + component-editor Esc. Bound here
  // (after keyDeps/latestExit exist) rather than earlier in the body.
  useCanvasKeyboardShortcuts(keyDeps, { activeComponent, latestExit });
  useSvgAssetReload();

  const {
    exportHtml,
    status: exportStatus,
    message: exportMessage,
    location: exportLocation,
  } = useHtmlExport(project.path, project.name);

  return (
    <div className={styles.shell}>
      <ProjectHeader
        projectName={project.name}
        canPreview={canPreview}
        projectFormat={projectFormatForPreview}
        onClose={onClose}
        onOpenPreview={openPreview}
        onExportHtml={exportHtml}
        exportStatus={exportStatus}
        exportMessage={exportMessage}
        exportLocation={exportLocation}
      />
      <SaveStatusToast />
      {showMigrationBanner && (
        <MigrationBanner onDismiss={handleDismissMigrationBanner} />
      )}
      {project.format === 'scamp' && project.framework && showFrameworkBanner && (
        <FrameworkContractBanner
          framework={project.framework}
          onDismiss={() => setShowFrameworkBanner(false)}
        />
      )}
      {parseError && (
        <ParseErrorBanner
          targetName={parseError.targetName}
          reason={parseError.reason}
          onDismiss={clearParseError}
        />
      )}
      {project.format === 'legacy' && !projectConfig.nextjsMigrationDismissed && (
        <NextjsMigrationBanner
          project={project}
          onMigrated={(next) => {
            // Project flips to nextjs format — refresh upward and pick
            // the home page so the renderer doesn't try to render a
            // page whose paths just changed under it.
            onProjectChange?.(next);
            setActivePageName(next.pages[0]?.name ?? null);
          }}
          onDismiss={() =>
            handleProjectConfigChange({
              ...projectConfig,
              nextjsMigrationDismissed: true,
            })
          }
        />
      )}
      <div className={styles.body}>
        <SidebarRail
          section={sidebarSection}
          onSelectSection={(next) => {
            setShowProjectSettings(false);
            setShowThemePanel(false);
            setSidebarSection(next);
          }}
          onOpenDesignSystem={() => {
            setShowProjectSettings(false);
            setShowThemePanel((open) => !open);
          }}
          onOpenSettings={() => {
            setShowThemePanel(false);
            setShowProjectSettings(true);
          }}
          designSystemOpen={showThemePanel}
          settingsOpen={showProjectSettings}
          agentAvailable={signedIn}
        />
        <div className={styles.bodyContent}>
        <aside
          className={`${styles.sidebar} ${
            sidebarSection === 'agent' && !showThemePanel ? styles.sidebarWide : ''
          }`}
        >
          {showThemePanel ? (
            <ThemeSectionNav />
          ) : (
            <>
          {sidebarSection === 'history' && (
            <HistoryPanel projectPath={project.path} />
          )}
          {sidebarSection === 'agent' && <AgentPanel />}
          {sidebarSection === 'pages' && (
            <>
          <PageSidebar
            projectPath={project.path}
            pageLayout={projectConfig.pageLayout}
            onPageLayoutChange={handlePageLayoutChange}
            pages={project.pages}
            views={project.components.filter((c) => componentKindOf(c) === 'view')}
            existingPageNames={existingPageNames}
            pageEdit={pageEdit}
            pageEditError={pageEditError}
            pageEditBusy={pageEditBusy}
            isEditingPage={isEditingPage}
            activePageName={activePageName}
            activeComponent={activeComponent}
            setPageEdit={setPageEdit}
            setPageEditError={setPageEditError}
            resetPageEdit={resetPageEdit}
            handleAddPage={handleAddPage}
            handleDuplicatePage={handleDuplicatePage}
            handleRenamePage={handleRenamePage}
            openPageMenu={openPageMenu}
            openView={(name) => openComponent(name, null, 'view')}
            openViewMenu={openComponentMenu}
            handleRenameView={async (name, slug) => {
              const ok = await handleRenameView(name, slug);
              resetPageEdit();
              return ok;
            }}
            persistActiveSource={persistActiveSource}
            setActiveComponentState={setActiveComponentState}
            setActivePageName={setActivePageName}
            onImportWebsite={() => {
              void window.scamp.openImport({
                projectPath: project.path,
                breakpoints: projectConfig.breakpoints,
              });
            }}
            onImportReact={() => setReactImportOpen(true)}
          />
              <div
                className={`${styles.sidebarSection} ${styles.sidebarLayers}`}
                data-testid="layers-panel"
              >
                <h2 className={styles.sidebarTitle}>Layers</h2>
                <ElementTree />
              </div>
            </>
          )}
          {sidebarSection === 'components' && (
            <>
          <ComponentSidebar
            components={project.components}
            projectPath={project.path}
            componentEdit={componentEdit}
            componentEditError={componentEditError}
            renamingComponent={renamingComponent}
            creatingComponent={creatingComponent}
            activeComponent={activeComponent}
            setComponentEdit={setComponentEdit}
            setComponentEditError={setComponentEditError}
            handleAddComponent={handleAddComponent}
            handleRenameComponent={handleRenameComponent}
            openComponent={openComponent}
            openComponentMenu={openComponentMenu}
          />
          <div
            className={`${styles.sidebarSection} ${styles.sidebarLayers}`}
            data-testid="layers-panel"
          >
            <h2 className={styles.sidebarTitle}>Layers</h2>
            <ElementTree />
          </div>
            </>
          )}
            </>
          )}
        </aside>
        {showThemePanel ? (
          <ThemePanel projectPath={project.path} />
        ) : (
          <>
            <CanvasArea
              activeComponent={activeComponent}
              activePageName={activePageName}
              projectConfig={projectConfig}
              artboardScrollRef={artboardScrollRef}
              onProjectConfigChange={handleProjectConfigChange}
              onExitComponentEditor={exitComponentEditor}
            />
            <PropertiesPanel
              migrationNotice={
                project.format === 'nextjs' && !projectConfig.scampMigrationDismissed ? (
                  <ScampMigrationNotice
                    project={project}
                    convertPages={convertAllPagesToViews}
                    onMigrated={(next) => {
                      onProjectChange?.(next);
                      setActivePageName(null);
                      const firstView = next.components.find((c) => c.kind === 'view');
                      if (firstView) openComponent(firstView.name, null, 'view');
                    }}
                    onDismiss={() =>
                      handleProjectConfigChange({
                        ...projectConfig,
                        scampMigrationDismissed: true,
                      })
                    }
                  />
                ) : null
              }
              routesSection={
                project.format === 'scamp' ? (
                  <RoutesSection
                    routes={routesApi.routes}
                    views={project.components.filter((c) => componentKindOf(c) === 'view')}
                    activeViewName={activeViewName}
                    busy={routesApi.busy}
                    onOpen={(file) => void routesApi.openRoute(file)}
                    onSetRender={(file, render) => void routesApi.setRender(file, render)}
                    onGenerate={(name) => void routesApi.generateRoute(name)}
                  />
                ) : null
              }
            />
          </>
        )}
        {reactImportOpen && (
          <ReactImportDialog
            projectPath={project.path}
            projectName={project.name}
            onClose={() => setReactImportOpen(false)}
            onReady={(url, appName, tokens, newProject) => {
              setReactImportOpen(false);
              if (newProject !== undefined && onSwitchProject !== undefined) {
                onSwitchProject(newProject, { url, appName, tokens });
                return;
              }
              void window.scamp.openImport({
                projectPath: project.path,
                url,
                breakpoints: projectConfig.breakpoints,
                react: { appName, tokens },
              });
            }}
          />
        )}
        {showProjectSettings && (
          <ProjectSettingsPage
            projectName={project.name}
            projectPath={project.path}
            config={projectConfig}
            onChange={handleProjectConfigChange}
            onBack={() => setShowProjectSettings(false)}
            framework={frameworkUpdate}
            routes={
              project.format === 'scamp'
                ? {
                    routes: routesApi.routes,
                    unrouted: allUnroutedViews(
                      routesApi.routes,
                      project.components.filter((c) => componentKindOf(c) === 'view')
                    ),
                    busy: routesApi.busy,
                    onOpen: (file) => {
                      // The code panel lives in the editor, so leave
                      // settings on the way there.
                      setShowProjectSettings(false);
                      void routesApi.openRoute(file);
                    },
                    onSetRender: (file, render) => void routesApi.setRender(file, render),
                    onGenerate: (name) => void routesApi.generateRoute(name),
                  }
                : undefined
            }
            environment={
              project.format === 'scamp'
                ? {
                    exists: devVars?.exists ?? false,
                    keys: devVars?.keys ?? [],
                    onOpen: () => void window.scamp.openDevVars({ projectPath: project.path }),
                  }
                : undefined
            }
          />
        )}
        </div>
      </div>
      {bottomPanel === 'code' && <CodePanel showTheme={showThemePanel} />}
      {/*
       * The terminal panel mounts on first open and stays mounted until
       * the project changes. We pass `hidden` so the active panel
       * toggle still controls visibility, but the inner pty processes
       * keep running between toggles.
       */}
      {terminalEverOpened && (
        <TerminalPanel
          key={project.path}
          cwd={project.path}
          hidden={bottomPanel !== 'terminal'}
        />
      )}
      <ProjectModals
        components={project.components}
        instanceFlows={instanceFlows}
        pageMenu={pageMenu}
        buildMenuItems={buildMenuItems}
        moveItemsFor={(slug) => {
          const slugs = [
            ...project.pages.map((p) => p.name),
            ...project.components.filter((c) => componentKindOf(c) === 'view').map((c) => viewSlugFor(c.name)),
          ];
          const layout = reconcileLayout(slugs, projectConfig.pageLayout);
          return moveTargets(layout, slug).map(({ label, group }) => ({
            label,
            onSelect: () => handlePageLayoutChange(() => movePageToGroup(layout, slug, group)),
          }));
        }}
        closePageMenu={closePageMenu}
        deletingPageName={deletingPageName}
        deletePageError={deletePageError}
        handleDeletePage={handleDeletePage}
        setDeletingPageName={setDeletingPageName}
        setDeletePageError={setDeletePageError}
        componentMenu={componentMenu}
        closeComponentMenu={closeComponentMenu}
        setComponentEdit={setComponentEdit}
        setComponentEditError={setComponentEditError}
        requestDeleteComponent={requestDeleteComponent}
        startRenameView={(name) => {
          setPageEditError(null);
          setPageEdit({ rename: viewSlugFor(name) });
        }}
        convertingPage={convertingPage}
        setConvertingPage={setConvertingPage}
        convertPageBusy={convertPageBusy}
        convertPageError={convertPageError}
        handleConfirmConvertPage={handleConfirmConvertPage}
        deletingComponent={deletingComponent}
        componentDeleteBusy={componentDeleteBusy}
        handleConfirmDeleteComponent={handleConfirmDeleteComponent}
        setDeletingComponent={setDeletingComponent}
      />
    </div>
  );
};

import { useCallback, useEffect, useState } from 'react';

import type {
  ComponentFile,
  PageFile,
  ProjectConfig,
  ProjectData,
} from '@shared/types';
import { errorMessage } from '@shared/errorMessage';
import { componentKindOf, DESKTOP_BREAKPOINT_ID, type ComponentKind } from '@shared/types';
import { SUPPORTED_CONTRACT, isSupportedContract } from '@shared/projectConfig';
import { useCanvasStore } from '@store/canvasSlice';
import { useAppLogStore } from '@store/appLogSlice';
import { parseCode } from '@lib/parseCode';

import { flushPendingPageWrite } from '../../syncBridge';
import { useLatest } from './useLatest';
import { useNavigationRequests } from './useNavigationRequests';
import type { ActiveComponent } from './types';

type ProjectChange = (
  next: ProjectData | ((prev: ProjectData) => ProjectData)
) => void;

type Args = {
  project: ProjectData;
  onProjectChange?: ProjectChange;
  projectConfig: ProjectConfig;
  handleProjectConfigChange: (next: ProjectConfig) => void;
};

export type UseActiveTarget = {
  activePageName: string | null;
  setActivePageName: (name: string | null) => void;
  activeComponent: ActiveComponent | null;
  setActiveComponentState: (next: ActiveComponent | null) => void;
  parseError: { targetName: string; reason?: string } | null;
  clearParseError: () => void;
  showMigrationBanner: boolean;
  handleDismissMigrationBanner: () => void;
  persistActiveSource: () => void;
  openComponent: (
    name: string,
    fromPage: string | null,
    kind?: ComponentKind,
    from?: { name: string; kind: ComponentKind }
  ) => void;
  exitComponentEditor: () => void;
  latestExit: { current: () => void };
};

/**
 * Owns which page or component is open in the canvas and the load
 * pipeline that parses its TSX/CSS into the store. Mutually exclusive:
 * opening a component clears the active page and vice-versa. Also owns
 * the parse-error + migration banner state the load raises, the
 * source-persistence helper that mirrors the canvas's serialized output
 * back into project.* before a target swap, and the component
 * enter/exit transitions. Consumes the canvas's one-shot navigation
 * requests here since it owns `openComponent`.
 * see docs/notes/components-multi-file-ops.md
 */
export const useActiveTarget = ({
  project,
  onProjectChange,
  projectConfig,
  handleProjectConfigChange,
}: Args): UseActiveTarget => {
  const [activePageName, setActivePageName] = useState<string | null>(
    project.pages[0]?.name ?? null
  );
  // The component currently being edited, when the canvas is in
  // the component editor instead of the page editor. Mutually
  // exclusive with `activePageName` — opening one clears the other.
  // The optional `returnToPage` field records which page (if any)
  // the user entered the component from so Esc / breadcrumb-click
  // can put them back where they were. For Phase 2 the user only
  // enters from the sidebar list, so this stays null in practice.
  // A framework project has no pages: its first view opens instead, so
  // the canvas always has a target to draw on and save to.
  const [activeComponent, setActiveComponentState] =
    useState<ActiveComponent | null>(() => {
      if (project.pages.length > 0) return null;
      const firstView = project.components.find((c) => componentKindOf(c) === 'view');
      return firstView ? { name: firstView.name, kind: 'view', returnToPage: null } : null;
    });
  // Set true when parseCode detected the legacy root three-tuple on
  // any page load in this session. Cleared when the user dismisses
  // the banner (which also persists `canvasMigrationAcknowledged` to
  // scamp.config.json so the banner never reappears).
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);
  // Set when `parseCode` throws on the active page/component. The
  // canvas keeps its last good state and this drives the inline
  // ParseErrorBanner; cleared once the target parses again.
  const [parseError, setParseError] = useState<{
    targetName: string;
    reason?: string;
  } | null>(
    null
  );

  // A project re-read hands back the open file as disk holds it, which
  // is what the canvas last saved — reloading that would only clear the
  // selection and race a pending save. see docs/notes/agent-whole-project.md
  const alreadyShowing = (tsxPath: string, file: { tsxContent: string; cssContent: string }): boolean => {
    const shown = useCanvasStore.getState();
    const openPath = shown.activeComponent?.tsxPath ?? shown.activePage?.tsxPath;
    return (
      openPath === tsxPath &&
      shown.pageSource !== null &&
      shown.pageSource.tsx === file.tsxContent &&
      shown.pageSource.css === file.cssContent
    );
  };

  // Which breakpoint is active follows the target. A component opens at
  // Desktop, never at whatever a page was last set to; a page or view
  // gets back the breakpoint its canvas width is, so the width it shows
  // and the CSS its edits land in agree. see docs/notes/canvas-injected-stylesheet.md
  const inComponentEditor = activeComponent?.kind === 'component';
  const activeComponentName = activeComponent?.name ?? null;
  useEffect(() => {
    const store = useCanvasStore.getState();
    if (inComponentEditor) {
      store.setActiveBreakpoint(DESKTOP_BREAKPOINT_ID);
      return;
    }
    const match = projectConfig.breakpoints.find((b) => b.width === projectConfig.canvasWidth);
    store.setActiveBreakpoint(match?.id ?? DESKTOP_BREAKPOINT_ID);
  }, [inComponentEditor, activeComponentName, projectConfig.breakpoints, projectConfig.canvasWidth]);

  const loadPage = useCanvasStore((s) => s.loadPage);
  const loadComponent = useCanvasStore((s) => s.loadComponent);
  const resetForNewPage = useCanvasStore((s) => s.resetForNewPage);

  // Parse + load the selected page whenever it changes. The store's
  // sync bridge handles writes back to disk on canvas edits.
  // Skipped when the user has entered the component editor —
  // `activeComponent` takes precedence and a sibling effect below
  // loads that target instead.
  useEffect(() => {
    if (activeComponent !== null) return;
    if (!activePageName) {
      resetForNewPage();
      return;
    }
    const page: PageFile | undefined = project.pages.find((p) => p.name === activePageName);
    if (!page) {
      resetForNewPage();
      return;
    }
    if (alreadyShowing(page.tsxPath, page)) return;
    let parsed: ReturnType<typeof parseCode>;
    try {
      parsed = parseCode(page.tsxContent, page.cssContent, {
        breakpoints: projectConfig.breakpoints,
      });
    } catch (err) {
      // Keep the last successfully-parsed canvas instead of blanking,
      // and surface the failure inline + in the activity log. The
      // file-changed reload re-runs this effect, so a fixed file
      // clears the banner on its own.
      useAppLogStore
        .getState()
        .log('error', `Couldn't parse page "${page.name}": ${errorMessage(err)}`);
      setParseError({ targetName: page.name });
      return;
    }
    setParseError(null);
    // Surface the one-time migration banner when the parser had to
    // strip the legacy root sizing three-tuple. Skipped when the user
    // has already dismissed it on a prior open of this project.
    if (parsed.migrated && !projectConfig.canvasMigrationAcknowledged) {
      setShowMigrationBanner(true);
    }
    // Notify when the parser had to repair duplicate `data-scamp-id`s —
    // it reassigns the later element a fresh id (keeping both elements and
    // their styling). The fix is in-memory until the next save.
    if (parsed.duplicateIdRepairs && parsed.duplicateIdRepairs.length > 0) {
      const list = parsed.duplicateIdRepairs
        .map((r) => `${r.from} → ${r.to}`)
        .join(', ');
      useAppLogStore
        .getState()
        .log(
          'warn',
          `Repaired ${parsed.duplicateIdRepairs.length} duplicate element id(s) in "${page.name}": ${list}. Save the page to persist the fix.`
        );
    }
    loadPage(
      { name: page.name, tsxPath: page.tsxPath, cssPath: page.cssPath },
      parsed.elements,
      { tsx: page.tsxContent, css: page.cssContent },
      parsed.customMediaBlocks,
      parsed.keyframesBlocks,
      parsed.cssDuplicates
    );
    // Per-page history persists across page switches — `loadPage`
    // activates this page's bucket in the history slice. Don't
    // clear here; switching back to this page should restore its
    // stack.
  }, [
    activeComponent,
    activePageName,
    project.pages,
    loadPage,
    resetForNewPage,
    projectConfig.canvasMigrationAcknowledged,
  ]);

  // Parse + load the active component whenever it changes. Mirror
  // of the page-load effect above — component editor reuses every
  // canvas / panel / history primitive unchanged.
  useEffect(() => {
    if (activeComponent === null) return;
    const component: ComponentFile | undefined = project.components.find(
      (c) => c.name === activeComponent.name
    );
    if (!component) {
      // The component disappeared from disk while we had it open
      // (rename / delete from outside Scamp). Fall back to a clean
      // canvas — the sidebar will refresh on the next pages-changed
      // event and the user can re-open whatever's still there.
      setActiveComponentState(null);
      resetForNewPage();
      return;
    }
    if (activeComponent.kind === componentKindOf(component) && alreadyShowing(component.tsxPath, component)) return;
    let parsed: ReturnType<typeof parseCode>;
    try {
      parsed = parseCode(component.tsxContent, component.cssContent, {
        breakpoints: projectConfig.breakpoints,
        isComponent: true,
      });
    } catch (err) {
      // Keep the last good canvas; surface inline + in the activity log.
      useAppLogStore
        .getState()
        .log(
          'error',
          `Couldn't parse component "${component.name}": ${errorMessage(err)}`
        );
      setParseError({ targetName: component.name });
      return;
    }
    // A component written for a newer framework contract than this
    // build knows would be rewritten into the older shape on the next
    // save, so it's shown but not edited. see docs/plans/framework-phase-1-plan.md
    if (parsed.viewMeta && !isSupportedContract(parsed.viewMeta.contract)) {
      const reason = `This component was written for scampjs contract ${parsed.viewMeta.contract}; this version of Scamp supports ${SUPPORTED_CONTRACT.min}\u2013${SUPPORTED_CONTRACT.max}. Update Scamp to edit it.`;
      useAppLogStore.getState().log('error', `"${component.name}": ${reason}`);
      setParseError({ targetName: component.name, reason });
      return;
    }
    setParseError(null);
    // The shell's copy of the kind drives the banner and the artboard
    // default; keep it true to the file on disk.
    if (activeComponent.kind !== componentKindOf(component)) {
      setActiveComponentState({ ...activeComponent, kind: componentKindOf(component) });
    }
    loadComponent(
      {
        name: component.name,
        kind: componentKindOf(component),
        tsxPath: component.tsxPath,
        cssPath: component.cssPath,
      },
      parsed.elements,
      { tsx: component.tsxContent, css: component.cssContent },
      parsed.customMediaBlocks,
      parsed.keyframesBlocks,
      parsed.cssDuplicates
    );
  }, [
    activeComponent,
    project.components,
    loadComponent,
    resetForNewPage,
    projectConfig.canvasMigrationAcknowledged,
  ]);

  const handleDismissMigrationBanner = useCallback((): void => {
    setShowMigrationBanner(false);
    handleProjectConfigChange({
      ...projectConfig,
      canvasMigrationAcknowledged: true,
    });
  }, [projectConfig, handleProjectConfigChange]);

  /**
   * Mirror the canvas's current `pageSource` (the just-serialized
   * TSX + CSS for the active target) back into
   * `project.pages` / `project.components` before swapping
   * targets. Without this, the per-target snapshots in
   * `project.*` stay frozen at their initial-load content, and
   * the load useEffect's call to `parseCode(snapshot.tsxContent,
   * …)` parses the OLD blank template on every re-entry —
   * silently dropping every edit the user made.
   *
   * `flushPendingPageWrite()` must run BEFORE this helper so any
   * unwritten changes are first serialized into `pageSource`
   * via `writeIfDirty → setPageSource`.
   */
  const persistActiveSource = (): void => {
    const source = useCanvasStore.getState().pageSource;
    if (!source) return;
    // Capture the target identity from the React closure (NOT the
    // mutating `prev` arg) since the rule "are we on a page or a
    // component" doesn't change between queued updates — it's
    // determined by what the user is editing right now.
    const targetComponentName =
      activeComponent !== null ? activeComponent.name : null;
    const targetPageName = activePageName;
    if (targetComponentName !== null) {
      // Use a functional updater so a previously-queued
      // setProject from the same handler (e.g. convert-to-
      // component adding a new entry to project.components)
      // composes correctly with this update instead of getting
      // stomped by the closure-captured `project` ref.
      onProjectChange?.((prev) => {
        const existing = prev.components.find(
          (c) => c.name === targetComponentName
        );
        if (
          existing &&
          existing.tsxContent === source.tsx &&
          existing.cssContent === source.css
        ) {
          return prev;
        }
        return {
          ...prev,
          components: prev.components.map((c) =>
            c.name === targetComponentName
              ? { ...c, tsxContent: source.tsx, cssContent: source.css }
              : c
          ),
        };
      });
      return;
    }
    if (targetPageName !== null) {
      onProjectChange?.((prev) => {
        const existing = prev.pages.find((p) => p.name === targetPageName);
        if (
          existing &&
          existing.tsxContent === source.tsx &&
          existing.cssContent === source.css
        ) {
          return prev;
        }
        return {
          ...prev,
          pages: prev.pages.map((p) =>
            p.name === targetPageName
              ? { ...p, tsxContent: source.tsx, cssContent: source.css }
              : p
          ),
        };
      });
    }
  };

  /**
   * Open the named component in the component editor. Flushes any
   * pending edit on the OUTGOING target first so a debounced page
   * write doesn't fire after we've switched the active target,
   * then persists the outgoing target's latest content into
   * `project.*` so re-entry picks up the user's work instead of
   * a stale snapshot. `fromPage` records the page we're leaving
   * so Esc / breadcrumb click can return there; Phase 2 always
   * passes null because the only entry point is the sidebar list.
   */
  const openComponent = (
    name: string,
    fromPage: string | null,
    kind?: ComponentKind,
    from?: { name: string; kind: ComponentKind }
  ): void => {
    flushPendingPageWrite();
    persistActiveSource();
    // A just-created file isn't in `project.components` yet (the state
    // update is still in flight), so creation passes the kind explicitly.
    const file = project.components.find((c) => c.name === name);
    const nextKind = kind ?? (file ? componentKindOf(file) : 'component');
    // A component opened from a view or another component — by double-click
    // or from the sidebar — goes back there. In a project made of views
    // there's no page to fall back to, and leaving drew an empty canvas.
    const origin =
      from ??
      (nextKind === 'component' && fromPage === null && activeComponent !== null && activeComponent.name !== name
        ? { name: activeComponent.name, kind: activeComponent.kind }
        : undefined);
    setActiveComponentState({
      name,
      kind: nextKind,
      returnToPage: fromPage,
      ...(origin !== undefined ? { returnTo: origin } : {}),
    });
  };
  // Latest refs for the one-shot canvas→component-editor navigation
  // effect, which binds before these are defined (see useLatest).
  const componentNav = useLatest({ openComponent, activePageName, activeComponent });

  // Consume the canvas's one-shot page / component navigation requests
  // (link indicator jump, double-click into an instance editor). Lives
  // here because it reads `openComponent` via the `componentNav` ref.
  useNavigationRequests(project, setActivePageName, componentNav);

  /**
   * Exit the component editor. If the user entered from a page,
   * return there; otherwise drop back to whatever page is the
   * current default. Flushes the pending component write first
   * so the component's changes land on disk before the canvas
   * swaps to the page target, then persists the latest serialized
   * source into `project.components` so re-entry shows the user's
   * work, not the original template.
   */
  const exitComponentEditor = (): void => {
    if (activeComponent === null) return;
    flushPendingPageWrite();
    persistActiveSource();
    const back = activeComponent.returnTo;
    if (back !== undefined && project.components.some((c) => c.name === back.name)) {
      setActiveComponentState({ name: back.name, kind: back.kind, returnToPage: null });
      return;
    }
    const next = activeComponent.returnToPage;
    setActiveComponentState(null);
    if (next !== null) setActivePageName(next);
  };
  // Latest ref for the component-editor Esc handler, which binds
  // before this is defined (see useLatest).
  const latestExit = useLatest(exitComponentEditor);

  return {
    activePageName,
    setActivePageName,
    activeComponent,
    setActiveComponentState,
    parseError,
    clearParseError: () => setParseError(null),
    showMigrationBanner,
    handleDismissMigrationBanner,
    persistActiveSource,
    openComponent,
    exitComponentEditor,
    latestExit,
  };
};

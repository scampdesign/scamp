import { useEffect, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { StartScreen } from './components/StartScreen';
import { flushPendingProjectThumbnail } from './lib/projectThumbnail';
import { ProjectShell } from './components/ProjectShell';
import { SettingsPage } from './components/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SentryOptInPrompt } from './components/SentryOptInPrompt';
import { initSyncBridge, flushPendingPageWrite } from './syncBridge';
import { applyAppTheme } from './lib/applyAppTheme';
import { CONSENT_VERSION, hasCurrentConsent } from '@shared/consent';
import { useFontsStore } from '@store/fontsSlice';
import { useTerminalActivityStore } from '@store/terminalActivitySlice';
import type { ProjectData } from '@shared/types';

type View = 'start' | 'project' | 'settings';

/**
 * Crash-reporting opt-in state. `null` while we're reading the
 * stored pref via IPC; `'pending'` when the user has not been
 * asked yet (the prompt is rendered); `'resolved'` once they've
 * decided either way (regardless of which way). Only `'resolved'`
 * lets the rest of the app render — we don't want the user
 * distracted by the prompt mid-session.
 */
type OptInState = 'loading' | 'pending' | 'resolved';

export const App = (): JSX.Element => {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [view, setView] = useState<View>('start');
  const [optInState, setOptInState] = useState<OptInState>('loading');

  // On mount, read settings.sentryOptIn. `null` (or any error
  // reading the file) → show the opt-in prompt. `true` or `false`
  // → user has already decided, render the app normally.
  useEffect(() => {
    void (async () => {
      try {
        const settings = await window.scamp.getSettings();
        // settings.json is authoritative — reconcile against the fast
        // localStorage mirror the boot script painted from (they only
        // differ on a fresh install or an edit from another machine).
        applyAppTheme(settings.theme);
        // A choice recorded against older consent wording counts as
        // undecided — carrying it forward would claim consent for
        // something the user was never shown. See CONSENT_VERSION.
        setOptInState(hasCurrentConsent(settings) ? 'resolved' : 'pending');
      } catch {
        // Settings read failed — fall through to the prompt so the
        // user can still make a choice this session.
        setOptInState('pending');
      }
    })();
  }, []);

  const handleOptInDecision = async (optedIn: boolean): Promise<void> => {
    try {
      await window.scamp.updateSettings({
        sentryOptIn: optedIn,
        consentVersion: CONSENT_VERSION,
      });
      await window.scamp.reinitSentry(optedIn);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[opt-in] persist failed:', err);
    }
    setOptInState('resolved');
  };

  useEffect(() => {
    return initSyncBridge();
  }, []);

  // Phase 4.2: keep the terminal-activity slice in sync with main's
  // pty foreground-process events. The sync bridge subscribes to
  // this slice and pauses canvas writes when an agent is detected
  // running in any of Scamp's integrated terminals.
  useEffect(() => {
    const offForeground = window.scamp.onTerminalForegroundProcess(
      ({ id, processName }) => {
        useTerminalActivityStore.getState().setForeground(id, processName);
      }
    );
    const offExit = window.scamp.onTerminalExit(({ id }) => {
      useTerminalActivityStore.getState().removeTerminal(id);
    });
    return () => {
      offForeground();
      offExit();
    };
  }, []);

  // When the file watcher reports that a page-file appeared or
  // disappeared on disk (agent created a page, user dropped a
  // file in the folder, etc.), re-read the project and update
  // the navigator. The handler keys off the latest project state
  // via the functional setProject so it stays correct across
  // re-mounts without needing `project` in the dependency array
  // (which would otherwise re-subscribe on every project change).
  useEffect(() => {
    const off = window.scamp.onProjectPagesChanged(() => {
      setProject((current) => {
        if (!current) return current;
        void (async () => {
          try {
            const next = await window.scamp.readProject({
              folderPath: current.path,
            });
            setProject((latest) => {
              if (!latest) return latest;
              // Preserve the old page / component object references
              // for any artifact whose content hasn't changed.
              // ProjectShell's load useEffects use `project.pages`
              // and `project.components` as deps; without this
              // preservation, every chokidar event on any file
              // would re-create the active artifact object and
              // re-fire its loader, racing with any in-flight
              // debounced save and tripping the 2s ack watchdog.
              const pagesByName = new Map(
                latest.pages.map((p) => [p.name, p])
              );
              const mergedPages = next.pages.map((np) => {
                const old = pagesByName.get(np.name);
                if (
                  old &&
                  old.tsxContent === np.tsxContent &&
                  old.cssContent === np.cssContent &&
                  old.tsxPath === np.tsxPath &&
                  old.cssPath === np.cssPath
                ) {
                  return old;
                }
                return np;
              });
              const componentsByName = new Map(
                latest.components.map((c) => [c.name, c])
              );
              const mergedComponents = next.components.map((nc) => {
                const old = componentsByName.get(nc.name);
                if (
                  old &&
                  old.tsxContent === nc.tsxContent &&
                  old.cssContent === nc.cssContent &&
                  old.tsxPath === nc.tsxPath &&
                  old.cssPath === nc.cssPath
                ) {
                  return old;
                }
                return nc;
              });
              // Skip the state update entirely when both lists
              // round-trip to identical references — re-reads
              // from the renderer's own writes (page or component)
              // hit this branch and never touch React state.
              const samePages =
                mergedPages.length === latest.pages.length &&
                mergedPages.every((p, i) => p === latest.pages[i]);
              const sameComponents =
                mergedComponents.length === latest.components.length &&
                mergedComponents.every(
                  (c, i) => c === latest.components[i]
                );
              if (samePages && sameComponents) return latest;
              return {
                ...next,
                pages: mergedPages,
                components: mergedComponents,
              };
            });
          } catch {
            // Read failed — most likely the project folder was
            // moved or deleted while open. Leave the current
            // state alone; the next user action will surface a
            // clearer error.
          }
        })();
        return current;
      });
    });
    return off;
  }, []);

  // Warm the system-font list on app start. The call is cheap on a
  // warm session and falls back to a baseline list if the Local Font
  // Access API isn't available.
  useEffect(() => {
    void useFontsStore.getState().loadSystemFonts();
  }, []);

  // E2E hook: when the main process was launched with SCAMP_E2E=1 and
  // SCAMP_E2E_OPEN_PROJECT points at a seeded project folder, skip the
  // Start Screen and jump straight into that project. Disabled in
  // normal use — the bootstrap flags are null unless the env var is set.
  useEffect(() => {
    void (async () => {
      const bootstrap = await window.scamp.getTestBootstrap();
      // The canvas store, for specs that need to drive an action the UI
      // reaches through a popover or a drag. Gated on the same flag as
      // the auto-open below, so it is absent in normal use — the same
      // shape as main's `__scampDisposeTerminals`.
      if (bootstrap.e2e) {
        (window as unknown as { __scampCanvasStore?: unknown }).__scampCanvasStore =
          useCanvasStore;
      }
      if (!bootstrap.e2e || !bootstrap.autoOpenProjectPath) return;
      const opened = await window.scamp.openProject({
        folderPath: bootstrap.autoOpenProjectPath,
      });
      setProject(opened);
      setView('project');
    })();
  }, []);

  // First-launch crash-reporting opt-in. Renders before anything
  // else so the user makes the choice before any project loads.
  if (optInState === 'loading') {
    // Brief blank state while the IPC round-trip resolves. Avoids
    // a flash of the StartScreen before the prompt mounts.
    return <></>;
  }
  if (optInState === 'pending') {
    return (
      <SentryOptInPrompt
        onDecision={(optedIn) => void handleOptInDecision(optedIn)}
      />
    );
  }

  if (view === 'settings') {
    return (
      <SettingsPage
        onBack={() => setView(project ? 'project' : 'start')}
      />
    );
  }

  if (view === 'project' && project) {
    const closingProjectPath = project.path;
    return (
      <ErrorBoundary>
        <ProjectShell
          project={project}
          onClose={() => {
            // Session-close snapshot: flush any pending debounced write
            // so the snapshot includes the latest canvas state, then take
            // it. Fire-and-forget — main reads the project from disk.
            flushPendingPageWrite();
            // Take the thumbnail before the canvas goes: the capture
            // detaches its own copy synchronously, so it survives the
            // unmount on the next line.
            flushPendingProjectThumbnail(closingProjectPath);
            void window.scamp.createSnapshot({
              projectPath: closingProjectPath,
              trigger: 'session_close',
            });
            // Close the preview window and stop its dev server
            // before tearing down the project — preview shouldn't
            // outlive the project that's editing it.
            void window.scamp.closePreview(closingProjectPath);
            setProject(null);
            setView('start');
          }}
          onProjectChange={(next) => {
            // ProjectShell's `onProjectChange` prop accepts a
            // value OR a functional updater so multi-step
            // handlers (convert-to-component, rename, etc.)
            // can compose their updates without stomping each
            // other. Bridge the type mismatch: our `setProject`
            // is on a `ProjectData | null` state, while the
            // prop assumes `ProjectData` is always present.
            // Bail on a null state — the caller only fires when
            // the user is inside a project.
            if (typeof next === 'function') {
              setProject((prev) => (prev ? next(prev) : prev));
            } else {
              setProject(next);
            }
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <StartScreen
      onProjectOpened={(p) => {
        setProject(p);
        setView('project');
      }}
      onOpenSettings={() => setView('settings')}
    />
  );
};

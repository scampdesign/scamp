import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/electron/renderer';
import { isOptedIn } from '@shared/consent';
import { App } from './App';
import { TitleBar } from './components/TitleBar';
import { UpdateBanner } from './components/UpdateBanner';
import { applyAppTheme, readInitialAppTheme } from './lib/applyAppTheme';
// `theme.css` must come first — it declares the `--*` variables that
// global.css and every module CSS reference.
import './styles/theme.css';
import './styles/global.css';

// Paint the persisted theme before React mounts. The pre-paint script in
// index.html already set `data-theme` from the same localStorage mirror to
// avoid a flash; this re-asserts it once the module graph is live. The
// authoritative value from settings.json is reconciled on mount (see App).
applyAppTheme(readInitialAppTheme());

// Renderer-side Sentry init. The main process already initialised
// Sentry from settings.json (synchronously, before any other code);
// the renderer mirrors that decision by reading the same pref via
// IPC. Renderer-side init is required for renderer crash capture —
// without it, `@sentry/electron/main` only sees main-process
// errors, not browser/React ones.
//
// Fire-and-forget so React rendering isn't blocked on the IPC
// round-trip. Any error in the brief pre-init window goes uncaught;
// errors during init itself are caught and logged. The opt-in
// check is the source of truth — when false (or null), Sentry
// never initialises.
void (async (): Promise<void> => {
  try {
    const settings = await window.scamp.getSettings();
    // Same consent rule as main — a `true` from older wording doesn't
    // count until the user answers the new prompt.
    if (!isOptedIn(settings)) return;
    Sentry.init({
      // The DSN comes from the main process — the renderer doesn't
      // know it. @sentry/electron's renderer SDK fetches the config
      // from main via its own internal IPC bridge.
      // No explicit `dsn:` needed.
    });
  } catch (err) {
    // Don't let a Sentry init failure take down the renderer.
    // eslint-disable-next-line no-console
    console.warn('[sentry/renderer] init failed:', err);
  }
})();

// Catch unhandled errors/rejections so the renderer doesn't crash
// silently during external file edits or other async work.
window.addEventListener('error', (e) => {
  console.error('[renderer] uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[renderer] unhandled rejection:', e.reason);
});

// A file dropped where nothing takes it would navigate the whole window to
// it (Electron's default). Targets that take a drop prevent the default
// first, so only the leftovers land here. see docs/plans/image-drop-plan.md
const refuseStrayDrop = (e: DragEvent): void => {
  if (e.defaultPrevented) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
};
window.addEventListener('dragover', refuseStrayDrop);
window.addEventListener('drop', refuseStrayDrop);

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');
createRoot(container).render(
  <React.StrictMode>
    <TitleBar />
    <App />
    <UpdateBanner />
  </React.StrictMode>
);

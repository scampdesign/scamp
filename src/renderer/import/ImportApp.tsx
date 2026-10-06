import { useCallback, useEffect, useRef, useState } from 'react';

import { captureFn, capturePolicy, prepareFn } from '@shared/captureScript';
import {
  flattenRoutes,
  readRoutesFn,
  routeForPath,
  selectedByDefault,
  viewNameForRoute,
  type RawRoute,
} from '@shared/reactRoutes';
import type { Breakpoint, ImportFidelity, ImportResultPayload } from '@shared/types';

import { BatchSummary } from './BatchSummary';
import { RoutePanel, type ParamValues, type RoutesState } from './RoutePanel';
import { useImportBatch } from './useImportBatch';
import styles from './ImportApp.module.css';

/**
 * The import window: a URL bar, a page, and an Import button.
 *
 * The capture runs here rather than in main, because `executeJavaScript`
 * on the `<webview>` tag is what reaches the live document — and the
 * live document, after cascade and scripts, is the thing worth reading.
 * What comes back is handed straight to main; this window never sees a
 * project, a file, or the element model.
 * see docs/plans/website-import-plan.md
 */

/**
 * How each fidelity level reads in the report.
 *
 * `~` for a fallback is deliberately not `!`: nothing is missing, so an
 * alarm would be wrong — but it is not free either, and `·` would hide
 * it among the bookkeeping. see docs/agent-native-review.md
 */
const FIDELITY_MARK: Record<ImportFidelity, string> = {
  lost: '!',
  'rendered-fallback': '~',
  approximated: '≈',
  exact: '·',
};

const FIDELITY_TITLE: Record<ImportFidelity, string> = {
  lost: 'Did not come across',
  'rendered-fallback': 'Renders, but you cannot edit it the way you could on the page',
  approximated: 'Close, but not identical',
  exact: 'Changed shape, changed nothing you can see',
};

const REPORT_CLASS: Record<
  ImportFidelity,
  (s: Record<string, string>) => string | undefined
> = {
  lost: (s) => s['reportLost'],
  'rendered-fallback': (s) => s['reportFallback'],
  approximated: (s) => s['reportFallback'],
  exact: (s) => s['reportKept'],
};

type Status =
  | { kind: 'idle' }
  | { kind: 'capturing'; at?: string }
  | { kind: 'done'; result: ImportResultPayload }
  | { kind: 'failed'; message: string };

/** `https://` in front of a bare host, so typing `stripe.com` works. */
/** How long after choosing a route a change of address counts as its redirect. */
const REDIRECT_WINDOW_MS = 4000;

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

const normalizeUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const ImportApp = (): JSX.Element => {
  const webviewRef = useRef<HTMLElement | null>(null);
  const [projectPath, setProjectPath] = useState<string>('');
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [draftUrl, setDraftUrl] = useState('');
  const [loadedUrl, setLoadedUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  /**
   * The `<webview>` tag's methods — `executeJavaScript` among them —
   * only exist once it has emitted `dom-ready`. Before that the element
   * is in the DOM and the calls are not there, which reads exactly like
   * a button that does nothing.
   */
  const [webviewReady, setWebviewReady] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  /** "Clean up with AI", once the user picks a token mode. */
  const [cleanup, setCleanup] = useState<
    { kind: 'idle' } | { kind: 'started' } | { kind: 'failed'; message: string }
  >({ kind: 'idle' });
  /** Importing a React app: its name, its routes, and where they led. */
  const [react, setReact] = useState<{ appName: string } | null>(null);
  const [routes, setRoutes] = useState<RoutesState>({ kind: 'reading' });
  const [currentPath, setCurrentPath] = useState('');
  const requested = useRef<{ path: string; at: number } | null>(null);
  const [redirect, setRedirect] = useState<{ from: string; to: string } | null>(null);
  const [paramValues, setParamValues] = useState<ParamValues>({});
  const [selectedRoutes, setSelectedRoutes] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const offOpen = window.scampImport.onOpen((args) => {
      setProjectPath(args.projectPath);
      setBreakpoints(args.breakpoints ?? []);
      setReact(args.react ?? null);
      if (args.url) {
        setDraftUrl(args.url);
        setLoadedUrl(normalizeUrl(args.url));
      }
    });
    const offResult = window.scampImport.onResult((result) => {
      setStatus({ kind: 'done', result });
      // Opened by default when anything did not come across whole — a
      // loss OR a fallback that renders but cannot be edited. The second
      // is the one a screenshot will never tell you about.
      setReportOpen(
        (result.findings ?? []).some(
          (f) => f.fidelity === 'lost' || f.fidelity === 'rendered-fallback'
        )
      );
    });
    return () => {
      offOpen();
      offResult();
    };
  }, []);

  // Keep the URL bar and the history buttons in step with the page.
  useEffect(() => {
    const node = webviewRef.current;
    if (!node) return;
    const wv = node as unknown as {
      canGoBack: () => boolean;
      canGoForward: () => boolean;
    };
    const refresh = (): void => {
      try {
        setCanGoBack(wv.canGoBack());
        setCanGoForward(wv.canGoForward());
      } catch {
        // Not attached yet; the next event will do it.
      }
    };
    const onNavigate = (e: Event): void => {
      const url = (e as Event & { url?: string }).url;
      if (typeof url === 'string') {
        setDraftUrl(url);
        const landed = pathOf(url);
        setCurrentPath(landed);
        // A route that sends the page elsewhere straight away is a redirect
        // (a sign-in, a setup gate); a later move is the user navigating.
        const asked = requested.current;
        if (asked !== null && Date.now() - asked.at < REDIRECT_WINDOW_MS) {
          setRedirect(landed === asked.path ? null : { from: asked.path, to: landed });
        } else {
          setRedirect(null);
          requested.current = null;
        }
      }
      // A new page invalidates the last import's verdict.
      setStatus((s) => (s.kind === 'idle' ? s : { kind: 'idle' }));
      refresh();
    };
    const onDomReady = (): void => {
      setWebviewReady(true);
      // A page that loaded after the reader gave up gets another look.
      setRoutes((r) => (r.kind === 'none' ? { kind: 'reading' } : r));
    };
    node.addEventListener('dom-ready', onDomReady);
    node.addEventListener('did-navigate', onNavigate);
    node.addEventListener('did-navigate-in-page', onNavigate);
    node.addEventListener('did-finish-load', refresh);
    return () => {
      node.removeEventListener('dom-ready', onDomReady);
      node.removeEventListener('did-navigate', onNavigate);
      node.removeEventListener('did-navigate-in-page', onNavigate);
      node.removeEventListener('did-finish-load', refresh);
    };
  }, [loadedUrl]);

  // A React app's routes, read from its running router once the page is
  // up. A dev server's first load can take many seconds (Vite optimises
  // dependencies), and the router exists only once React has mounted, so
  // keep trying for a while before saying there is none.
  useEffect(() => {
    if (react === null || !webviewReady || routes.kind !== 'reading') return;
    const node = webviewRef.current as unknown as { executeJavaScript?: (code: string) => Promise<unknown> } | null;
    if (!node?.executeJavaScript) return;
    let cancelled = false;
    void (async (): Promise<void> => {
      for (let attempt = 0; attempt < 25 && !cancelled; attempt += 1) {
        try {
          const raw = (await node.executeJavaScript!(`(${readRoutesFn.toString()})()`)) as RawRoute[] | null;
          if (Array.isArray(raw) && raw.length > 0) {
            if (!cancelled) {
              const flat = flattenRoutes(raw);
              setRoutes({ kind: 'ready', routes: flat });
              setSelectedRoutes(new Set(flat.filter(selectedByDefault).map((r) => r.path)));
            }
            return;
          }
        } catch {
          // The page navigated mid-read; try again.
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!cancelled) setRoutes({ kind: 'none' });
    })();
    return () => {
      cancelled = true;
    };
  }, [react, webviewReady, routes.kind]);

  const handleVisit = useCallback(
    (path: string): void => {
      const node = webviewRef.current as unknown as { loadURL?: (u: string) => void } | null;
      if (!node?.loadURL || loadedUrl.length === 0) return;
      const target = new URL(path, loadedUrl).href;
      requested.current = { path: pathOf(target), at: Date.now() };
      setRedirect(null);
      node.loadURL(target);
    },
    [loadedUrl]
  );

  const handleGo = useCallback((): void => {
    const next = normalizeUrl(draftUrl);
    if (next.length === 0) return;
    setWebviewReady(false);
    requested.current = null;
    setRedirect(null);
    setLoadedUrl(next);
    const node = webviewRef.current as unknown as { loadURL?: (u: string) => void } | null;
    // Already mounted: navigate it. First load: the `src` does it.
    if (node?.loadURL) node.loadURL(next);
  }, [draftUrl]);

  /**
   * Read the page at the widest breakpoint, then at each narrower one.
   * Shared by Import and by a multi-page run. Restores the webview's
   * width whatever happens.
   */
  const readAllWidths = useCallback(
    async (
      onWidth?: (label: string) => void
    ): Promise<{ payload: unknown; narrower: Array<{ breakpointId: string; payload: unknown }> }> => {
      const node = webviewRef.current as unknown as {
        executeJavaScript?: (code: string) => Promise<unknown>;
      } | null;
      if (!node?.executeJavaScript) {
        throw new Error('The page is not ready to read yet — wait for it to finish loading.');
      }
      const frame = webviewRef.current as HTMLElement | null;
      const restoreWidth = frame?.style.width ?? '';
      const restoreFlex = frame?.style.flex ?? '';
      // The capture function is serialized and evaluated in the page,
      // with the policy passed in as data — it cannot import anything
      // once it is over there. The scroll settles reveal-on-scroll
      // content, which is otherwise recorded invisible.
      // Called through `node`, not hoisted: `executeJavaScript` is a
      // method on the webview element and loses its receiver if you
      // detach it, which hangs rather than throwing.
      const run = (code: string): Promise<unknown> => node.executeJavaScript!(code);
      const readPage = async (): Promise<unknown> => {
        await run(`(${prepareFn.toString()})()`);
        return run(`(${captureFn.toString()})(${JSON.stringify(capturePolicy())})`);
      };
      // `flex: none` as well as the width: the webview is a flex item
      // with `flex: 1 1 auto`, so grow wins over any width set on it and
      // the guest never actually narrows. A `<webview>`'s guest viewport
      // follows the element's size, so sizing it is what makes the page's
      // own media queries fire.
      const sizeTo = async (width: number): Promise<void> => {
        if (!frame) return;
        frame.style.flex = '0 0 auto';
        frame.style.width = `${width}px`;
        // Let layout settle and the page's own resize handlers run.
        await new Promise((r) => setTimeout(r, 450));
      };
      try {
        // Read the page at the project's widest breakpoint, the width its
        // desktop design is for — not whatever width the window happens to be.
        const [widest, ...smaller] = [...breakpoints].sort((a, b) => b.width - a.width);
        if (widest !== undefined) await sizeTo(widest.width);
        const payload = await readPage();
        const narrower: Array<{ breakpointId: string; payload: unknown }> = [];
        for (const bp of smaller) {
          if (!frame) break;
          onWidth?.(bp.label);
          await sizeTo(bp.width);
          try {
            narrower.push({ breakpointId: bp.id, payload: await readPage() });
          } catch {
            // A width that fails is one breakpoint's worth of overrides,
            // not a failed import.
          }
        }
        return { payload, narrower };
      } finally {
        if (frame) {
          frame.style.width = restoreWidth;
          frame.style.flex = restoreFlex;
        }
      }
    },
    [breakpoints]
  );

  const handleImport = useCallback(async (): Promise<void> => {
    if (projectPath.length === 0) return;
    setStatus({ kind: 'capturing' });
    try {
      const { payload, narrower } = await readAllWidths((label) => setStatus({ kind: 'capturing', at: label }));
      setStatus({ kind: 'capturing' });
      // A React route names its view; a page's title would name every
      // route of a single-page app the same.
      const route = react !== null && routes.kind === 'ready' ? routeForPath(routes.routes, currentPath) : null;
      const nameHint = react === null ? undefined : viewNameForRoute(route?.path ?? currentPath);
      const sent = await window.scampImport.deliver(projectPath, payload, narrower, nameHint);
      if (!sent.ok) {
        setStatus({ kind: 'failed', message: sent.error ?? 'Scamp could not take the page.' });
      }
      // On success the app window answers over `onResult`.
    } catch (err) {
      setStatus({
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [projectPath, readAllWidths, react, routes, currentPath]);

  const importBatch = useImportBatch({ webviewRef, projectPath, baseUrl: loadedUrl, readAllWidths });
  const batchRunning = importBatch.batch?.running === true;

  const handleToggleRoute = useCallback((route: string): void => {
    setSelectedRoutes((current) => {
      const next = new Set(current);
      if (next.has(route)) next.delete(route);
      else next.add(route);
      return next;
    });
  }, []);

  const nav = (method: 'goBack' | 'goForward' | 'reload') => (): void => {
    const node = webviewRef.current as unknown as Record<string, (() => void) | undefined> | null;
    node?.[method]?.();
  };

  const busy = status.kind === 'capturing' || batchRunning;


  // A new import gets its own offer.
  useEffect(() => {
    setCleanup({ kind: 'idle' });
  }, [status]);

  const handleCleanup = async (viewName: string, tokenMode: 'create-tokens' | 'keep-literal'): Promise<void> => {
    const result = await window.scampImport.startCleanup(projectPath, viewName, tokenMode);
    setCleanup(result.ok ? { kind: 'started' } : { kind: 'failed', message: result.error ?? 'Couldn’t start the cleanup.' });
  };

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <button className={styles.navBtn} onClick={nav('goBack')} disabled={!canGoBack} title="Back">‹</button>
        <button className={styles.navBtn} onClick={nav('goForward')} disabled={!canGoForward} title="Forward">›</button>
        <button className={styles.navBtn} onClick={nav('reload')} disabled={!loadedUrl} title="Reload">⟳</button>
        <input
          className={styles.urlBar}
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGo();
          }}
          placeholder="Paste a URL, then navigate to the page you want"
          spellCheck={false}
          aria-label="Address"
        />
        <button
          className={styles.importBtn}
          onClick={() => void handleImport()}
          disabled={!loadedUrl || !webviewReady || busy || projectPath.length === 0}
        >
          {busy
            ? status.kind === 'capturing' && status.at
              ? `Reading at ${status.at}…`
              : 'Reading the page…'
            : 'Import'}
        </button>
      </div>

      {importBatch.batch !== null && (
        <BatchSummary
          batch={importBatch.batch}
          onStop={importBatch.stop}
          onUndo={() => void importBatch.undo()}
          onDismiss={importBatch.dismiss}
        />
      )}

      {importBatch.batch === null && status.kind !== 'idle' && status.kind !== 'capturing' && (
        <div
          className={`${styles.banner} ${
            status.kind === 'failed' || !status.result?.ok ? styles.bannerBad : styles.bannerGood
          }`}
        >
          {status.kind === 'failed' ? (
            <span>{status.message}</span>
          ) : status.result.ok ? (
            <>
              <div className={styles.bannerHead}>
                <span>
                  Imported <strong>{status.result.viewName}</strong> —{' '}
                  {status.result.elementCount} elements
                </span>
                {(status.result.findings?.length ?? 0) > 0 && (
                  <button
                    className={styles.reportToggle}
                    onClick={() => setReportOpen((v) => !v)}
                    type="button"
                  >
                    {reportOpen ? 'Hide' : 'What changed'} ({status.result.findings?.length})
                  </button>
                )}
              </div>
              {status.result.cleanupAvailable === true && status.result.viewName !== undefined && (
                <div className={styles.cleanup} data-testid="import-cleanup">
                  {cleanup.kind === 'started' ? (
                    <span>Cleanup started. Continue in the Scamp window, where the agent shows its plan.</span>
                  ) : (
                    <>
                      <span className={styles.cleanupText}>
                        <strong>Clean up with AI.</strong> The Scamp Agent makes this page easier to edit
                        without changing how it looks, and shows you a plan first. For repeated colors and
                        sizes:
                      </span>
                      <span className={styles.cleanupActions}>
                        <button
                          type="button"
                          className={styles.cleanupBtn}
                          onClick={() => void handleCleanup(status.result.viewName ?? '', 'create-tokens')}
                        >
                          Create theme tokens
                        </button>
                        <button
                          type="button"
                          className={styles.cleanupBtn}
                          onClick={() => void handleCleanup(status.result.viewName ?? '', 'keep-literal')}
                        >
                          Keep hex values
                        </button>
                      </span>
                      {cleanup.kind === 'failed' && <span className={styles.cleanupError}>{cleanup.message}</span>}
                    </>
                  )}
                </div>
              )}
              {reportOpen && (
                // An import is a lossy translation, and it is lossy in
                // more than one way. Worst first, each marked with how
                // faithfully it survived.
                <ul className={styles.report}>
                  {status.result.findings?.map((f) => (
                    <li key={f.kind} className={REPORT_CLASS[f.fidelity](styles)}>
                      <span className={styles.reportMark} title={FIDELITY_TITLE[f.fidelity]}>
                        {FIDELITY_MARK[f.fidelity]}
                      </span>
                      <span>
                        {f.label}
                        {f.examples.length > 0 && (
                          <span className={styles.reportWhere}> — {f.examples.join(', ')}</span>
                        )}
                        {f.editable !== undefined && (
                          <span className={styles.reportEditable}>{f.editable}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <span>{status.result.error ?? 'The import failed.'}</span>
          )}
        </div>
      )}

      <div className={styles.viewport}>
        {react !== null && (
          <RoutePanel
            state={routes}
            current={routes.kind === 'ready' ? routeForPath(routes.routes, currentPath) : null}
            redirect={redirect}
            disabled={busy || !webviewReady}
            values={paramValues}
            onValues={setParamValues}
            selected={selectedRoutes}
            onToggle={handleToggleRoute}
            onVisit={handleVisit}
            onImportSelected={(targets) => {
              setStatus({ kind: 'idle' });
              void importBatch.start(targets);
            }}
          />
        )}
        {loadedUrl ? (
          <webview
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={webviewRef as any}
            src={loadedUrl}
            className={styles.webview}
            // One session per React app, kept between imports, so a sign-in
            // or a finished setup carries from route to route.
            {...(react !== null ? { partition: `persist:react-import-${react.appName.replace(/[^A-Za-z0-9_-]/g, '_')}` } : {})}
          />
        ) : (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Import a page</p>
            <p className={styles.emptyBody}>
              Paste a URL above and navigate to the page you want. Clicking
              <strong> Import</strong> reads the page as it is on screen and
              makes a new view from it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

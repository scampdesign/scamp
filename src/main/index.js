import { app, BrowserWindow, ipcMain, Menu, nativeTheme, net, protocol, session, shell } from 'electron';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { TITLE_BAR_COLORS, TITLE_BAR_HEIGHT, } from '@shared/titleBarColors';
import { registerProjectIpc } from './ipc/project';
import { registerFileIpc, settleFileWrites } from './ipc/file';
import { registerPageIpc } from './ipc/page';
import { registerComponentIpc } from './ipc/component';
import { registerProjectThumbnailIpc } from './ipc/projectThumbnail';
import { registerContextIpc } from './ipc/context';
import { registerSnapshotIpc } from './ipc/snapshot';
import { createSnapshot } from './ipc/snapshotOps';
import { getProjectFormat } from './ipc/projectFormatCache';
import { registerRecentProjectsIpc } from './ipc/recentProjects';
import { registerSettingsIpc, readSettingsSync, persistInstallId, } from './ipc/settings';
import { registerProjectConfigIpc } from './ipc/projectConfig';
import { registerTerminalIpc, disposeAllTerminals } from './ipc/terminal';
import { registerThemeIpc } from './ipc/theme';
import { registerDesignMdIpc } from './ipc/designMd';
import { registerImageIpc } from './ipc/image';
import { registerClipboardIpc } from './ipc/clipboard';
import { registerExportIpc } from './ipc/export';
import { cancelAgentTurns, registerAgentIpc } from './ipc/agent';
import { disposeAuth, registerAuthIpc } from './ipc/auth';
import { registerHtmlExportIpc } from './ipc/htmlExport';
import { registerUpdaterIpc } from './ipc/updater';
import { initAutoUpdater } from './updater';
import { registerPreviewIpc } from './ipc/preview';
import { registerImportIpc } from './importWindow';
import { registerReactImportIpc } from './ipc/reactImport';
import { stopAllReactApps } from './reactImport/appServer';
import { registerRoutesIpc } from './ipc/routes';
import { registerFrameworkIpc } from './ipc/framework';
import { closeAllPreviewWindows, closePreviewWindow, openPreviewWindow, updatePreviewWindow, } from './previewWindow';
import { setDevServerLogSink, stopAllDevServers } from './devServer/devServerManager';
import { initWatcher, disposeWatcher, getWatchedPath } from './watcher';
import { initMcp, stopMcp } from './mcp/lifecycle';
import { disposeImportSources } from './importSourceStore';
import { allowProjectOpen, resolveInsideProject } from './ipc/pathContainment';
import { initSentryIfOptedIn, setSentryEnabled, setSentryProjectRoot, } from './sentry';
import { installIdForConsent } from './installId';
import { isOptedIn } from './ipc/settingsOps';
import { buildApplicationMenu } from './menu';
import { fixPathFromLoginShell } from './fixPath';
import { resolveOzonePlatform } from './ozone';
// Chromium picks its ozone backend before this script runs, so
// `commandLine.appendSwitch` is too late — the flag has to be on the
// real process command line. Relaunch once with it appended. The
// relaunched process sees the flag in its own argv, so
// `resolveOzonePlatform` returns null there and it never loops.
//
// Packaged only: under `npm run dev` electron-vite exits when this
// process does, taking the Vite server with it, and Playwright
// attaches to the process it spawned. Both pass the flag at launch
// instead. see docs/notes/linux-wayland-ozone.md
const ozonePlatform = resolveOzonePlatform({
    platform: process.platform,
    argv: process.argv,
    override: process.env['SCAMP_OZONE_PLATFORM'],
});
if (ozonePlatform !== null && app.isPackaged) {
    app.relaunch({
        args: process.argv.slice(1).concat([`--ozone-platform=${ozonePlatform}`]),
    });
    app.exit(0);
}
const TEST_BOOTSTRAP = {
    e2e: process.env['SCAMP_E2E'] === '1',
    autoOpenProjectPath: process.env['SCAMP_E2E'] === '1'
        ? process.env['SCAMP_E2E_OPEN_PROJECT'] ?? null
        : null,
};
// Initialise Sentry at module load — BEFORE the `app.whenReady`
// promise can resolve. The SDK hooks into Electron's protocol /
// IPC layers, which Electron locks down once it fires its
// internal 'ready' event, so calling `Sentry.init` from inside
// `whenReady().then(...)` throws "Sentry SDK should be initialized
// before the Electron app 'ready' event is fired".
//
// `app.getPath('userData')` is one of the few Electron APIs that's
// available pre-ready, so the sync settings read here is safe. A
// fresh install reads `sentryOptIn: null` and the SDK init no-ops
// until the renderer's first-launch prompt writes a real choice
// — at which point the renderer fires the `app:reinitSentry` IPC
// (registered later inside `whenReady`) and the SDK comes up live.
const initialSettings = readSettingsSync();
// `isOptedIn` also checks the consent version — a `true` recorded against
// older wording doesn't count until the user answers the new prompt.
const initialOptIn = isOptedIn(initialSettings);
const initialInstall = installIdForConsent(initialSettings, initialOptIn);
initSentryIfOptedIn(initialOptIn, initialInstall?.installId ?? null);
// Persist a newly-minted id. Fire-and-forget: `app.getPath('userData')` is
// available pre-ready, and failing to save only means a new id next launch.
if (initialInstall?.created === true) {
    void persistInstallId(initialInstall.installId).catch(() => undefined);
}
// GUI-launched packaged apps inherit a minimal PATH that omits
// Homebrew/nvm/etc, so spawning npm/node throws ENOENT. Resolve the
// login shell's real PATH once, before any child_process spawn.
// See docs/notes/packaged-path.md.
if (app.isPackaged)
    fixPathFromLoginShell();
const registerTestIpc = () => {
    if (TEST_BOOTSTRAP.autoOpenProjectPath !== null)
        allowProjectOpen(TEST_BOOTSTRAP.autoOpenProjectPath);
    ipcMain.handle(IPC.TestGetBootstrap, () => TEST_BOOTSTRAP);
};
// Prevent unhandled rejections from silently killing the main process.
// chokidar callbacks, IPC handlers, and file I/O all run async — a
// rejected promise with no .catch() would otherwise crash with no trace.
process.on('uncaughtException', (err) => {
    console.error('[main] uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandled rejection:', reason);
});
/**
 * Path to the app icon. In dev `__dirname` points at the repo's
 * `out/main/` so we walk up to `src/renderer/src/assets/`. In a
 * packaged build the icon is bundled into the app's resources dir via
 * `extraResources` in `electron-builder.yml`.
 */
const iconPath = () => app.isPackaged
    ? join(process.resourcesPath, 'scamp-icon.png')
    : join(__dirname, '../../src/renderer/src/assets/scamp-icon.png');
const createWindow = () => {
    // Start the title bar in the persisted theme so the window-control
    // buttons and background don't flash the wrong palette before the
    // renderer mounts. The renderer re-asserts on load and on toggle.
    const theme = readSettingsSync().theme;
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        autoHideMenuBar: true,
        icon: iconPath(),
        backgroundColor: theme === 'light' ? '#f5f5f5' : '#1a1a1a',
        // Hide the OS title bar and draw our own themed strip in the renderer
        // (so it can use the app font). On Windows/Linux the native min/max/
        // close buttons stay as a themed overlay; on macOS the traffic lights
        // show inset over our bar. See docs/notes/title-bar.md.
        titleBarStyle: 'hidden',
        // Overlay is 1px shorter than the HTML bar so the bar's bottom border
        // shows continuously beneath the window controls. See docs/notes/title-bar.md.
        titleBarOverlay: {
            ...TITLE_BAR_COLORS[theme],
            height: TITLE_BAR_HEIGHT - 1,
        },
        trafficLightPosition: { x: 12, y: 10 },
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            // OS-level renderer isolation, on top of contextIsolation +
            // nodeIntegration:false. The main preload is a pure
            // contextBridge/ipcRenderer bridge AND is built as a single
            // self-contained CJS file (no `require("./chunks/…")`) — a
            // sandboxed preload can only require `electron`, so the inline of
            // `@shared/ipcChannels` in electron.vite.config.ts
            // (inlinePreloadSharedConstants) is what makes this safe.
            // See docs/notes/sandbox-tradeoffs.md.
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.on('ready-to-show', () => {
        win.show();
    });
    // Detect renderer process crashes so they aren't completely silent.
    win.webContents.on('render-process-gone', (_e, details) => {
        console.error('[main] renderer crashed:', details.reason, details.exitCode);
    });
    win.on('unresponsive', () => {
        console.error('[main] renderer became unresponsive');
    });
    // Renderer reloads (Ctrl+R, devtools reload, HMR full reload) tear down
    // every React component without giving them a chance to run their effect
    // cleanups. The pty Map in src/main/ipc/terminal.ts lives in the main
    // process, so any ptys spawned by the previous renderer survive — they
    // pile up until createTerminal hits MAX_TERMINALS and the next attempt
    // fails. Killing them on `did-start-navigation` ties pty lifetime to
    // the renderer that owns them.
    win.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
        if (!isMainFrame || isInPlace)
            return;
        // Fire-and-forget — we don't need to block navigation on the OS
        // actually reaping the old pty processes. The map is cleared
        // synchronously inside disposeAllTerminals, so the new renderer
        // sees an empty slot and can immediately spawn fresh ptys.
        void disposeAllTerminals();
    });
    win.webContents.setWindowOpenHandler((details) => {
        // Web, mail and phone links only: the OS would also launch `file:` or `smb:` targets.
        if (/^(https?|mailto|tel):/i.test(details.url)) {
            void shell.openExternal(details.url);
        }
        return { action: 'deny' };
    });
    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    }
    else {
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }
    initWatcher(win);
    // Request and error lines from `scamp dev --json` land in the app log.
    setDevServerLogSink((payload) => {
        if (!win.isDestroyed())
            win.webContents.send(IPC.DevServerLog, payload);
    });
    // MCP reply listener. The server itself starts when a project opens
    // (see ipc/project.ts). docs/archive/2026-08-06-mcp-server-plan.md
    initMcp(win);
    // Background auto-update: checks GitHub Releases on launch and every
    // 4 hours, downloads silently, and notifies the renderer's update
    // banner when ready. No-op in dev. See docs/notes/auto-update.md.
    initAutoUpdater(win);
};
// Register a custom protocol that serves project asset files. The renderer
// uses `scamp-asset://<absolute-path>` URLs for `<img>` elements so they
// resolve correctly regardless of the dev-server or production origin.
protocol.registerSchemesAsPrivileged([
    // `corsEnabled` so the app's own renderer can `fetch()` an asset, not
    // just render one. The thumbnail capture inlines every image before
    // rasterising — it renders through a data: URL that can fetch
    // nothing — and without this the fetch threw and every background
    // image was missing from the card. The handler below decides WHICH
    // origins that applies to. see docs/notes/project-thumbnails.md
    {
        scheme: 'scamp-asset',
        privileges: { standard: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true },
    },
]);
/**
 * One Scamp at a time.
 *
 * A second launch focuses the existing window rather than starting
 * another copy. That is the behaviour we want on its own — two copies
 * editing the same project would fight over the same files — and it also
 * keeps sign-in coherent: the loopback listener binds a fixed port, so a
 * second copy could not receive a callback anyway.
 * see docs/archive/2026-08-28-electron-sign-in-plan.md
 */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
else {
    app.on('second-instance', () => {
        const [existing] = BrowserWindow.getAllWindows();
        if (!existing)
            return;
        if (existing.isMinimized())
            existing.restore();
        existing.focus();
    });
}
app.whenReady().then(() => {
    // Sentry init has already happened at module load — see the
    // pre-`whenReady` block above. Don't re-init here; the SDK
    // requires the very first call to be before 'ready' fires.
    nativeTheme.themeSource = 'dark';
    // Grant `local-fonts` so the renderer can call
    // `window.queryLocalFonts()` and enumerate the user's installed
    // fonts. Scamp loads its own local content — there's no
    // third-party origin to worry about.
    //
    // Electron's TS types predate the Chromium permission, so we widen
    // to string for the comparison.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
        if (permission === 'local-fonts')
            return cb(true);
        cb(false);
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
        if (permission === 'local-fonts')
            return true;
        return false;
    });
    protocol.handle('scamp-asset', async (request) => {
        // URL form: `scamp-asset://localhost/<encoded-absolute-path>`
        // Parse with URL to get a correctly decoded pathname.
        const parsed = new URL(request.url);
        const filePath = decodeURIComponent(parsed.pathname);
        // Assets live inside the open project (copyImage writes them there).
        // Contain the path to the active project root so a forged URL like
        // `scamp-asset://localhost/etc/passwd` can't exfiltrate arbitrary
        // files; serve a 404 instead.
        const projectRoot = getWatchedPath();
        if (projectRoot === null) {
            return new Response(null, { status: 404 });
        }
        let resolved;
        try {
            resolved = resolveInsideProject(filePath, projectRoot);
        }
        catch {
            return new Response(null, { status: 404 });
        }
        const response = await net.fetch(`file://${resolved}`);
        // CORS, and deliberately not `*`.
        //
        // This scheme is registered on the default session, which the
        // IMPORT window's `<webview>` shares — and that webview points at
        // whatever site the user is importing. A blanket allow would let
        // any page it loads read the open project's files by guessing
        // paths. The app's own windows send no Origin (`file://`) or the
        // dev server's; a third-party page sends its own and gets no
        // header, so its fetch fails exactly as it did before. Not `'null'`
        // either: a sandboxed frame in an imported page sends that, and the
        // app's own requests carry no Origin at all.
        const origin = request.headers.get('origin');
        const ours = origin === null ||
            origin.startsWith('file://') ||
            origin === process.env['ELECTRON_RENDERER_URL'];
        if (!ours)
            return response;
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', origin ?? '*');
        return new Response(response.body, { status: response.status, headers });
    });
    registerProjectIpc();
    registerFileIpc();
    registerPageIpc();
    registerComponentIpc();
    registerProjectThumbnailIpc();
    registerContextIpc();
    registerSnapshotIpc();
    registerRecentProjectsIpc();
    registerSettingsIpc();
    registerProjectConfigIpc();
    registerTerminalIpc();
    registerThemeIpc();
    registerDesignMdIpc();
    registerImageIpc();
    registerClipboardIpc();
    registerExportIpc();
    registerAuthIpc();
    registerAgentIpc();
    registerHtmlExportIpc();
    registerImportIpc();
    registerReactImportIpc();
    registerUpdaterIpc();
    registerPreviewIpc({
        open: openPreviewWindow,
        close: closePreviewWindow,
        update: updatePreviewWindow,
    });
    registerRoutesIpc();
    registerFrameworkIpc();
    registerTestIpc();
    // Sentry opt-in toggle — called from the renderer when the
    // Privacy switch (or the first-launch prompt) flips. The SDK
    // is already running from the module-load init; this just
    // toggles transmission, so no re-init is needed (and no
    // pre-ready check is hit).
    ipcMain.handle(IPC.AppReinitSentry, async (_e, optedIn) => {
        // The renderer has already written the new choice (and, on opt-out,
        // cleared the install id) via `updateSettings`, so re-read rather than
        // trusting an in-memory copy.
        const settings = readSettingsSync();
        const install = installIdForConsent(settings, optedIn);
        setSentryEnabled(optedIn, install?.installId ?? null);
        if (install?.created === true) {
            await persistInstallId(install.installId).catch(() => undefined);
        }
    });
    // Expose the app version to the renderer for diagnostic UI.
    // Reads from `package.json` via Electron at the main side; the
    // renderer can't read `app.getVersion()` directly through
    // contextIsolation.
    ipcMain.handle(IPC.AppGetVersion, () => app.getVersion());
    // Recolor the native window-controls overlay when the renderer flips
    // theme. macOS traffic lights are native and not recolorable — our
    // themed HTML bar behind them is enough there, so skip it.
    ipcMain.on(IPC.WindowSetTitleBarOverlay, (e, colors) => {
        if (process.platform === 'darwin')
            return;
        const w = BrowserWindow.fromWebContents(e.sender);
        w?.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT - 1 });
    });
    // Application menu — platform-standard entries (File / Edit /
    // View / Window) plus the Help → Report a bug submenu that
    // opens a pre-filled GitHub issue. Must register BEFORE the
    // first BrowserWindow so macOS picks up the app menu.
    Menu.setApplicationMenu(buildApplicationMenu());
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
/**
 * All shutdown work that must complete before the process actually
 * exits. Both `before-quit` and `window-all-closed` route through this.
 * Safe to call concurrently — disposeAllTerminals clears its map
 * synchronously and stopAllDevServers does the same.
 */
/**
 * Final `session_close` snapshot of the active project before shutdown,
 * read straight from disk. Best-effort + silent — never blocks the quit.
 * Runs before `disposeWatcher()` so `getWatchedPath()` still resolves.
 * Note: a canvas edit within the last debounce window may not have
 * flushed to disk yet; the renderer-driven onClose snapshot covers the
 * clean in-app project-close path (see ProjectShell).
 */
const snapshotOnShutdown = async () => {
    const root = getWatchedPath();
    if (!root)
        return;
    try {
        const format = await getProjectFormat(root);
        await createSnapshot(root, format, 'session_close');
    }
    catch {
        // never let snapshotting block shutdown
    }
};
const performShutdownCleanup = async () => {
    await cancelAgentTurns();
    await snapshotOnShutdown();
    disposeAuth();
    await stopMcp();
    await disposeImportSources();
    disposeWatcher();
    setSentryProjectRoot(null);
    closeAllPreviewWindows();
    stopAllReactApps();
    await Promise.all([disposeAllTerminals(), stopAllDevServers()]);
};
// Note: when `app.quit()` (or Cmd+Q) initiates shutdown, Electron goes
// straight to before-quit → will-quit → quit without closing windows
// first. That's why the cleanup lives here: it's the only hook that runs
// reliably during a programmatic quit (e.g. Playwright teardown calling
// `electronApp.close()`). It closes the windows itself, before cleanup.
let quitInitiated = false;
/**
 * Close every window and wait for them to go. Each renderer flushes its
 * debounced write on `beforeunload`; that write has to reach main while
 * the project is still open, or the containment check refuses it.
 */
const closeAllWindows = (timeoutMs) => Promise.race([
    Promise.all(BrowserWindow.getAllWindows().map((win) => new Promise((resolve) => {
        if (win.isDestroyed())
            return resolve();
        win.once('closed', () => resolve());
        win.close();
    }))).then(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
]);
app.on('before-quit', (event) => {
    if (quitInitiated)
        return;
    event.preventDefault();
    quitInitiated = true;
    void closeAllWindows(3000)
        .then(settleFileWrites)
        .then(performShutdownCleanup)
        .finally(() => app.quit());
});
app.on('window-all-closed', () => {
    // Closed by our own before-quit, which does the cleanup itself.
    if (quitInitiated)
        return;
    // Fires only when the user closes the last window directly (not via
    // app.quit()). On non-darwin we route through quit so the awaited
    // cleanup in before-quit runs. On darwin the app stays alive — kick
    // off cleanup anyway since there's no UI to reconnect orphaned ptys
    // and dev servers to.
    if (process.platform === 'darwin') {
        void performShutdownCleanup();
    }
    else {
        app.quit();
    }
});

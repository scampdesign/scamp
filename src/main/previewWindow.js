import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { getDevServerStatus, subscribeDevServer, } from './devServer/devServerManager';
import { createPopupGate } from './popupGate';
/**
 * One preview window per project (by absolute path). Reopen reuses
 * the existing window and just navigates it; close removes the entry
 * so the next open is a clean spawn.
 */
const previewWindows = new Map();
/**
 * Resolve the preview-window entry HTML for the current build mode.
 * In dev, electron-vite serves both renderer entries from the same
 * `ELECTRON_RENDERER_URL`; in production they sit beside each other
 * in `out/renderer/`. The project path is appended as a URL hash so
 * the renderer can bootstrap synchronously, before the first IPC
 * status event arrives.
 *
 * The preview HTML lives at `src/renderer/preview/index.html` —
 * inside the renderer's source root so electron-vite picks it up as
 * a second entry. Output lands at `out/renderer/preview/index.html`.
 */
const loadPreviewWindow = async (win, projectPath) => {
    const hash = `#${encodeURIComponent(projectPath)}`;
    if (process.env['ELECTRON_RENDERER_URL']) {
        await win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/preview/index.html${hash}`);
    }
    else {
        await win.loadFile(join(__dirname, '../renderer/preview/index.html'), { hash: encodeURIComponent(projectPath) });
    }
};
/**
 * Stream dev-server status updates to a preview window over IPC.
 * Pushes the current status after the window finishes loading so
 * the UI never starts blank, then forwards every subsequent change.
 * Returns the teardown function the caller stores on the window
 * for cleanup.
 *
 * `did-finish-load` is the only safe trigger for the initial push:
 * `webContents.send` calls before that are dropped silently. We
 * also handle the case where the renderer mounts after a status
 * change has already fired (the renderer pulls explicitly via
 * `getStatus` on mount as a belt-and-braces).
 */
const wireStatus = (win, projectPath) => {
    const send = (payload) => {
        if (win.isDestroyed())
            return;
        win.webContents.send(IPC.PreviewStatusChanged, payload);
    };
    const pushInitial = () => {
        send({ projectPath, status: getDevServerStatus(projectPath) });
    };
    // `loadURL` happens AFTER wireStatus runs, so isLoading() is false
    // here even though the window is about to load. Always wait for
    // `did-finish-load` rather than firing pushInitial synchronously.
    win.webContents.once('did-finish-load', pushInitial);
    return subscribeDevServer(projectPath, (status) => {
        send({ projectPath, status });
    });
};
/**
 * Open or reuse the preview window for a project. Returns the
 * BrowserWindow for the IPC layer to surface its `id` to callers.
 */
/**
 * Update the active page + page list on an EXISTING preview window
 * without creating one. Called by the parent renderer when the
 * project's page list changes (page added / renamed / deleted) so
 * the URL-bar dropdown stays accurate. No-op when no preview window
 * is open for the project — we don't want this to silently spawn
 * a new preview just because pages shifted.
 */
const navigatePayload = (args) => ({
    pageName: args.pageName,
    pageNames: args.pageNames,
    ...(args.routes !== undefined ? { routes: args.routes } : {}),
});
export const updatePreviewWindow = (args) => {
    const existing = previewWindows.get(args.projectPath);
    if (!existing || existing.isDestroyed())
        return;
    existing.webContents.send(IPC.PreviewNavigate, navigatePayload(args));
};
export const openPreviewWindow = async (args) => {
    const { projectPath } = args;
    const existing = previewWindows.get(projectPath);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        existing.webContents.send(IPC.PreviewNavigate, navigatePayload(args));
        return { id: existing.id };
    }
    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 480,
        minHeight: 360,
        title: 'Scamp — Preview',
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        webPreferences: {
            preload: join(__dirname, '../preload/preview.js'),
            contextIsolation: true,
            sandbox: false,
            nodeIntegration: false,
            // Required for the <webview> tag we mount in Phase 3 to host
            // the dev-server URL.
            webviewTag: true,
        },
        show: false,
    });
    previewWindows.set(projectPath, win);
    const teardown = wireStatus(win, projectPath);
    // Intercept popups originating in the embedded `<webview>` (the
    // hosted dev server) and route them to the system browser. Without
    // this, an `<a target="_blank">` or `window.open` from the user's
    // page would spawn a new Electron BrowserWindow inside the
    // preview, which isn't what the user wants — the preview is
    // scoped to the project.
    //
    // Same-origin popups (the project's own pages opening themselves
    // in a new tab — rare) are also denied to keep behaviour simple;
    // users navigate via the toolbar's URL handling.
    win.webContents.on('did-attach-webview', (_e, webContents) => {
        const gate = createPopupGate();
        webContents.on('input-event', (_event, input) => gate.noteInput(input.type));
        webContents.setWindowOpenHandler((details) => {
            if ((details.url.startsWith('http://') || details.url.startsWith('https://')) && gate.allow()) {
                void shell.openExternal(details.url);
            }
            return { action: 'deny' };
        });
    });
    win.on('closed', () => {
        teardown();
        previewWindows.delete(projectPath);
    });
    win.once('ready-to-show', () => {
        win.show();
        // Pass the initial pageName + full page list once the renderer
        // is up so it knows which route to navigate to when the server
        // reaches `ready` AND can populate the URL-bar page dropdown.
        win.webContents.send(IPC.PreviewNavigate, navigatePayload(args));
    });
    await loadPreviewWindow(win, projectPath);
    return { id: win.id };
};
/**
 * Close the preview window for a project (if any) — used when the
 * user closes the project itself. Doesn't touch the dev server;
 * `stopDevServer` is a separate call.
 */
export const closePreviewWindow = (projectPath) => {
    const win = previewWindows.get(projectPath);
    if (!win || win.isDestroyed())
        return;
    win.close();
};
/** Iterate every open preview window — used by the app-quit hook. */
export const closeAllPreviewWindows = () => {
    for (const win of previewWindows.values()) {
        if (!win.isDestroyed())
            win.close();
    }
};

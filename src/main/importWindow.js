import { BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { saveImportSource } from './importSourceStore';
/**
 * The import window: a browser you point at a page, and a button that
 * turns what is on screen into a view.
 *
 * Structurally the preview window's sibling — a `BrowserWindow` whose
 * renderer hosts a `<webview>` — and deliberately so, because the
 * preview already solved the parts that are fiddly: popup routing to
 * the system browser, a URL bar wired to navigation events, and a
 * preload small enough to be obviously safe.
 *
 * What it does NOT do is reduce the page. That happens in the app
 * window, which holds the canvas store, the project, and the pure
 * reducer. Main's job here is to carry a payload from one window to the
 * other and carry the verdict back.
 * see docs/plans/website-import-plan.md
 */
const importWindows = new Map();
/** The app window — the one that owns a project and can make a view. */
const appWindow = () => {
    const [first] = BrowserWindow.getAllWindows().filter((w) => !Array.from(importWindows.values()).includes(w));
    return first ?? null;
};
const loadShell = async (win, args) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
        await win.loadURL(`${devUrl}/import/index.html`);
        return;
    }
    await win.loadFile(join(__dirname, '../renderer/import/index.html'));
    void args;
};
export const openImportWindow = async (args) => {
    const { projectPath } = args;
    const existing = importWindows.get(projectPath);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        return { id: existing.id };
    }
    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 640,
        minHeight: 420,
        title: 'Scamp — Import',
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        webPreferences: {
            preload: join(__dirname, '../preload/import.js'),
            contextIsolation: true,
            sandbox: false,
            nodeIntegration: false,
            webviewTag: true,
        },
        show: false,
    });
    importWindows.set(projectPath, win);
    // A third-party page opening a popup must not spawn an Electron
    // window inside the importer. Same rule as the preview: hand it to
    // the system browser and deny the embedded one.
    win.webContents.on('did-attach-webview', (_e, webContents) => {
        webContents.setWindowOpenHandler((details) => {
            if (details.url.startsWith('http://') || details.url.startsWith('https://')) {
                void shell.openExternal(details.url);
            }
            return { action: 'deny' };
        });
    });
    win.on('closed', () => importWindows.delete(projectPath));
    win.once('ready-to-show', () => {
        win.show();
        win.webContents.send(IPC.ImportOpen, args);
    });
    await loadShell(win, args);
    return { id: win.id };
};
export const closeImportWindow = (projectPath) => {
    const win = importWindows.get(projectPath);
    if (win && !win.isDestroyed())
        win.close();
};
export const registerImportIpc = () => {
    ipcMain.handle(IPC.ImportOpen, async (_e, args) => openImportWindow(args));
    ipcMain.handle(IPC.ImportClose, (_e, args) => {
        closeImportWindow(args.projectPath);
    });
    // Import window → app window. The payload is passed through
    // untouched: main has no opinion about what a captured page means,
    // and the reducer that does lives where the project is.
    ipcMain.handle(IPC.ImportCaptured, (_e, args) => {
        const target = appWindow();
        if (!target) {
            return { ok: false, error: 'Scamp is not open on a project.' };
        }
        target.webContents.send(IPC.ImportDeliver, args);
        // Bring the canvas forward: the import lands there, and a user
        // still looking at the import window would think nothing happened.
        target.focus();
        return { ok: true };
    });
    // App window → main: the page exactly as it was, kept in a temp
    // directory the MCP can read and the project never sees.
    // see docs/notes/import-source-store.md
    ipcMain.handle(IPC.ImportSaveSource, async (_e, args) => {
        try {
            return { ok: true, stored: await saveImportSource(args.projectPath, args.view, args.url, args.source) };
        }
        catch (err) {
            // Keeping the original is a convenience. An import that
            // otherwise succeeded must not fail because temp is full.
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    // Import window → app window: start an AI cleanup of the view just
    // imported. The import window is the least-trusted renderer in the app
    // (it hosts a third-party page), so it can name a view and a mode and
    // nothing else; both are checked here before anything is forwarded.
    ipcMain.handle(IPC.ImportStartCleanup, (_e, args) => {
        const target = appWindow();
        if (!target)
            return { ok: false, error: 'Scamp is not open on a project.' };
        const valid = typeof args?.projectPath === 'string' &&
            typeof args.viewName === 'string' &&
            args.viewName.length > 0 &&
            args.viewName.length < 200 &&
            (args.tokenMode === 'create-tokens' || args.tokenMode === 'keep-literal');
        if (!valid)
            return { ok: false, error: 'That cleanup request was malformed.' };
        const forwarded = {
            projectPath: args.projectPath,
            viewName: args.viewName,
            tokenMode: args.tokenMode,
        };
        target.webContents.send(IPC.AgentStartCleanup, forwarded);
        target.focus();
        return { ok: true };
    });
    // App window → import window, so the importer can report the outcome
    // without knowing anything about projects.
    ipcMain.handle(IPC.ImportResultReport, (_e, payload) => {
        const win = importWindows.get(payload.projectPath);
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.ImportResultChanged, payload);
        }
    });
};

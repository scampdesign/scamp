import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import { extname, basename, dirname, join, relative, sep } from 'path';
import { IPC } from '@shared/ipcChannels';
import { createPendingWriteTracker, } from './pendingWrites';
import { getProjectFormat } from './ipc/projectFormatCache';
import { createSnapshot } from './ipc/snapshotOps';
let watcher = null;
let mainWindow = null;
let watchedPath = null;
const ACK_EXPIRY_MS = 400;
/**
 * Tracks paths the renderer has just written, pending a chokidar
 * stability event. On a matching event we emit `file:writeAck` so the
 * save-status indicator can transition, and (for page writes)
 * suppress the `file:changed` broadcast so the renderer doesn't
 * re-parse its own output.
 */
const pending = createPendingWriteTracker((payload) => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.webContents.send(IPC.FileWriteAck, payload);
}, ACK_EXPIRY_MS);
export const initWatcher = (win) => {
    mainWindow = win;
};
export const disposeWatcher = () => {
    if (watcher) {
        void watcher.close();
        watcher = null;
    }
    watchedPath = null;
};
export const watchProject = async (folderPath) => {
    if (watcher) {
        await watcher.close();
        watcher = null;
    }
    watchedPath = folderPath;
    watcher = chokidar.watch(folderPath, {
        // Ignore dotfiles and `node_modules` (Next.js projects acquire one
        // as soon as the user runs `npm install`; chokidar would thrash
        // walking it). Depth=3 covers the deepest path Scamp cares about:
        // `<projectRoot> → app → <page-folder> → page.tsx`.
        ignored: [/(^|[\/\\])\../, /(^|[\/\\])node_modules([\/\\]|$)/],
        persistent: true,
        ignoreInitial: true,
        // Don't traverse symlinks out of the project — a symlinked file or
        // dir inside the project shouldn't pull external paths into the watch
        // set (defense-in-depth alongside the path-containment guards).
        followSymlinks: false,
        depth: 3,
        awaitWriteFinish: {
            stabilityThreshold: 200,
            pollInterval: 50,
        },
    });
    const handleChange = (changedPath) => {
        void emitChange(changedPath);
        maybeNotifyRoutesChanged(changedPath);
    };
    // `add` and `unlink` may indicate a new / removed page. Run the
    // same `emitChange` logic (so the renderer's syncBridge sees a
    // `file:changed` event for the active page when it gets
    // recreated) AND broadcast a separate `project:pages-changed`
    // event so the page navigator refreshes its list.
    //
    // We don't try to distinguish in-app writes from external ones —
    // the renderer re-reads the project on this event and compares
    // page-name sets, so a no-op refresh is harmless. The pending
    // write tracker still suppresses `file:changed` for the
    // renderer's own page saves.
    const handleAddOrUnlink = (changedPath) => {
        void emitChange(changedPath);
        maybeNotifyPagesChanged(changedPath);
        maybeNotifyRoutesChanged(changedPath);
    };
    watcher.on('add', handleAddOrUnlink);
    watcher.on('unlink', handleAddOrUnlink);
    watcher.on('change', handleChange);
};
/**
 * Page files always end in `.tsx` or `.module.css`. Filter here
 * so the renderer isn't woken up for unrelated file system noise
 * (config edits, log files, etc.).
 */
/**
 * Anything under routes/ — a page route, an API handler, any extension —
 * re-lists the Routes section. The file itself is never read here; the
 * renderer asks main for the list. see docs/notes/routes-in-the-app.md
 */
const maybeNotifyRoutesChanged = (changedPath) => {
    if (!mainWindow || mainWindow.isDestroyed() || !watchedPath)
        return;
    const rel = relative(watchedPath, changedPath);
    if (rel !== 'routes' && !rel.startsWith(`routes${sep}`))
        return;
    mainWindow.webContents.send(IPC.RoutesChanged);
};
const maybeNotifyPagesChanged = (changedPath) => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    const isTsx = extname(changedPath) === '.tsx';
    const isCss = changedPath.endsWith('.module.css');
    if (!isTsx && !isCss)
        return;
    mainWindow.webContents.send(IPC.ProjectPagesChanged);
};
export const registerPendingWrite = (path, writeId, suppressChanged) => {
    pending.register(path, writeId, suppressChanged);
};
/**
 * Cancel a previously registered pending write — used when the write
 * itself failed, so no ack ever gets emitted (the renderer will
 * transition to `error` via the IPC rejection path instead).
 */
export const cancelPendingWrite = (path) => {
    pending.cancel(path);
};
/**
 * Legacy suppression entry-point for flows that have no save-status
 * indicator to acknowledge (e.g. page rename). Registers a pending
 * write with a throwaway id — the renderer isn't listening for it.
 */
export const suppressNextChange = (path) => {
    pending.register(path, `suppress-${Date.now()}`, true);
};
const emitChange = async (changedPath) => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    // Consume any pending-write entry first. The tracker emits the ack
    // regardless; we only need to decide whether to forward the
    // `file:changed` broadcast too.
    const consumed = pending.consume(changedPath);
    if (consumed?.suppressChanged)
        return;
    // theme.css changes get their own event so the renderer can reload
    // design tokens without a full page re-parse.
    if (basename(changedPath) === 'theme.css') {
        const content = await readIfExists(changedPath);
        if (content !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.ThemeChanged, content);
        }
        return;
    }
    // DESIGN.md changes (Scamp's own regen OR an external/agent edit) get
    // their own event so the renderer can read authored prose back into the
    // Design System forms. The renderer ignores echoes of its own writes.
    if (basename(changedPath) === 'DESIGN.md') {
        const content = await readIfExists(changedPath);
        if (content !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.DesignMdChanged, content);
        }
        return;
    }
    const ext = extname(changedPath);
    // An imported SVG's asset file changed externally. Only forward genuine
    // external edits (`consumed === null` — Scamp's own copyImage write
    // registers a suppression), and let the renderer decide whether any
    // inline SVG element references it. see docs/archive/2026-07-14-svg-color-editing-plan.md
    if (ext.toLowerCase() === '.svg') {
        if (consumed !== null)
            return; // Scamp's own asset write — ignore.
        const content = await readIfExists(changedPath);
        if (content !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.SvgAssetChanged, {
                fileName: basename(changedPath),
                content,
            });
        }
        return;
    }
    const isTsx = ext === '.tsx';
    const isCss = changedPath.endsWith('.module.css');
    if (!isTsx && !isCss)
        return;
    // Genuinely external edit — no pending-write entry means Scamp didn't
    // write this (handleWrite / handlePatch always register one). Capture
    // an `agent_edit` snapshot as a restore point before the renderer
    // reloads the canvas. Fire-and-forget + silent so it never delays the
    // file:changed broadcast; snapshotOps' 5-second collapse coalesces an
    // agent's rapid multi-file burst into one snapshot.
    if (consumed === null) {
        void snapshotExternalEdit(changedPath);
    }
    // Resolve sibling file so the renderer always receives both halves of a page.
    const dir = dirname(changedPath);
    const base = basename(changedPath).replace(/\.tsx$|\.module\.css$/, '');
    const tsxPath = join(dir, `${base}.tsx`);
    const cssPath = join(dir, `${base}.module.css`);
    const tsxContent = await readIfExists(tsxPath);
    const cssContent = await readIfExists(cssPath);
    // Window may have been destroyed during the async reads above.
    if (mainWindow.isDestroyed())
        return;
    const payload = {
        path: changedPath,
        tsxContent,
        cssContent,
        // A consumed entry that reached here is an own write that asked for
        // the broadcast (a CSS-panel patch). Say so, or the renderer pauses
        // sync for its own save. see docs/notes/save-status-machine.md
        ...(consumed !== null ? { ownWriteId: consumed.writeId } : {}),
    };
    mainWindow.webContents.send(IPC.FileChanged, payload);
};
/**
 * Capture an `agent_edit` project snapshot for an external file change.
 * Best-effort: bails if there's no active project, ignores `.scamp/`
 * paths defensively (chokidar already excludes them), and swallows
 * errors so a snapshot failure can't disturb the watcher.
 */
const snapshotExternalEdit = async (changedPath) => {
    const root = watchedPath;
    if (!root)
        return;
    if (relative(root, changedPath).startsWith('.scamp'))
        return;
    try {
        const format = await getProjectFormat(root);
        await createSnapshot(root, format, 'agent_edit', basename(changedPath));
    }
    catch {
        // never let snapshotting interfere with file watching
    }
};
const readIfExists = async (p) => {
    try {
        return await fs.readFile(p, 'utf-8');
    }
    catch {
        return null;
    }
};
export const getWatchedPath = () => watchedPath;
/**
 * Broadcast `ProjectPagesChanged` to the renderer so it re-reads the
 * project from disk. Used after a snapshot restore (whose copies are
 * suppressed at the watcher) to drive a full project refresh through the
 * existing pages-changed path.
 */
export const notifyPagesChanged = () => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.webContents.send(IPC.ProjectPagesChanged);
};

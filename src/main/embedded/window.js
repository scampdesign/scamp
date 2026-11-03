import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { agentConnected, agentSignedIn, embeddedAgentProvider } from '../ipc/agent';
import { startReactApp, stopReactApp } from '../reactImport/appServer';
import { createEmbeddedAgent } from './agentQueue';
import { commitFiles, discardFiles, ensureSessionBranch, gitDiff, gitStatus, initRepo, pullBranch, pushBranch, repoRelative, revertCommit, switchBranch, } from './git';
import { viteCommand, writeInstrumentation } from './instrument';
import { evaluatePreflight } from './preflight';
import { gatherPreflightFacts } from './preflightFacts';
const sessions = new Map();
/** Folders the user chose in the dialog: the only ones a window may open. */
const chosen = new Set();
const serverKeyFor = (folder) => `embedded:${folder}`;
const loadShell = async (win) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
        await win.loadURL(`${devUrl}/embedded/index.html`);
        return;
    }
    await win.loadFile(join(__dirname, '../renderer/embedded/index.html'));
};
export const openEmbeddedWindow = async () => {
    const win = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 900,
        minHeight: 600,
        title: 'Scamp — Edit React project',
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        webPreferences: {
            preload: join(__dirname, '../preload/embedded.js'),
            contextIsolation: true,
            sandbox: false,
            nodeIntegration: false,
            webviewTag: true,
        },
        show: false,
    });
    const id = win.webContents.id;
    // The project's page may open popups or links: the system browser takes
    // web links, and nothing opens inside Scamp.
    win.webContents.on('did-attach-webview', (_e, contents) => {
        contents.setWindowOpenHandler((details) => {
            if (details.url.startsWith('http://') || details.url.startsWith('https://'))
                void shell.openExternal(details.url);
            return { action: 'deny' };
        });
    });
    // The window's own page never navigates away from Scamp's shell.
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.on('closed', () => {
        const session = sessions.get(id);
        sessions.delete(id);
        session?.agent?.dispose();
        if (session?.serverKey)
            stopReactApp(session.serverKey);
    });
    win.once('ready-to-show', () => win.show());
    await loadShell(win);
};
const sessionOf = (e) => sessions.get(e.sender.id) ?? null;
const send = (contents, channel, payload) => {
    if (!contents.isDestroyed())
        contents.send(channel, payload);
};
const preflight = async (folder) => evaluatePreflight(await gatherPreflightFacts(folder, { signedIn: agentSignedIn(), agentConnected: await agentConnected() }));
export const registerEmbeddedIpc = () => {
    ipcMain.handle(IPC.EmbeddedOpenWindow, async () => openEmbeddedWindow());
    ipcMain.handle(IPC.EmbeddedChooseFolder, async (e) => {
        const parent = BrowserWindow.fromWebContents(e.sender);
        const options = { title: 'Choose a React project', properties: ['openDirectory'] };
        const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
        const folder = result.filePaths[0];
        if (result.canceled || folder === undefined)
            return { kind: 'cancelled' };
        chosen.add(folder);
        return { kind: 'ok', folder };
    });
    /** Bind this window to a chosen folder. */
    ipcMain.handle(IPC.EmbeddedOpen, async (e, args) => {
        const folder = typeof args?.folder === 'string' ? args.folder : '';
        if (!chosen.has(folder))
            return { error: 'Choose the project folder in the dialog first.' };
        const win = BrowserWindow.fromWebContents(e.sender);
        if (win === null)
            return { error: 'The window closed.' };
        const before = sessions.get(e.sender.id);
        if (before !== undefined && before.folder !== folder) {
            before.agent?.dispose();
            if (before.serverKey)
                stopReactApp(before.serverKey);
        }
        sessions.set(e.sender.id, { folder, window: win, agent: null, serverKey: null });
        win.setTitle(`Scamp — ${folder.split(/[\\/]/).pop() ?? folder}`);
        return preflight(folder);
    });
    ipcMain.handle(IPC.EmbeddedPreflight, async (e) => {
        const session = sessionOf(e);
        return session === null ? { error: 'Open a project first.' } : preflight(session.folder);
    });
    ipcMain.handle(IPC.EmbeddedGitInit, async (e) => {
        const session = sessionOf(e);
        return session === null ? { ok: false, error: 'Open a project first.' } : initRepo(session.folder);
    });
    ipcMain.handle(IPC.EmbeddedStart, async (e) => {
        const session = sessionOf(e);
        if (session === null)
            return { ok: false, error: 'Open a project first.' };
        const check = await preflight(session.folder);
        if (!check.canStart)
            return { ok: false, error: 'Fix the items marked on the setup screen first.' };
        const progress = (p) => send(e.sender, IPC.EmbeddedStartProgress, p);
        progress({ kind: 'phase', phase: 'branch' });
        const branch = await ensureSessionBranch(session.folder, new Date());
        if (!branch.ok)
            return { ok: false, error: branch.error };
        progress({ kind: 'phase', phase: 'configure' });
        await writeInstrumentation(session.folder);
        const key = serverKeyFor(session.folder);
        session.serverKey = key;
        const started = await startReactApp(key, session.folder, (event) => progress(event.kind === 'log' ? { kind: 'log', text: event.text } : { kind: 'phase', phase: event.phase }), (port) => viteCommand(session.folder, port));
        if (!started.ok)
            return started;
        session.agent?.dispose();
        session.agent = createEmbeddedAgent({
            folder: session.folder,
            idioms: check.idioms,
            getProvider: embeddedAgentProvider,
            emit: (event) => send(e.sender, IPC.EmbeddedAgentEvent, event),
        });
        return { ok: true, url: started.url, branch: branch.branch };
    });
    ipcMain.handle(IPC.EmbeddedStop, async (e) => {
        const session = sessionOf(e);
        if (session?.serverKey)
            stopReactApp(session.serverKey);
        if (session)
            session.serverKey = null;
    });
    // The agent queue.
    const withAgent = (e, fallback, fn) => {
        const session = sessionOf(e);
        return session?.agent ? fn(session.agent, session) : fallback;
    };
    ipcMain.handle(IPC.EmbeddedEnqueue, (e, item) => withAgent(e, false, (agent) => {
        if (item === null || typeof item !== 'object' || typeof item.id !== 'string')
            return false;
        agent.enqueue(item);
        return true;
    }));
    ipcMain.handle(IPC.EmbeddedRemoveQueued, (e, args) => withAgent(e, undefined, (agent) => agent.remove(String(args?.id ?? ''))));
    ipcMain.handle(IPC.EmbeddedSetPaused, (e, args) => withAgent(e, undefined, (agent) => agent.setPaused(args?.paused === true)));
    ipcMain.handle(IPC.EmbeddedRunNow, (e) => withAgent(e, undefined, (agent) => agent.runNow()));
    ipcMain.handle(IPC.EmbeddedCancel, (e) => withAgent(e, undefined, (agent) => agent.cancel()));
    ipcMain.handle(IPC.EmbeddedDesignCheck, (e) => withAgent(e, Promise.resolve(), (agent) => agent.designCheck()));
    // Git.
    ipcMain.handle(IPC.EmbeddedGitStatus, async (e) => {
        const session = sessionOf(e);
        if (session === null)
            return null;
        return { ...(await gitStatus(session.folder)), agentFiles: session.agent?.touched() ?? [] };
    });
    ipcMain.handle(IPC.EmbeddedGitDiff, async (e, args) => {
        const session = sessionOf(e);
        if (session === null)
            return '';
        const paths = (args?.paths ?? []).map((p) => repoRelative(session.folder, p)).filter((p) => p !== null);
        return gitDiff(session.folder, paths);
    });
    /** Accept commits only what the agent wrote; your own changes stay as they are. */
    ipcMain.handle(IPC.EmbeddedAccept, async (e, args) => {
        const session = sessionOf(e);
        if (session?.agent == null)
            return { ok: false, error: 'Nothing to accept.' };
        const files = session.agent.touched();
        const subject = (typeof args?.message === 'string' && args.message.trim().length > 0 ? args.message.trim() : `update ${files.join(', ')}`).slice(0, 120);
        const result = await commitFiles(session.folder, files, subject);
        if (result.ok)
            session.agent.clearTouched();
        return result;
    });
    ipcMain.handle(IPC.EmbeddedDiscard, async (e) => {
        const session = sessionOf(e);
        if (session?.agent == null)
            return { ok: false, error: 'Nothing to discard.' };
        const result = await discardFiles(session.folder, session.agent.touched());
        if (result.ok)
            session.agent.clearTouched();
        return result;
    });
    ipcMain.handle(IPC.EmbeddedRevert, async (e, args) => {
        const session = sessionOf(e);
        return session === null ? { ok: false, error: 'Open a project first.' } : revertCommit(session.folder, String(args?.sha ?? ''));
    });
    ipcMain.handle(IPC.EmbeddedSwitchBranch, async (e, args) => {
        const session = sessionOf(e);
        if (session === null)
            return { ok: false, error: 'Open a project first.' };
        if ((session.agent?.touched().length ?? 0) > 0)
            return { ok: false, error: 'Accept or discard the agent’s changes before switching branches.' };
        return switchBranch(session.folder, String(args?.name ?? ''), args?.create === true);
    });
    ipcMain.handle(IPC.EmbeddedPush, async (e) => {
        const session = sessionOf(e);
        return session === null ? { ok: false, error: 'Open a project first.' } : pushBranch(session.folder);
    });
    ipcMain.handle(IPC.EmbeddedPull, async (e) => {
        const session = sessionOf(e);
        return session === null ? { ok: false, error: 'Open a project first.' } : pullBranch(session.folder);
    });
};

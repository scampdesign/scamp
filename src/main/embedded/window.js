import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { basename, join, resolve as resolvePath, sep } from 'path';
import { commitMessageFor } from '@shared/embedded';
import { IPC } from '@shared/ipcChannels';
import { agentConnected, agentSignedIn, embeddedAgentProvider } from '../ipc/agent';
import { appFeatures } from '../ipc/auth';
import { allowTerminalRoot, forgetTerminalRoot } from '../ipc/terminal';
import { startReactApp, stopReactApp } from '../reactImport/appServer';
import { AGENT_TARGETS, writeAgentConfigs } from '../mcp/agentConfig';
import { ensureToken, markMcpStopped, writeMcpConfig } from '../mcp/mcpOps';
import { startMcpServer } from '../mcp/server';
import { createEmbeddedAgent } from './agentQueue';
import { commitFiles, discardFiles, ensureSessionBranch, excludeFromGit, git, gitDiff, gitStatus, initRepo, pullBranch, pushBranch, repoRelative, revertCommit, switchBranch, } from './git';
import { viteCommand, writeInstrumentation } from './instrument';
import { evaluatePreflight } from './preflight';
import { gatherPreflightFacts } from './preflightFacts';
import { classifyContent, freeFileName, jsxLines } from './content';
import { directStyleWrite } from './fastPath';
import { aliasesFrom, listOrigin } from './listOrigin';
import { goToCommit, headSha, historyBase, readHistory } from './history';
import { OWN_AGENT_TOOLS, ownAgentInvoker } from './ownAgent';
import { recordRun, redoRun, snapshotRun, undoRun } from './runs';
import { listProjectFiles } from './projectFiles';
import { syncPseudo } from './pseudo';
import { parseRecent, removeRecent, upsertRecent } from './recent';
import { nextRoutes } from './routes';
import { resolveSource } from './sourceResolve';
/**
 * Scamp's thin overlay scrollbars (global.css) for the running app, so the
 * artboard matches the rest of the window. A user stylesheet: anything the
 * app sets for its own scrollbars still wins. The thumb is a neutral grey,
 * not Scamp's theme token, so it shows on the app's own background.
 */
const GUEST_SCROLLBARS = `
::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { background-color: rgba(128, 128, 128, 0.45); border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background-color: rgba(128, 128, 128, 0.7); }
`;
/** Embedded Scamp's own range, clear of the canvas's (39841 and up), so both can run. */
const EMBEDDED_MCP_PORT = 39861;
const newSession = (folder, win) => ({
    folder,
    window: win,
    agent: null,
    serverKey: null,
    url: null,
    framework: null,
    idioms: [],
    mcp: null,
    mcpToken: null,
    mcpReport: { written: [], skipped: [] },
    ownAgentSeen: false,
    selection: null,
    historyBase: null,
    historyTip: null,
    runs: new Map(),
    snapshots: new Map(),
});
const endSession = async (session) => {
    session.agent?.dispose();
    if (session.serverKey)
        stopReactApp(session.serverKey);
    const server = session.mcp;
    session.mcp = null;
    if (server !== null) {
        await server.close();
        await markMcpStopped(session.folder);
    }
};
/** Which agent writes changes, remembered across projects. */
const workerPath = () => join(app.getPath('userData'), 'embeddedAgent.json');
export const readWorker = async () => {
    const text = await fs.readFile(workerPath(), 'utf8').catch(() => '');
    return text.includes('"own"') ? 'own' : 'scamp';
};
const writeWorker = async (worker) => {
    await fs.writeFile(workerPath(), JSON.stringify({ worker }), 'utf8').catch(() => undefined);
};
/**
 * Serve the queue to the user's own agent: start this session's MCP server
 * and register it in each installed agent's config in the project. A config
 * file the project tracks in git is left alone (it's the team's), and every
 * file written goes in `.git/info/exclude`, since it holds the token.
 */
const startOwnAgentServer = async (session) => {
    if (session.mcp !== null)
        return;
    const token = await ensureToken(session.folder);
    session.mcpToken = token;
    session.mcp = await startMcpServer({
        token,
        port: EMBEDDED_MCP_PORT,
        deps: {
            tools: OWN_AGENT_TOOLS,
            invoke: ownAgentInvoker({
                folder: session.folder,
                idioms: () => session.idioms,
                agent: () => session.agent,
                selection: () => session.selection,
                onSeen: () => {
                    session.ownAgentSeen = true;
                },
            }),
        },
    });
    await writeMcpConfig(session.folder, {
        url: session.mcp.url,
        token,
        running: true,
        started_at: new Date().toISOString(),
        project: basename(session.folder),
    });
    const skip = new Map();
    for (const target of AGENT_TARGETS) {
        const tracked = await git(session.folder, ['ls-files', '--error-unmatch', target.configPath]);
        if (tracked.ok)
            skip.set(target.configPath, 'the project tracks this file in git, so Scamp won’t add its token to it');
    }
    session.mcpReport = await writeAgentConfigs({ projectPath: session.folder, homeDir: homedir(), url: session.mcp.url, token, skip });
    await excludeFromGit(session.folder, session.mcpReport.written);
};
const ownAgentStatus = async (session) => ({
    worker: session.agent?.worker() ?? (await readWorker()),
    url: session.mcp?.url ?? null,
    written: session.mcpReport.written,
    skipped: session.mcpReport.skipped,
    // For an agent whose config couldn't be written: the command that registers it by hand.
    command: session.mcp === null || session.mcpToken === null
        ? null
        : `claude mcp add --transport http scamp ${session.mcp.url} --header "X-Scamp-Token: ${session.mcpToken}"`,
    seen: session.ownAgentSeen,
    working: (session.agent?.heldBatch() ?? null) !== null,
});
const sessions = new Map();
/** Each window's `<webview>` contents, for the debugger. */
const guests = new Map();
/** Folders the user chose in the dialog: the only ones a window may open. */
const chosen = new Set();
const recentPath = () => join(app.getPath('userData'), 'embeddedRecent.json');
const readRecent = async () => parseRecent(await fs.readFile(recentPath(), 'utf8').catch(() => ''));
const writeRecent = async (projects) => {
    await fs.writeFile(recentPath(), JSON.stringify({ projects }, null, 2), 'utf8').catch(() => undefined);
};
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
    // No File, Edit, View menu bar on Windows and Linux: the window has its own toolbar.
    // Text fields keep copy, paste, and undo, which Chromium handles without a menu.
    win.removeMenu();
    // The project's page may open popups or links: the system browser takes
    // web links, and nothing opens inside Scamp.
    win.webContents.on('did-attach-webview', (_e, contents) => {
        guests.set(id, contents);
        // Every page load is a new document: add the scrollbars again.
        contents.on('dom-ready', () => {
            void contents.insertCSS(GUEST_SCROLLBARS, { cssOrigin: 'user' }).catch(() => undefined);
        });
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
        guests.delete(id);
        forgetTerminalRoot(id);
        if (session !== undefined)
            void endSession(session);
    });
    win.once('ready-to-show', () => win.show());
    await loadShell(win);
};
const sessionOf = (e) => sessions.get(e.sender.id) ?? null;
const send = (contents, channel, payload) => {
    if (!contents.isDestroyed())
        contents.send(channel, payload);
};
const preflight = async (folder) => evaluatePreflight(await gatherPreflightFacts(folder, { signedIn: agentSignedIn(), agentConnected: await agentConnected(), ownAgent: (await readWorker()) === 'own' }));
/** A project file by its project-relative path; null outside the project, in `node_modules`, or over 2MB. */
const readProjectFile = async (root, file) => {
    const abs = resolvePath(root, file);
    if (!abs.startsWith(root + sep) || file.includes('node_modules/'))
        return null;
    const stat = await fs.stat(abs).catch(() => null);
    if (stat === null || !stat.isFile() || stat.size > 2_000_000)
        return null;
    return fs.readFile(abs, 'utf8').catch(() => null);
};
export const registerEmbeddedIpc = () => {
    // The flag is checked here, not only by hiding the button.
    ipcMain.handle(IPC.EmbeddedOpenWindow, async () => {
        if (!appFeatures().embedded)
            return false;
        await openEmbeddedWindow();
        return true;
    });
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
        const recent = await readRecent();
        if (!chosen.has(folder) && !recent.some((p) => p.folder === folder))
            return { error: 'Choose the project folder in the dialog first.' };
        const win = BrowserWindow.fromWebContents(e.sender);
        if (win === null)
            return { error: 'The window closed.' };
        const before = sessions.get(e.sender.id);
        if (before !== undefined && before.folder !== folder)
            await endSession(before);
        sessions.set(e.sender.id, newSession(folder, win));
        // The window's terminal opens in this project, for running the user's own agent.
        allowTerminalRoot(e.sender.id, folder);
        win.setTitle(`Scamp — ${folder.split(/[\\/]/).pop() ?? folder}`);
        const report = await preflight(folder);
        await writeRecent(upsertRecent(recent, { folder, name: report.name || basename(folder), lastOpened: new Date().toISOString() }));
        return report;
    });
    ipcMain.handle(IPC.EmbeddedRecent, async () => Promise.all((await readRecent()).map(async (p) => ({
        ...p,
        exists: await fs.stat(p.folder).then((s) => s.isDirectory(), () => false),
    }))));
    ipcMain.handle(IPC.EmbeddedForgetRecent, async (_e, args) => {
        await writeRecent(removeRecent(await readRecent(), String(args?.folder ?? '')));
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
        session.historyBase = await historyBase(session.folder);
        session.historyTip = await headSha(session.folder);
        // Next.js runs as it is: sources come from React's debug info, resolved in `resolveSource`.
        session.framework = check.framework;
        const next = check.framework === 'next';
        if (!next) {
            progress({ kind: 'phase', phase: 'configure' });
            await writeInstrumentation(session.folder);
        }
        const key = serverKeyFor(session.folder);
        session.serverKey = key;
        const started = await startReactApp(key, session.folder, (event) => progress(event.kind === 'log' ? { kind: 'log', text: event.text } : { kind: 'phase', phase: event.phase }), next ? undefined : (port) => viteCommand(session.folder, port));
        if (!started.ok)
            return started;
        session.url = started.url;
        session.agent?.dispose();
        session.agent = createEmbeddedAgent({
            folder: session.folder,
            idioms: check.idioms,
            getProvider: embeddedAgentProvider,
            emit: (event) => send(e.sender, IPC.EmbeddedAgentEvent, event),
            onRunStart: async (runId) => {
                session.snapshots.set(runId, await snapshotRun(session.folder));
            },
            onRunEnd: async (runId) => {
                const before = session.snapshots.get(runId);
                session.snapshots.delete(runId);
                if (before !== undefined)
                    session.runs.set(runId, await recordRun(session.folder, runId, before));
            },
            writeDirect: async (item) => {
                const out = await directStyleWrite(item, (file) => readProjectFile(session.folder, file));
                if (out === null)
                    return null;
                await fs.writeFile(join(session.folder, out.file), out.content, 'utf8');
                return out.file;
            },
        });
        session.idioms = check.idioms;
        const worker = await readWorker();
        session.agent.setWorker(worker);
        if (worker === 'own')
            await startOwnAgentServer(session).catch(() => undefined);
        return { ok: true, url: started.url, branch: branch.branch };
    });
    ipcMain.handle(IPC.EmbeddedStop, async (e) => {
        const session = sessionOf(e);
        if (session?.serverKey)
            stopReactApp(session.serverKey);
        if (session)
            session.serverKey = null;
    });
    ipcMain.handle(IPC.EmbeddedRoutes, async (e) => {
        const session = sessionOf(e);
        return session?.framework === 'next' ? nextRoutes(await listProjectFiles(session.folder)) : [];
    });
    ipcMain.handle(IPC.EmbeddedSetWorker, async (e, args) => {
        const worker = args?.worker === 'own' ? 'own' : 'scamp';
        await writeWorker(worker);
        const session = sessionOf(e);
        if (session === null)
            return null;
        session.agent?.setWorker(worker);
        if (worker === 'own' && session.agent !== null)
            await startOwnAgentServer(session).catch(() => undefined);
        return ownAgentStatus(session);
    });
    ipcMain.handle(IPC.EmbeddedOwnAgentStatus, async (e) => {
        const session = sessionOf(e);
        return session === null ? null : ownAgentStatus(session);
    });
    ipcMain.on(IPC.EmbeddedSelectionChanged, (e, element) => {
        const session = sessions.get(e.sender.id);
        if (session !== undefined)
            session.selection = element !== null && typeof element === 'object' ? element : null;
    });
    /** Where an element's text, image, or link comes from: written in the code, a prop, or data. */
    ipcMain.handle(IPC.EmbeddedContentOrigin, async (e, args) => {
        const session = sessionOf(e);
        const fields = ['text', 'src', 'alt', 'href'];
        if (session === null || typeof args?.source !== 'string' || !fields.includes(args.field)) {
            return { kind: 'unknown', reason: 'Scamp couldn’t look this up' };
        }
        const calls = Array.isArray(args.calls)
            ? args.calls.filter((c) => typeof c?.name === 'string').map((c) => ({ name: c.name, call: typeof c.call === 'string' ? c.call : null }))
            : [];
        const read = (file) => readProjectFile(session.folder, file);
        return classifyContent({ source: args.source, field: args.field, calls, read }).catch(() => ({ kind: 'unknown', reason: 'Scamp couldn’t read the code' }));
    });
    /** The selected element's JSX, for the code view. */
    ipcMain.handle(IPC.EmbeddedReadSource, async (e, args) => {
        const session = sessionOf(e);
        const file = typeof args?.source === 'string' ? args.source.replace(/:\d+:\d+$/, '') : '';
        if (session === null || file === '')
            return null;
        const code = await readProjectFile(session.folder, file);
        const found = code === null ? null : jsxLines(code, args.source);
        return found === null ? null : { file, ...found };
    });
    /** Where a list's order comes from, before a move among its items is queued. */
    ipcMain.handle(IPC.EmbeddedListOrigin, async (e, args) => {
        const session = sessionOf(e);
        const sources = Array.isArray(args?.sources) ? args.sources.filter((s) => typeof s === 'string').slice(0, 4) : [];
        if (session === null || sources.length === 0)
            return null;
        const read = (file) => readProjectFile(session.folder, file);
        const config = (await read('tsconfig.json')) ?? (await read('jsconfig.json'));
        return listOrigin({ sources, read, aliases: config === null ? [] : aliasesFrom(config) }).catch(() => null);
    });
    /** Copy an image from disk into the project's `public/`, served at `/name`; the agent's change to accept or discard. */
    ipcMain.handle(IPC.EmbeddedChooseImage, async (e) => {
        const session = sessionOf(e);
        if (session === null || session.agent === null)
            return { kind: 'error', error: 'Start the app first.' };
        const parent = BrowserWindow.fromWebContents(e.sender);
        const options = {
            title: 'Choose an image',
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }],
        };
        const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
        const file = result.filePaths[0];
        if (result.canceled || file === undefined)
            return { kind: 'cancelled' };
        try {
            const pub = join(session.folder, 'public');
            await fs.mkdir(pub, { recursive: true });
            const name = freeFileName(basename(file), await fs.readdir(pub));
            await fs.copyFile(file, join(pub, name));
            session.agent.addTouched([`public/${name}`]);
            return { kind: 'ok', url: `/${name}` };
        }
        catch {
            return { kind: 'error', error: 'Scamp couldn’t copy that image into public/.' };
        }
    });
    ipcMain.handle(IPC.EmbeddedSyncPseudo, async (e) => {
        const guest = guests.get(e.sender.id);
        return guest === undefined || guest.isDestroyed() ? false : syncPseudo(guest);
    });
    ipcMain.handle(IPC.EmbeddedResolveSource, async (e, args) => {
        const session = sessionOf(e);
        const raw = args?.raw;
        if (session === null || session.url === null || raw === null || typeof raw !== 'object')
            return { source: null };
        const hints = {
            tag: String(args.hints?.tag ?? ''),
            classes: Array.isArray(args.hints?.classes) ? args.hints.classes.map(String) : [],
            text: String(args.hints?.text ?? ''),
        };
        const source = await resolveSource(session.folder, new URL(session.url).origin, raw, hints).catch(() => null);
        return { source };
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
    ipcMain.handle(IPC.EmbeddedRemoveQueued, (e, args) => withAgent(e, false, (agent) => agent.remove(String(args?.id ?? ''))));
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
        const message = commitMessageFor(typeof args?.message === 'string' ? args.message : '', session.agent.doneSummary(), files);
        const result = await commitFiles(session.folder, files, message.subject, message.body);
        if (result.ok) {
            session.agent.clearTouched();
            // Committed: undo goes through the history from here, and the new commit is its newest step.
            session.runs.clear();
            session.historyTip = await headSha(session.folder);
        }
        return result;
    });
    ipcMain.handle(IPC.EmbeddedDiscard, async (e) => {
        const session = sessionOf(e);
        if (session?.agent == null)
            return { ok: false, error: 'Nothing to discard.' };
        const result = await discardFiles(session.folder, session.agent.touched());
        if (result.ok) {
            session.agent.clearTouched();
            session.runs.clear();
        }
        return result;
    });
    ipcMain.handle(IPC.EmbeddedRevert, async (e, args) => {
        const session = sessionOf(e);
        if (session === null)
            return { ok: false, error: 'Open a project first.' };
        const result = await revertCommit(session.folder, String(args?.sha ?? ''));
        if (result.ok)
            session.historyTip = await headSha(session.folder);
        return result;
    });
    ipcMain.handle(IPC.EmbeddedHistory, async (e) => {
        const session = sessionOf(e);
        return session === null ? null : readHistory(session.folder, session.historyBase, session.historyTip);
    });
    /** Move the project to a point in its history, keeping the newer steps reachable. */
    ipcMain.handle(IPC.EmbeddedHistoryGoTo, async (e, args) => {
        const session = sessionOf(e);
        if (session === null)
            return { ok: false, error: 'Open a project first.' };
        const before = await headSha(session.folder);
        const result = await goToCommit(session.folder, String(args?.sha ?? ''), {
            base: session.historyBase,
            tip: session.historyTip,
            pendingAgentFiles: session.agent?.touched().length ?? 0,
        });
        // The first step back makes where the project was the tip, so it's reachable again.
        if (result.ok && session.historyTip === null)
            session.historyTip = before;
        return result;
    });
    /** Undo or redo what one agent run wrote, if its files are as it left them. */
    ipcMain.handle(IPC.EmbeddedUndoRun, async (e, args) => {
        const session = sessionOf(e);
        const run = session?.runs.get(String(args?.runId ?? ''));
        if (session === null || session.agent === null || run === undefined) {
            return { ok: false, error: 'That change was accepted or discarded, so it’s in the history now.' };
        }
        const redo = args?.redo === true;
        const result = await (redo ? redoRun : undoRun)(session.folder, run);
        if (!result.ok)
            return result;
        const paths = run.files.map((f) => f.path);
        if (redo)
            session.agent.addTouched(paths);
        else {
            // A file back to how HEAD has it is no longer the agent's to accept.
            const still = new Set((await gitStatus(session.folder)).changed.map((c) => c.path));
            session.agent.clearTouched(paths.filter((p) => !still.has(p)));
        }
        return { ok: true };
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

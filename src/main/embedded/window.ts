import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

import { IPC } from '@shared/ipcChannels';
import type {
  EmbeddedAgentEvent,
  EmbeddedChooseResult,
  EmbeddedGitResult,
  EmbeddedGitStatus,
  EmbeddedPreflight,
  EmbeddedQueueItem,
  EmbeddedRawSource,
  EmbeddedRecentProject,
  EmbeddedResolvedSource,
  EmbeddedStartProgress,
  EmbeddedStartResult,
} from '@shared/types';

import { agentConnected, agentSignedIn, embeddedAgentProvider } from '../ipc/agent';
import { appFeatures } from '../ipc/auth';
import { startReactApp, stopReactApp } from '../reactImport/appServer';
import { createEmbeddedAgent, type EmbeddedAgent } from './agentQueue';
import {
  commitFiles,
  discardFiles,
  ensureSessionBranch,
  gitDiff,
  gitStatus,
  initRepo,
  pullBranch,
  pushBranch,
  repoRelative,
  revertCommit,
  switchBranch,
} from './git';
import { viteCommand, writeInstrumentation } from './instrument';
import { evaluatePreflight } from './preflight';
import { gatherPreflightFacts } from './preflightFacts';
import { listProjectFiles } from './projectFiles';
import { syncPseudo } from './pseudo';
import { parseRecent, removeRecent, upsertRecent } from './recent';
import { nextRoutes } from './routes';
import { resolveSource } from './sourceResolve';

/**
 * The Embedded Scamp window: a project's running app in a `<webview>`,
 * with Scamp's panel and agent beside it. One window per project, each
 * with its own session (dev server, agent queue, branch).
 *
 * Every handler acts on the folder of the window that asked, and only on a
 * folder the user picked in the folder dialog.
 * see docs/plans/embedded-scamp-plan.md
 */

type Session = {
  folder: string;
  window: BrowserWindow;
  agent: EmbeddedAgent | null;
  serverKey: string | null;
  url: string | null;
  framework: EmbeddedPreflight['framework'];
};

const sessions = new Map<number, Session>();
/** Each window's `<webview>` contents, for the debugger. */
const guests = new Map<number, WebContents>();
/** Folders the user chose in the dialog: the only ones a window may open. */
const chosen = new Set<string>();

const recentPath = (): string => join(app.getPath('userData'), 'embeddedRecent.json');
const readRecent = async (): Promise<EmbeddedRecentProject[]> =>
  parseRecent(await fs.readFile(recentPath(), 'utf8').catch(() => ''));
const writeRecent = async (projects: EmbeddedRecentProject[]): Promise<void> => {
  await fs.writeFile(recentPath(), JSON.stringify({ projects }, null, 2), 'utf8').catch(() => undefined);
};

const serverKeyFor = (folder: string): string => `embedded:${folder}`;

const loadShell = async (win: BrowserWindow): Promise<void> => {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    await win.loadURL(`${devUrl}/embedded/index.html`);
    return;
  }
  await win.loadFile(join(__dirname, '../renderer/embedded/index.html'));
};

export const openEmbeddedWindow = async (): Promise<void> => {
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
    guests.set(id, contents);
    contents.setWindowOpenHandler((details) => {
      if (details.url.startsWith('http://') || details.url.startsWith('https://')) void shell.openExternal(details.url);
      return { action: 'deny' };
    });
  });
  // The window's own page never navigates away from Scamp's shell.
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('closed', () => {
    const session = sessions.get(id);
    sessions.delete(id);
    guests.delete(id);
    session?.agent?.dispose();
    if (session?.serverKey) stopReactApp(session.serverKey);
  });
  win.once('ready-to-show', () => win.show());
  await loadShell(win);
};

const sessionOf = (e: IpcMainInvokeEvent): Session | null => sessions.get(e.sender.id) ?? null;

const send = (contents: WebContents, channel: string, payload: unknown): void => {
  if (!contents.isDestroyed()) contents.send(channel, payload);
};

const preflight = async (folder: string): Promise<EmbeddedPreflight> =>
  evaluatePreflight(await gatherPreflightFacts(folder, { signedIn: agentSignedIn(), agentConnected: await agentConnected() }));

export const registerEmbeddedIpc = (): void => {
  // The flag is checked here, not only by hiding the button.
  ipcMain.handle(IPC.EmbeddedOpenWindow, async (): Promise<boolean> => {
    if (!appFeatures().embedded) return false;
    await openEmbeddedWindow();
    return true;
  });

  ipcMain.handle(IPC.EmbeddedChooseFolder, async (e): Promise<EmbeddedChooseResult> => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const options = { title: 'Choose a React project', properties: ['openDirectory' as const] };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    const folder = result.filePaths[0];
    if (result.canceled || folder === undefined) return { kind: 'cancelled' };
    chosen.add(folder);
    return { kind: 'ok', folder };
  });

  /** Bind this window to a chosen folder. */
  ipcMain.handle(IPC.EmbeddedOpen, async (e, args: { folder: string }): Promise<EmbeddedPreflight | { error: string }> => {
    const folder = typeof args?.folder === 'string' ? args.folder : '';
    const recent = await readRecent();
    if (!chosen.has(folder) && !recent.some((p) => p.folder === folder)) return { error: 'Choose the project folder in the dialog first.' };
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win === null) return { error: 'The window closed.' };
    const before = sessions.get(e.sender.id);
    if (before !== undefined && before.folder !== folder) {
      before.agent?.dispose();
      if (before.serverKey) stopReactApp(before.serverKey);
    }
    sessions.set(e.sender.id, { folder, window: win, agent: null, serverKey: null, url: null, framework: null });
    win.setTitle(`Scamp — ${folder.split(/[\\/]/).pop() ?? folder}`);
    const report = await preflight(folder);
    await writeRecent(upsertRecent(recent, { folder, name: report.name || basename(folder), lastOpened: new Date().toISOString() }));
    return report;
  });

  ipcMain.handle(IPC.EmbeddedRecent, async (): Promise<Array<EmbeddedRecentProject & { exists: boolean }>> =>
    Promise.all(
      (await readRecent()).map(async (p) => ({
        ...p,
        exists: await fs.stat(p.folder).then((s) => s.isDirectory(), () => false),
      }))
    )
  );
  ipcMain.handle(IPC.EmbeddedForgetRecent, async (_e, args: { folder: string }): Promise<void> => {
    await writeRecent(removeRecent(await readRecent(), String(args?.folder ?? '')));
  });

  ipcMain.handle(IPC.EmbeddedPreflight, async (e): Promise<EmbeddedPreflight | { error: string }> => {
    const session = sessionOf(e);
    return session === null ? { error: 'Open a project first.' } : preflight(session.folder);
  });

  ipcMain.handle(IPC.EmbeddedGitInit, async (e): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    return session === null ? { ok: false, error: 'Open a project first.' } : initRepo(session.folder);
  });

  ipcMain.handle(IPC.EmbeddedStart, async (e): Promise<EmbeddedStartResult> => {
    const session = sessionOf(e);
    if (session === null) return { ok: false, error: 'Open a project first.' };
    const check = await preflight(session.folder);
    if (!check.canStart) return { ok: false, error: 'Fix the items marked on the setup screen first.' };
    const progress = (p: EmbeddedStartProgress): void => send(e.sender, IPC.EmbeddedStartProgress, p);

    progress({ kind: 'phase', phase: 'branch' });
    const branch = await ensureSessionBranch(session.folder, new Date());
    if (!branch.ok) return { ok: false, error: branch.error };
    // Next.js runs as it is: sources come from React's debug info, resolved in `resolveSource`.
    session.framework = check.framework;
    const next = check.framework === 'next';
    if (!next) {
      progress({ kind: 'phase', phase: 'configure' });
      await writeInstrumentation(session.folder);
    }

    const key = serverKeyFor(session.folder);
    session.serverKey = key;
    const started = await startReactApp(
      key,
      session.folder,
      (event) => progress(event.kind === 'log' ? { kind: 'log', text: event.text } : { kind: 'phase', phase: event.phase }),
      next ? undefined : (port) => viteCommand(session.folder, port)
    );
    if (!started.ok) return started;
    session.url = started.url;

    session.agent?.dispose();
    session.agent = createEmbeddedAgent({
      folder: session.folder,
      idioms: check.idioms,
      getProvider: embeddedAgentProvider,
      emit: (event: EmbeddedAgentEvent) => send(e.sender, IPC.EmbeddedAgentEvent, event),
    });
    return { ok: true, url: started.url, branch: branch.branch };
  });

  ipcMain.handle(IPC.EmbeddedStop, async (e): Promise<void> => {
    const session = sessionOf(e);
    if (session?.serverKey) stopReactApp(session.serverKey);
    if (session) session.serverKey = null;
  });

  ipcMain.handle(IPC.EmbeddedRoutes, async (e): Promise<string[]> => {
    const session = sessionOf(e);
    return session?.framework === 'next' ? nextRoutes(await listProjectFiles(session.folder)) : [];
  });
  ipcMain.handle(IPC.EmbeddedSyncPseudo, async (e): Promise<boolean> => {
    const guest = guests.get(e.sender.id);
    return guest === undefined || guest.isDestroyed() ? false : syncPseudo(guest);
  });
  ipcMain.handle(
    IPC.EmbeddedResolveSource,
    async (e, args: { raw: EmbeddedRawSource; hints: { tag: string; classes: string[]; text: string } }): Promise<EmbeddedResolvedSource> => {
      const session = sessionOf(e);
      const raw = args?.raw;
      if (session === null || session.url === null || raw === null || typeof raw !== 'object') return { source: null };
      const hints = {
        tag: String(args.hints?.tag ?? ''),
        classes: Array.isArray(args.hints?.classes) ? args.hints.classes.map(String) : [],
        text: String(args.hints?.text ?? ''),
      };
      const source = await resolveSource(session.folder, new URL(session.url).origin, raw, hints).catch(() => null);
      return { source };
    }
  );

  // The agent queue.
  const withAgent = <T>(e: IpcMainInvokeEvent, fallback: T, fn: (agent: EmbeddedAgent, session: Session) => T): T => {
    const session = sessionOf(e);
    return session?.agent ? fn(session.agent, session) : fallback;
  };
  ipcMain.handle(IPC.EmbeddedEnqueue, (e, item: EmbeddedQueueItem) =>
    withAgent(e, false, (agent) => {
      if (item === null || typeof item !== 'object' || typeof item.id !== 'string') return false;
      agent.enqueue(item);
      return true;
    })
  );
  ipcMain.handle(IPC.EmbeddedRemoveQueued, (e, args: { id: string }) => withAgent(e, undefined, (agent) => agent.remove(String(args?.id ?? ''))));
  ipcMain.handle(IPC.EmbeddedSetPaused, (e, args: { paused: boolean }) => withAgent(e, undefined, (agent) => agent.setPaused(args?.paused === true)));
  ipcMain.handle(IPC.EmbeddedRunNow, (e) => withAgent(e, undefined, (agent) => agent.runNow()));
  ipcMain.handle(IPC.EmbeddedCancel, (e) => withAgent(e, undefined, (agent) => agent.cancel()));
  ipcMain.handle(IPC.EmbeddedDesignCheck, (e) => withAgent(e, Promise.resolve(), (agent) => agent.designCheck()));

  // Git.
  ipcMain.handle(IPC.EmbeddedGitStatus, async (e): Promise<(EmbeddedGitStatus & { agentFiles: string[] }) | null> => {
    const session = sessionOf(e);
    if (session === null) return null;
    return { ...(await gitStatus(session.folder)), agentFiles: session.agent?.touched() ?? [] };
  });
  ipcMain.handle(IPC.EmbeddedGitDiff, async (e, args: { paths?: string[] }): Promise<string> => {
    const session = sessionOf(e);
    if (session === null) return '';
    const paths = (args?.paths ?? []).map((p) => repoRelative(session.folder, p)).filter((p): p is string => p !== null);
    return gitDiff(session.folder, paths);
  });
  /** Accept commits only what the agent wrote; your own changes stay as they are. */
  ipcMain.handle(IPC.EmbeddedAccept, async (e, args: { message?: string }): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    if (session?.agent == null) return { ok: false, error: 'Nothing to accept.' };
    const files = session.agent.touched();
    const subject = (typeof args?.message === 'string' && args.message.trim().length > 0 ? args.message.trim() : `update ${files.join(', ')}`).slice(0, 120);
    const result = await commitFiles(session.folder, files, subject);
    if (result.ok) session.agent.clearTouched();
    return result;
  });
  ipcMain.handle(IPC.EmbeddedDiscard, async (e): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    if (session?.agent == null) return { ok: false, error: 'Nothing to discard.' };
    const result = await discardFiles(session.folder, session.agent.touched());
    if (result.ok) session.agent.clearTouched();
    return result;
  });
  ipcMain.handle(IPC.EmbeddedRevert, async (e, args: { sha: string }): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    return session === null ? { ok: false, error: 'Open a project first.' } : revertCommit(session.folder, String(args?.sha ?? ''));
  });
  ipcMain.handle(IPC.EmbeddedSwitchBranch, async (e, args: { name: string; create: boolean }): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    if (session === null) return { ok: false, error: 'Open a project first.' };
    if ((session.agent?.touched().length ?? 0) > 0) return { ok: false, error: 'Accept or discard the agent’s changes before switching branches.' };
    return switchBranch(session.folder, String(args?.name ?? ''), args?.create === true);
  });
  ipcMain.handle(IPC.EmbeddedPush, async (e): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    return session === null ? { ok: false, error: 'Open a project first.' } : pushBranch(session.folder);
  });
  ipcMain.handle(IPC.EmbeddedPull, async (e): Promise<EmbeddedGitResult> => {
    const session = sessionOf(e);
    return session === null ? { ok: false, error: 'Open a project first.' } : pullBranch(session.folder);
  });
};

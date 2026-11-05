import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipcChannels';
/**
 * Preload for the Embedded Scamp window. The project's page runs in a
 * `<webview>` with no preload of its own, so nothing here is reachable from
 * it. Every call acts on the folder this window opened; main checks that.
 * see docs/plans/embedded-scamp-plan.md
 */
const on = (channel, listener) => {
    const handler = (_e, payload) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
};
const embeddedApi = {
    chooseFolder: () => ipcRenderer.invoke(IPC.EmbeddedChooseFolder),
    /** Recent projects, with whether each folder is still there. */
    recent: () => ipcRenderer.invoke(IPC.EmbeddedRecent),
    forgetRecent: (folder) => ipcRenderer.invoke(IPC.EmbeddedForgetRecent, { folder }),
    open: (folder) => ipcRenderer.invoke(IPC.EmbeddedOpen, { folder }),
    preflight: () => ipcRenderer.invoke(IPC.EmbeddedPreflight),
    gitInit: () => ipcRenderer.invoke(IPC.EmbeddedGitInit),
    signIn: () => ipcRenderer.invoke(IPC.AuthStart),
    setAgentKey: (key) => ipcRenderer.invoke(IPC.AgentKeySet, { key }),
    start: () => ipcRenderer.invoke(IPC.EmbeddedStart),
    onStartProgress: (listener) => on(IPC.EmbeddedStartProgress, listener),
    stop: () => ipcRenderer.invoke(IPC.EmbeddedStop),
    enqueue: (item) => ipcRenderer.invoke(IPC.EmbeddedEnqueue, item),
    removeQueued: (id) => ipcRenderer.invoke(IPC.EmbeddedRemoveQueued, { id }),
    setPaused: (paused) => ipcRenderer.invoke(IPC.EmbeddedSetPaused, { paused }),
    runNow: () => ipcRenderer.invoke(IPC.EmbeddedRunNow),
    cancel: () => ipcRenderer.invoke(IPC.EmbeddedCancel),
    designCheck: () => ipcRenderer.invoke(IPC.EmbeddedDesignCheck),
    onAgentEvent: (listener) => on(IPC.EmbeddedAgentEvent, listener),
    gitStatus: () => ipcRenderer.invoke(IPC.EmbeddedGitStatus),
    gitDiff: (paths) => ipcRenderer.invoke(IPC.EmbeddedGitDiff, { paths }),
    accept: (message) => ipcRenderer.invoke(IPC.EmbeddedAccept, { message }),
    discard: () => ipcRenderer.invoke(IPC.EmbeddedDiscard),
    revert: (sha) => ipcRenderer.invoke(IPC.EmbeddedRevert, { sha }),
    switchBranch: (name, create) => ipcRenderer.invoke(IPC.EmbeddedSwitchBranch, { name, create }),
    push: () => ipcRenderer.invoke(IPC.EmbeddedPush),
    pull: () => ipcRenderer.invoke(IPC.EmbeddedPull),
    /** Apply the page's `data-scamp-force` marks as forced pseudo-classes. */
    syncPseudo: () => ipcRenderer.invoke(IPC.EmbeddedSyncPseudo),
    /** Routes read from the project's files (Next.js); empty for other stacks. */
    routes: () => ipcRenderer.invoke(IPC.EmbeddedRoutes),
    resolveSource: (raw, hints) => ipcRenderer.invoke(IPC.EmbeddedResolveSource, { raw, hints }),
};
contextBridge.exposeInMainWorld('scampEmbedded', embeddedApi);

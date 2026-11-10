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
    /** False when the item wasn't in the queue: the agent has it, or it's gone. */
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
    history: () => ipcRenderer.invoke(IPC.EmbeddedHistory),
    historyGoTo: (sha) => ipcRenderer.invoke(IPC.EmbeddedHistoryGoTo, { sha }),
    /** Undo (or redo) what one agent run wrote. */
    undoRun: (runId, redo = false) => ipcRenderer.invoke(IPC.EmbeddedUndoRun, { runId, redo }),
    /** Where an element's text, image, or link comes from. */
    contentOrigin: (source, field, calls) => ipcRenderer.invoke(IPC.EmbeddedContentOrigin, { source, field, calls }),
    /** Pick an image and copy it into the project's `public/`. */
    chooseImage: () => ipcRenderer.invoke(IPC.EmbeddedChooseImage),
    /** The JSX of the element written at `source`, for the code view. */
    readSource: (source) => ipcRenderer.invoke(IPC.EmbeddedReadSource, { source }),
    /** Where the order of the list an element is drawn by comes from: its JSX first, then where its component is used. */
    listOrigin: (sources) => ipcRenderer.invoke(IPC.EmbeddedListOrigin, { sources }),
    /** Who writes changes: Scamp's agent or the user's own, over MCP. */
    setWorker: (worker) => ipcRenderer.invoke(IPC.EmbeddedSetWorker, { worker }),
    ownAgentStatus: () => ipcRenderer.invoke(IPC.EmbeddedOwnAgentStatus),
    selectionChanged: (element) => ipcRenderer.send(IPC.EmbeddedSelectionChanged, element),
    // A terminal in the project folder, for the user's own agent. Same channels as the main window's.
    createTerminal: (args) => ipcRenderer.invoke(IPC.TerminalCreate, args),
    writeTerminal: (args) => ipcRenderer.invoke(IPC.TerminalWrite, args),
    resizeTerminal: (args) => ipcRenderer.invoke(IPC.TerminalResize, args),
    killTerminal: (args) => ipcRenderer.invoke(IPC.TerminalKill, args),
    onTerminalData: (handler) => on(IPC.TerminalData, handler),
    onTerminalExit: (handler) => on(IPC.TerminalExit, handler),
    /** Routes read from the project's files (Next.js); empty for other stacks. */
    routes: () => ipcRenderer.invoke(IPC.EmbeddedRoutes),
    resolveSource: (raw, hints) => ipcRenderer.invoke(IPC.EmbeddedResolveSource, { raw, hints }),
};
contextBridge.exposeInMainWorld('scampEmbedded', embeddedApi);

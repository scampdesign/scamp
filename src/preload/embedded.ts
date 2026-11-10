import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import { IPC } from '@shared/ipcChannels';
import type {
  AgentKeySetResult,
  AuthSignInResult,
  EmbeddedAgentEvent,
  EmbeddedChooseResult,
  EmbeddedGitResult,
  EmbeddedGitStatus,
  EmbeddedHistory,
  EmbeddedPreflight,
  EmbeddedContentField,
  EmbeddedChooseImageResult,
  EmbeddedSourceLines,
  EmbeddedListOrigin,
  EmbeddedContentOrigin,
  EmbeddedElementRef,
  EmbeddedOwnAgentStatus,
  EmbeddedQueueItem,
  EmbeddedWorker,
  TerminalCreateArgs,
  TerminalCreateResult,
  TerminalDataPayload,
  TerminalExitPayload,
  TerminalKillArgs,
  TerminalResizeArgs,
  TerminalWriteArgs,
  EmbeddedRawSource,
  EmbeddedRecentProject,
  EmbeddedResolvedSource,
  EmbeddedStartProgress,
  EmbeddedStartResult,
} from '@shared/types';

/**
 * Preload for the Embedded Scamp window. The project's page runs in a
 * `<webview>` with no preload of its own, so nothing here is reachable from
 * it. Every call acts on the folder this window opened; main checks that.
 * see docs/plans/embedded-scamp-plan.md
 */
const on = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_e: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const embeddedApi = {
  chooseFolder: (): Promise<EmbeddedChooseResult> => ipcRenderer.invoke(IPC.EmbeddedChooseFolder),
  /** Recent projects, with whether each folder is still there. */
  recent: (): Promise<Array<EmbeddedRecentProject & { exists: boolean }>> => ipcRenderer.invoke(IPC.EmbeddedRecent),
  forgetRecent: (folder: string): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedForgetRecent, { folder }),
  open: (folder: string): Promise<EmbeddedPreflight | { error: string }> => ipcRenderer.invoke(IPC.EmbeddedOpen, { folder }),
  preflight: (): Promise<EmbeddedPreflight | { error: string }> => ipcRenderer.invoke(IPC.EmbeddedPreflight),
  gitInit: (): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedGitInit),
  signIn: (): Promise<AuthSignInResult> => ipcRenderer.invoke(IPC.AuthStart),
  setAgentKey: (key: string): Promise<AgentKeySetResult> => ipcRenderer.invoke(IPC.AgentKeySet, { key }),
  start: (): Promise<EmbeddedStartResult> => ipcRenderer.invoke(IPC.EmbeddedStart),
  onStartProgress: (listener: (p: EmbeddedStartProgress) => void): (() => void) => on(IPC.EmbeddedStartProgress, listener),
  stop: (): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedStop),

  enqueue: (item: EmbeddedQueueItem): Promise<boolean> => ipcRenderer.invoke(IPC.EmbeddedEnqueue, item),
  /** False when the item wasn't in the queue: the agent has it, or it's gone. */
  removeQueued: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.EmbeddedRemoveQueued, { id }),
  setPaused: (paused: boolean): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedSetPaused, { paused }),
  runNow: (): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedRunNow),
  cancel: (): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedCancel),
  designCheck: (): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedDesignCheck),
  onAgentEvent: (listener: (e: EmbeddedAgentEvent) => void): (() => void) => on(IPC.EmbeddedAgentEvent, listener),

  gitStatus: (): Promise<(EmbeddedGitStatus & { agentFiles: string[] }) | null> => ipcRenderer.invoke(IPC.EmbeddedGitStatus),
  gitDiff: (paths?: string[]): Promise<string> => ipcRenderer.invoke(IPC.EmbeddedGitDiff, { paths }),
  accept: (message?: string): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedAccept, { message }),
  discard: (): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedDiscard),
  revert: (sha: string): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedRevert, { sha }),
  switchBranch: (name: string, create: boolean): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedSwitchBranch, { name, create }),
  push: (): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedPush),
  pull: (): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedPull),
  /** Apply the page's `data-scamp-force` marks as forced pseudo-classes. */
  syncPseudo: (): Promise<boolean> => ipcRenderer.invoke(IPC.EmbeddedSyncPseudo),
  history: (): Promise<EmbeddedHistory | null> => ipcRenderer.invoke(IPC.EmbeddedHistory),
  historyGoTo: (sha: string): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedHistoryGoTo, { sha }),
  /** Undo (or redo) what one agent run wrote. */
  undoRun: (runId: string, redo = false): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedUndoRun, { runId, redo }),
  /** Where an element's text, image, or link comes from. */
  contentOrigin: (source: string, field: EmbeddedContentField, calls: Array<{ name: string; call: string | null }>): Promise<EmbeddedContentOrigin> =>
    ipcRenderer.invoke(IPC.EmbeddedContentOrigin, { source, field, calls }),
  /** Pick an image and copy it into the project's `public/`. */
  chooseImage: (): Promise<EmbeddedChooseImageResult> => ipcRenderer.invoke(IPC.EmbeddedChooseImage),
  /** The JSX of the element written at `source`, for the code view. */
  readSource: (source: string): Promise<EmbeddedSourceLines | null> => ipcRenderer.invoke(IPC.EmbeddedReadSource, { source }),
  /** Where the order of the list an element is drawn by comes from: its JSX first, then where its component is used. */
  listOrigin: (sources: string[]): Promise<EmbeddedListOrigin | null> => ipcRenderer.invoke(IPC.EmbeddedListOrigin, { sources }),
  /** Who writes changes: Scamp's agent or the user's own, over MCP. */
  setWorker: (worker: EmbeddedWorker): Promise<EmbeddedOwnAgentStatus | null> => ipcRenderer.invoke(IPC.EmbeddedSetWorker, { worker }),
  ownAgentStatus: (): Promise<EmbeddedOwnAgentStatus | null> => ipcRenderer.invoke(IPC.EmbeddedOwnAgentStatus),
  selectionChanged: (element: EmbeddedElementRef | null): void => ipcRenderer.send(IPC.EmbeddedSelectionChanged, element),
  // A terminal in the project folder, for the user's own agent. Same channels as the main window's.
  createTerminal: (args: TerminalCreateArgs): Promise<TerminalCreateResult> => ipcRenderer.invoke(IPC.TerminalCreate, args),
  writeTerminal: (args: TerminalWriteArgs): Promise<void> => ipcRenderer.invoke(IPC.TerminalWrite, args),
  resizeTerminal: (args: TerminalResizeArgs): Promise<void> => ipcRenderer.invoke(IPC.TerminalResize, args),
  killTerminal: (args: TerminalKillArgs): Promise<void> => ipcRenderer.invoke(IPC.TerminalKill, args),
  onTerminalData: (handler: (payload: TerminalDataPayload) => void): (() => void) => on(IPC.TerminalData, handler),
  onTerminalExit: (handler: (payload: TerminalExitPayload) => void): (() => void) => on(IPC.TerminalExit, handler),
  /** Routes read from the project's files (Next.js); empty for other stacks. */
  routes: (): Promise<string[]> => ipcRenderer.invoke(IPC.EmbeddedRoutes),
  resolveSource: (raw: EmbeddedRawSource, hints: { tag: string; classes: string[]; text: string }): Promise<EmbeddedResolvedSource> =>
    ipcRenderer.invoke(IPC.EmbeddedResolveSource, { raw, hints }),
};

contextBridge.exposeInMainWorld('scampEmbedded', embeddedApi);

export type ScampEmbeddedApi = typeof embeddedApi;

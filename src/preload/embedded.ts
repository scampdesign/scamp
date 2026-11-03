import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import { IPC } from '@shared/ipcChannels';
import type {
  AgentKeySetResult,
  AuthSignInResult,
  EmbeddedAgentEvent,
  EmbeddedChooseResult,
  EmbeddedGitResult,
  EmbeddedGitStatus,
  EmbeddedPreflight,
  EmbeddedQueueItem,
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
  open: (folder: string): Promise<EmbeddedPreflight | { error: string }> => ipcRenderer.invoke(IPC.EmbeddedOpen, { folder }),
  preflight: (): Promise<EmbeddedPreflight | { error: string }> => ipcRenderer.invoke(IPC.EmbeddedPreflight),
  gitInit: (): Promise<EmbeddedGitResult> => ipcRenderer.invoke(IPC.EmbeddedGitInit),
  signIn: (): Promise<AuthSignInResult> => ipcRenderer.invoke(IPC.AuthStart),
  setAgentKey: (key: string): Promise<AgentKeySetResult> => ipcRenderer.invoke(IPC.AgentKeySet, { key }),
  start: (): Promise<EmbeddedStartResult> => ipcRenderer.invoke(IPC.EmbeddedStart),
  onStartProgress: (listener: (p: EmbeddedStartProgress) => void): (() => void) => on(IPC.EmbeddedStartProgress, listener),
  stop: (): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedStop),

  enqueue: (item: EmbeddedQueueItem): Promise<boolean> => ipcRenderer.invoke(IPC.EmbeddedEnqueue, item),
  removeQueued: (id: string): Promise<void> => ipcRenderer.invoke(IPC.EmbeddedRemoveQueued, { id }),
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
};

contextBridge.exposeInMainWorld('scampEmbedded', embeddedApi);

export type ScampEmbeddedApi = typeof embeddedApi;

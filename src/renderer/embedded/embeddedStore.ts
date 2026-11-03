import { create } from 'zustand';

import type {
  EmbeddedAgentState,
  EmbeddedEditScope,
  EmbeddedElementRef,
  EmbeddedGitStatus,
  EmbeddedPreflight,
  EmbeddedStyleChange,
} from '@shared/types';
import type { ScampElement } from '@lib/element';

/**
 * The Embedded Scamp window's own state: which screen, the running app,
 * what's selected in it, the edit being built, and the agent and git as
 * main last reported them. The panel itself runs on the canvas store,
 * loaded with a stand-in for the selection. see docs/plans/embedded-scamp-plan.md
 */

export type EmbeddedScreen = 'choose' | 'setup' | 'editor';

export type EmbeddedSelection = {
  element: EmbeddedElementRef;
  computed: Record<string, string>;
  parentDisplay: string;
  textOnly: boolean;
};

/** The edit being made on the selection, before it goes to the agent's queue. */
export type PendingEdit = {
  id: string;
  /** The stand-in as the page drew it when this edit began: what changes are measured from. */
  baseline: Record<string, ScampElement>;
  changes: EmbeddedStyleChange[];
  /** Properties set inline on the page for this edit, so they can be put back. */
  applied: string[];
  /** Properties an earlier edit (now with the agent) set on the page, which stay. */
  carried: string[];
  sent: boolean;
};

export type AgentLogEntry = { kind: 'text' | 'tool'; text: string; ok?: boolean };

export type GitView = EmbeddedGitStatus & { agentFiles: string[] };

type State = {
  screen: EmbeddedScreen;
  folder: string | null;
  preflight: EmbeddedPreflight | null;
  starting: boolean;
  startLog: string;
  startError: string | null;
  url: string | null;
  /** Where the page is now, as the webview reports it. */
  pageUrl: string | null;
  branch: string | null;
  edit: boolean;
  frozen: boolean;
  selection: EmbeddedSelection | null;
  scope: EmbeddedEditScope;
  pending: PendingEdit | null;
  agent: EmbeddedAgentState;
  agentLog: AgentLogEntry[];
  report: string | null;
  checking: boolean;
  git: GitView | null;
  notice: string | null;
};

type Actions = {
  set: (patch: Partial<State>) => void;
  appendLog: (entry: AgentLogEntry) => void;
};

export const IDLE_AGENT: EmbeddedAgentState = { phase: 'idle', paused: false, queued: [], lastText: '', lastRunItemIds: [] };

export const useEmbeddedStore = create<State & Actions>((set) => ({
  screen: 'choose',
  folder: null,
  preflight: null,
  starting: false,
  startLog: '',
  startError: null,
  url: null,
  pageUrl: null,
  branch: null,
  edit: true,
  frozen: false,
  selection: null,
  scope: 'instance',
  pending: null,
  agent: IDLE_AGENT,
  agentLog: [],
  report: null,
  checking: false,
  git: null,
  notice: null,
  set: (patch) => set(patch),
  appendLog: (entry) =>
    set((s) => {
      // Streamed text arrives in pieces: grow the last entry rather than adding one per piece.
      const last = s.agentLog[s.agentLog.length - 1];
      if (entry.kind === 'text' && last?.kind === 'text') {
        return { agentLog: [...s.agentLog.slice(0, -1), { kind: 'text', text: last.text + entry.text }] };
      }
      return { agentLog: [...s.agentLog, entry].slice(-200) };
    }),
}));

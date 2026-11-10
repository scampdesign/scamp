/**
 * Embedded Scamp's conversation with its agent, as turns: what the user
 * sent (a batch of edits, or words), and what the agent said and did in
 * reply, with the run it wrote so the turn can be undone. Pure.
 * see docs/plans/embedded-canvas-gaps.md (gap 13)
 */

export type ChatTurnStatus = 'running' | 'done' | 'error' | 'stopped' | 'undone';

export type ChatTurn =
  | { id: string; role: 'user'; lines: string[] }
  | { id: string; role: 'agent'; text: string; tools: Array<{ text: string; ok: boolean }>; status: ChatTurnStatus; runId?: string; message?: string };

type AgentTurn = Extract<ChatTurn, { role: 'agent' }>;

const LIMIT = 100;

/** A run began: the user's batch, then the agent's turn, running. */
export const startTurn = (chat: ReadonlyArray<ChatTurn>, id: string, lines: ReadonlyArray<string>): ChatTurn[] =>
  [...chat, { id: `${id}-u`, role: 'user' as const, lines: [...lines] }, { id: `${id}-a`, role: 'agent' as const, text: '', tools: [], status: 'running' as const }].slice(-LIMIT);

const updateRunning = (chat: ReadonlyArray<ChatTurn>, change: (turn: AgentTurn) => AgentTurn): ChatTurn[] => {
  const at = chat.map((t) => t.role === 'agent' && t.status === 'running').lastIndexOf(true);
  if (at === -1) return [...chat];
  return chat.map((t, i) => (i === at && t.role === 'agent' ? change(t) : t));
};

/** Streamed text, added to the running turn. */
export const addAgentText = (chat: ReadonlyArray<ChatTurn>, text: string): ChatTurn[] => updateRunning(chat, (t) => ({ ...t, text: t.text + text }));

/** A tool the agent used, in a few words. */
export const addAgentTool = (chat: ReadonlyArray<ChatTurn>, text: string, ok: boolean): ChatTurn[] =>
  updateRunning(chat, (t) => ({ ...t, tools: [...t.tools, { text, ok }] }));

/** The run ended: done, with an error, or stopped by the user. */
export const endTurn = (chat: ReadonlyArray<ChatTurn>, runId: string, status: Exclude<ChatTurnStatus, 'running' | 'undone'>, message?: string): ChatTurn[] =>
  updateRunning(chat, (t) => ({ ...t, status, runId, ...(message !== undefined ? { message } : {}) }));

/** What a turn wrote was undone, or redone. */
export const setTurnUndone = (chat: ReadonlyArray<ChatTurn>, runId: string, undone: boolean): ChatTurn[] =>
  chat.map((t) => (t.role === 'agent' && t.runId === runId ? { ...t, status: undone ? 'undone' : 'done' } : t));

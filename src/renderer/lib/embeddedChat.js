/**
 * Embedded Scamp's conversation with its agent, as turns: what the user
 * sent (a batch of edits, or words), and what the agent said and did in
 * reply, with the run it wrote so the turn can be undone. Pure.
 * see docs/plans/embedded-canvas-gaps.md (gap 13)
 */
const LIMIT = 100;
/** A run began: the user's batch, then the agent's turn, running. */
export const startTurn = (chat, id, lines) => [...chat, { id: `${id}-u`, role: 'user', lines: [...lines] }, { id: `${id}-a`, role: 'agent', text: '', tools: [], status: 'running' }].slice(-LIMIT);
const updateRunning = (chat, change) => {
    const at = chat.map((t) => t.role === 'agent' && t.status === 'running').lastIndexOf(true);
    if (at === -1)
        return [...chat];
    return chat.map((t, i) => (i === at && t.role === 'agent' ? change(t) : t));
};
/** Streamed text, added to the running turn. */
export const addAgentText = (chat, text) => updateRunning(chat, (t) => ({ ...t, text: t.text + text }));
/** A tool the agent used, in a few words. */
export const addAgentTool = (chat, text, ok) => updateRunning(chat, (t) => ({ ...t, tools: [...t.tools, { text, ok }] }));
/** The run ended: done, with an error, or stopped by the user. */
export const endTurn = (chat, runId, status, message) => updateRunning(chat, (t) => ({ ...t, status, runId, ...(message !== undefined ? { message } : {}) }));
/** What a turn wrote was undone, or redone. */
export const setTurnUndone = (chat, runId, undone) => chat.map((t) => (t.role === 'agent' && t.runId === runId ? { ...t, status: undone ? 'undone' : 'done' } : t));

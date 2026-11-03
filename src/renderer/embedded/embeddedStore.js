import { create } from 'zustand';
export const IDLE_AGENT = { phase: 'idle', paused: false, queued: [], lastText: '', lastRunItemIds: [] };
export const useEmbeddedStore = create((set) => ({
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
    appendLog: (entry) => set((s) => {
        // Streamed text arrives in pieces: grow the last entry rather than adding one per piece.
        const last = s.agentLog[s.agentLog.length - 1];
        if (entry.kind === 'text' && last?.kind === 'text') {
            return { agentLog: [...s.agentLog.slice(0, -1), { kind: 'text', text: last.text + entry.text }] };
        }
        return { agentLog: [...s.agentLog, entry].slice(-200) };
    }),
}));

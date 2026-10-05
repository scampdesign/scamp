import { create } from 'zustand';
import { agentContextLine, applyAgentEvent, startTurn, } from '@lib/agentTranscript';
import { classNameFor } from '@lib/generateCode';
import { useCanvasStore } from './canvasSlice';
let turnCounter = 0;
const newTurnId = () => {
    turnCounter += 1;
    return `turn_${Date.now().toString(36)}_${turnCounter}`;
};
/** What the agent is looking at, read from the canvas right now. */
export const currentAgentContext = () => {
    const canvas = useCanvasStore.getState();
    const target = canvas.activeComponent
        ? {
            kind: canvas.activeComponent.kind === 'view' ? 'view' : 'component',
            name: canvas.activeComponent.name,
        }
        : canvas.activePage
            ? { kind: 'page', name: canvas.activePage.name }
            : null;
    const selection = canvas.selectedElementIds.flatMap((id) => {
        const el = canvas.elements[id];
        return el === undefined ? [] : [{ className: classNameFor(el), ...(el.name ? { name: el.name } : {}) }];
    });
    return agentContextLine({ target, selection });
};
export const useAgentStore = create((set, get) => ({
    projectPath: null,
    entries: [],
    busy: false,
    sendError: null,
    send: async (text) => {
        const trimmed = text.trim();
        const projectPath = useCanvasStore.getState().projectPath;
        if (trimmed.length === 0 || !projectPath || get().busy)
            return;
        // A conversation belongs to one project; main starts a new one too.
        const entries = get().projectPath === projectPath ? get().entries : [];
        const turnId = newTurnId();
        const context = currentAgentContext();
        set({ projectPath, entries: startTurn(entries, turnId, trimmed, context), busy: true, sendError: null });
        const result = await window.scamp.agentSend({ projectPath, turnId, text: trimmed, context });
        if (!result.ok) {
            // Nothing was sent: take the message back out rather than leave a
            // reply waiting forever.
            set({ entries, busy: false, sendError: result.message });
        }
    },
    cancel: () => {
        void window.scamp.agentCancel();
    },
    reset: () => {
        void window.scamp.agentReset();
        set({ entries: [], busy: false, sendError: null });
    },
    applyEvent: (event) => {
        set((state) => ({
            entries: applyAgentEvent(state.entries, event),
            ...(event.kind === 'turn-end' ? { busy: false } : {}),
        }));
    },
}));

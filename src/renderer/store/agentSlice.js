import { create } from 'zustand';
import { cleanupRequest } from '@lib/agentCleanup';
import { agentContextLine, applyAgentEvent, startTurn, } from '@lib/agentTranscript';
import { classNameFor } from '@lib/generateCode';
import { useCanvasStore } from './canvasSlice';
import { useHistoryStore } from './historySlice';
import { useSnapshotsStore } from './snapshotsSlice';
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
/**
 * After a turn ends. The plan turn hands over to the user; the applying
 * turn ends the cleanup; anything that didn't finish ends it too, so the
 * panel never offers to apply a plan that wasn't written.
 */
export const nextCleanupPhase = (phase, event) => {
    if (event.outcome !== 'done')
        return null;
    // A reply while waiting (the user asked a question about the plan) keeps waiting.
    return phase === 'planning' || phase === 'awaiting-approval' ? 'awaiting-approval' : null;
};
const TOKEN_MODE_KEY = 'scamp.agent.tokenMode:';
/** The token mode picked last time in this project — a convenience only. */
export const rememberedTokenMode = (projectPath) => {
    try {
        const value = localStorage.getItem(TOKEN_MODE_KEY + projectPath);
        return value === 'create-tokens' || value === 'keep-literal' ? value : null;
    }
    catch {
        return null;
    }
};
const rememberTokenMode = (projectPath, mode) => {
    try {
        localStorage.setItem(TOKEN_MODE_KEY + projectPath, mode);
    }
    catch {
        // Remembering is a convenience; private windows and blocked storage are fine.
    }
};
export const useAgentStore = create((set, get) => ({
    projectPath: null,
    entries: [],
    busy: false,
    sendError: null,
    edited: false,
    lastImport: null,
    cleanupPhase: null,
    recordImport: (projectPath, viewName, report) => {
        set({ lastImport: { projectPath, viewName, report: [...report] } });
    },
    startCleanup: async (tokenMode) => {
        const lastImport = get().lastImport;
        if (lastImport === null || get().busy)
            return;
        rememberTokenMode(lastImport.projectPath, tokenMode);
        // A cleanup is its own conversation: the skill holds for all of it.
        get().reset();
        set({ cleanupPhase: 'planning' });
        await get().send(cleanupRequest(lastImport.viewName, lastImport.report), {
            skill: { id: 'import-cleanup', tokenMode },
        });
    },
    approvePlan: async () => {
        if (get().cleanupPhase !== 'awaiting-approval')
            return;
        set({ cleanupPhase: 'applying' });
        await get().send('Go ahead with the plan.');
    },
    send: async (text, options = {}) => {
        const trimmed = text.trim();
        const projectPath = useCanvasStore.getState().projectPath;
        if (trimmed.length === 0 || !projectPath || get().busy)
            return;
        // A conversation belongs to one project; main starts a new one too.
        const entries = get().projectPath === projectPath ? get().entries : [];
        const turnId = newTurnId();
        const context = currentAgentContext();
        set({ projectPath, entries: startTurn(entries, turnId, trimmed, context), busy: true, sendError: null });
        const result = await window.scamp.agentSend({
            projectPath,
            turnId,
            text: trimmed,
            context,
            ...(options.skill !== undefined ? { skill: options.skill } : {}),
        });
        if (!result.ok) {
            // Nothing was sent: take the message back out rather than leave a
            // reply waiting forever.
            set({ entries, busy: false, sendError: result.message, cleanupPhase: null });
        }
    },
    cancel: () => {
        void window.scamp.agentCancel();
    },
    reset: () => {
        void window.scamp.agentReset();
        set({ entries: [], busy: false, sendError: null, edited: false, cleanupPhase: null });
    },
    undoSession: async () => {
        const projectPath = useCanvasStore.getState().projectPath;
        if (!projectPath)
            return { ok: false, error: 'No project is open.' };
        const result = await window.scamp.agentUndoSession({ projectPath });
        if (!result.ok)
            return result;
        // A restore is a hard reset, as from the History panel: the undo stack
        // no longer lines up with the canvas.
        useHistoryStore.getState().clearAllHistory();
        void useSnapshotsStore.getState().loadSnapshots(projectPath);
        set((state) => ({
            edited: false,
            entries: [
                ...state.entries,
                { role: 'note', id: `note_${Date.now().toString(36)}`, text: 'Undid every change the agent made in this conversation.' },
            ],
        }));
        return { ok: true };
    },
    applyEvent: (event) => {
        set((state) => ({
            entries: applyAgentEvent(state.entries, event),
            ...(event.kind === 'turn-end' ? { busy: false, cleanupPhase: nextCleanupPhase(state.cleanupPhase, event) } : {}),
            // An edit that went through is what makes Undo AI session mean something.
            ...(event.kind === 'tool-end' && event.ok && event.summary !== undefined
                ? {
                    edited: true,
                    // Approved in words rather than with the button: the plan is
                    // being applied, so stop offering to apply it.
                    ...(state.cleanupPhase === 'awaiting-approval' ? { cleanupPhase: 'applying' } : {}),
                }
                : {}),
        }));
    },
}));

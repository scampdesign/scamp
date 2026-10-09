import { create } from 'zustand';
import { cleanupRequest, reactTidyRequest } from '@lib/agentCleanup';
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
/** The page, view or component open on the canvas — and so its conversation. */
export const currentConversationKey = () => {
    const canvas = useCanvasStore.getState();
    return canvas.activeComponent
        ? { kind: canvas.activeComponent.kind === 'view' ? 'view' : 'component', name: canvas.activeComponent.name }
        : canvas.activePage
            ? { kind: 'page', name: canvas.activePage.name }
            : null;
};
export const sameConversation = (a, b) => a !== null && b !== null && a.kind === b.kind && a.name === b.name;
/** What the agent is looking at, read from the canvas right now. */
export const currentAgentContext = (focus = useAgentStore.getState().focus) => {
    const canvas = useCanvasStore.getState();
    const target = currentConversationKey();
    const selection = canvas.selectedElementIds.flatMap((id) => {
        const el = canvas.elements[id];
        return el === undefined ? [] : [{ className: classNameFor(el), ...(el.name ? { name: el.name } : {}) }];
    });
    return agentContextLine({ target, selection, focus });
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
/** A skill in this conversation is planning, waiting on approval, or applying. */
export const skillAtWork = (state, conversation) => state.cleanupPhase !== null && sameConversation(state.cleanupConversation, conversation);
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
/** Each open supersedes the last, so a slow read never replaces a newer one. */
let openCounter = 0;
export const useAgentStore = create((set, get) => ({
    projectPath: null,
    conversation: null,
    entries: [],
    busy: false,
    runningTurn: null,
    focus: 'selection',
    sendError: null,
    edited: false,
    lastImport: null,
    cleanupPhase: null,
    cleanupConversation: null,
    openConversation: async (projectPath, key) => {
        openCounter += 1;
        const opened = openCounter;
        set({ projectPath, conversation: key, entries: [], edited: false, sendError: null });
        const state = await window.scamp.agentLoad({ projectPath, conversation: key });
        if (opened !== openCounter)
            return;
        set({ entries: state.entries, busy: state.busy, edited: state.canUndo });
    },
    setFocus: (focus) => set({ focus }),
    reactImport: null,
    recordReactImport: (projectPath, appName, views, notes) => {
        set({ reactImport: { projectPath, appName, views: [...views], notes: [...notes] } });
    },
    startReactTidy: async (viewName) => {
        const record = get().reactImport;
        if (record === null || !record.views.includes(viewName) || get().busy)
            return;
        const conversation = { kind: 'view', name: viewName };
        if (get().projectPath !== record.projectPath || !sameConversation(get().conversation, conversation)) {
            await get().openConversation(record.projectPath, conversation);
        }
        await get().reset();
        set({ cleanupPhase: 'planning', cleanupConversation: conversation });
        await get().send(reactTidyRequest(viewName, record.appName, record.notes), {
            skill: { id: 'react-import' },
            conversation,
        });
    },
    recordImport: (projectPath, viewName, report) => {
        set({ lastImport: { projectPath, viewName, report: [...report] } });
    },
    startCleanup: async (tokenMode) => {
        const lastImport = get().lastImport;
        if (lastImport === null || get().busy)
            return;
        rememberTokenMode(lastImport.projectPath, tokenMode);
        const conversation = { kind: 'view', name: lastImport.viewName };
        if (get().projectPath !== lastImport.projectPath || !sameConversation(get().conversation, conversation)) {
            await get().openConversation(lastImport.projectPath, conversation);
        }
        // A cleanup is its own conversation: the skill holds for all of it.
        await get().reset();
        set({ cleanupPhase: 'planning', cleanupConversation: conversation });
        await get().send(cleanupRequest(lastImport.viewName, lastImport.report), {
            skill: { id: 'import-cleanup', tokenMode },
            conversation,
        });
    },
    approvePlan: async () => {
        const conversation = get().cleanupConversation;
        if (get().cleanupPhase !== 'awaiting-approval' || conversation === null)
            return;
        set({ cleanupPhase: 'applying' });
        await get().send('Go ahead with the plan.', { conversation });
    },
    send: async (text, options = {}) => {
        const trimmed = text.trim();
        const projectPath = useCanvasStore.getState().projectPath;
        if (trimmed.length === 0 || !projectPath || get().busy)
            return;
        const conversation = options.conversation ?? currentConversationKey();
        if (conversation === null) {
            set({ sendError: 'Open a page to talk to the agent about it.' });
            return;
        }
        if (get().projectPath !== projectPath || !sameConversation(get().conversation, conversation)) {
            await get().openConversation(projectPath, conversation);
            if (get().busy)
                return;
        }
        const entries = get().entries;
        const turnId = newTurnId();
        const context = currentAgentContext();
        set({
            entries: startTurn(entries, turnId, trimmed, context),
            busy: true,
            sendError: null,
            runningTurn: { turnId, conversation },
        });
        const result = await window.scamp.agentSend({
            projectPath,
            conversation,
            turnId,
            text: trimmed,
            context,
            ...(options.skill !== undefined ? { skill: options.skill } : {}),
            // Typed after a skill finished (no plan waiting, none applying): ordinary chat.
            ...(options.skill === undefined && !skillAtWork(get(), conversation) ? { endSkill: true } : {}),
        });
        if (!result.ok) {
            // Nothing was sent: take the message back out rather than leave a
            // reply waiting forever.
            set({ entries, busy: false, sendError: result.message, cleanupPhase: null, runningTurn: null });
        }
    },
    cancel: () => {
        void window.scamp.agentCancel();
    },
    reset: async () => {
        const { projectPath, conversation } = get();
        set({ entries: [], sendError: null, edited: false, cleanupPhase: null, cleanupConversation: null });
        if (projectPath !== null && conversation !== null)
            await window.scamp.agentReset({ projectPath, conversation });
    },
    undoSession: async () => {
        const { projectPath, conversation } = get();
        if (projectPath === null || conversation === null)
            return { ok: false, error: 'No project is open.' };
        const note = 'Undid every change the agent made in this conversation.';
        const result = await window.scamp.agentUndoSession({ projectPath, conversation, note });
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
                { role: 'note', id: `note_${Date.now().toString(36)}`, text: note },
            ],
        }));
        return { ok: true };
    },
    applyEvent: (event) => {
        set((state) => ({
            entries: applyAgentEvent(state.entries, event),
            ...(event.kind === 'turn-end'
                ? {
                    busy: false,
                    runningTurn: null,
                    cleanupPhase: nextCleanupPhase(state.cleanupPhase, event),
                }
                : {}),
            // An edit that went through is what makes Undo AI session mean
            // something — in the conversation the panel shows.
            ...(event.kind === 'tool-end' &&
                event.ok &&
                event.summary !== undefined &&
                state.entries.some((entry) => entry.id === event.turnId)
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

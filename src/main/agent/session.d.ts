import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AgentEvent, AgentSendResult } from '@shared/types';
import { runTurn, type AgentToolInvoker } from './harness';
import type { AgentSkill } from './skills/skill';
import type { AgentProvider } from './provider';
/**
 * One project's conversation with the agent: its history, the turn in
 * flight, and how to stop it. One turn at a time.
 *
 * Electron-free — the IPC layer hands it a way to emit events and a way
 * to get a provider, so a test can drive it end to end.
 * see docs/plans/builtin-agent-plan.md
 */
export type AgentSessionDeps = {
    /** Null when there's no usable key. */
    getProvider: () => Promise<AgentProvider | null>;
    /** Runs a tool for a turn — edits need the turn, to undo it as one step. */
    invoke: (name: string, args: Record<string, unknown>, turnId: string) => ReturnType<AgentToolInvoker>;
    system: string;
    tools: Parameters<typeof runTurn>[0]['tools'];
    emit: (event: AgentEvent) => void;
    /** The provider rejected the key mid-conversation. */
    onKeyRejected: () => void;
    /** A conversation read back from disk, to continue. */
    initial?: {
        history: ReadonlyArray<BetaMessageParam>;
        skill: AgentSkill | null;
    };
};
export type AgentSession = {
    /**
     * `skill` starts a skill for the rest of the conversation; ignored if
     * one is already running. `endSkill` ends the running one: its work is
     * done, and this message is ordinary chat.
     */
    send: (text: string, context: string, turnId: string, options?: {
        skill?: AgentSkill;
        endSkill?: boolean;
    }) => Promise<AgentSendResult>;
    /** The skill this conversation runs, if any. */
    skill: () => AgentSkill | null;
    cancel: () => void;
    reset: () => void;
    /** A turn is in flight. */
    isBusy: () => boolean;
    /** The user's answer to a confirmation request. */
    answer: (confirmId: string, approved: boolean) => void;
    /**
     * Something the agent should know before the user's next message — that
     * its edits were undone, say. Rides in front of that message, once.
     */
    noteNextTurn: (note: string) => void;
    /** For tests. */
    history: () => ReadonlyArray<BetaMessageParam>;
    /** Resolves when the turn in flight ends. For tests. */
    idle: () => Promise<void>;
};
/** The user's words, with the lines Scamp adds in front of them. */
export declare const userContentFor: (text: string, context: string, note?: string | null) => string;
/** Told to the model when a skill's session ends and ordinary chat resumes. */
export declare const SKILL_ENDED_NOTE = "That session is over, and its instructions and limits no longer apply. You have every Scamp tool again, including edits to any view in the project; follow your standing instructions from here.";
export declare const createAgentSession: (deps: AgentSessionDeps) => AgentSession;

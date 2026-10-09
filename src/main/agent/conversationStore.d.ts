import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { type TranscriptEntry } from '@shared/agentTranscript';
import type { AgentConversationKey, AgentSkillRequest } from '@shared/types';
/**
 * Each page's, view's and component's conversation with the agent, on
 * disk in `.scamp/agent-history/` — kept in version control by every
 * scaffold, so coworkers sharing a repo share the conversations, and
 * ignored by the watcher.
 *
 * A file holds both sides: `model` is the history the model sees, kept
 * whole (thinking blocks are bound to it, so it is never trimmed or
 * edited); `transcript` is what the panel draws.
 * see docs/plans/builtin-agent-plan.md
 */
export type StoredConversation = {
    version: 1;
    model: BetaMessageParam[];
    transcript: TranscriptEntry[];
    skill: AgentSkillRequest | null;
};
export declare const AGENT_HISTORY_DIR: string;
/** A key from the renderer, checked — null if it isn't one. */
export declare const asConversationKey: (value: unknown) => AgentConversationKey | null;
/** Encoded, so a name can never reach outside the folder. */
export declare const conversationFileName: (key: AgentConversationKey) => string;
export declare const conversationPath: (projectPath: string, key: AgentConversationKey) => string;
/**
 * The saved conversation, or null when there isn't one. A file Scamp
 * can't read is moved aside rather than overwritten, so nothing is lost.
 */
export declare const loadConversation: (projectPath: string, key: AgentConversationKey) => Promise<StoredConversation | null>;
/** Written whole, through a temp file, so a crash never leaves half a file. */
export declare const saveConversation: (projectPath: string, key: AgentConversationKey, conversation: Omit<StoredConversation, "version">) => Promise<void>;
export declare const deleteConversation: (projectPath: string, key: AgentConversationKey) => Promise<void>;

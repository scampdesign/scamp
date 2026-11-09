import type { EmbeddedElementRef, EmbeddedIdiom, EmbeddedQueueItem } from '@shared/types';
import { type ToolDescriptor, type ToolInvoker } from '../mcp/protocol';
import type { EmbeddedAgent } from './agentQueue';
/**
 * The user's own agent (Claude Code, Cursor, Gemini CLI, Kiro) working
 * Embedded Scamp's queue over MCP, signed in however it already is. Scamp
 * never touches its credentials. The agent asks for work, writes it with
 * its own tools, and says when it's done; Scamp finds what it changed from
 * git, so Accept and Discard still cover exactly the agent's files.
 * see docs/plans/embedded-agent-connection-plan.md
 */
/** The longest a wait for edits holds the call open, under clients' tool timeouts. */
export declare const MAX_WAIT_SECONDS = 50;
export declare const OWN_AGENT_TOOLS: ToolDescriptor[];
/** The rules Scamp's own agent gets as its system prompt, for an agent that has its own. */
export declare const ownAgentBrief: (folder: string, idioms: ReadonlyArray<EmbeddedIdiom>, items: ReadonlyArray<EmbeddedQueueItem>) => string;
/** Each changed file's content hash, from git status: what's different from HEAD right now. */
export declare const changedFiles: (folder: string) => Promise<Map<string, string>>;
/** Files that changed between two snapshots: new, edited again, deleted, or put back. */
export declare const changedBetween: (before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>) => string[];
export type OwnAgentDeps = {
    folder: string;
    /** Known once the session starts, so read when a batch is taken. */
    idioms: () => ReadonlyArray<EmbeddedIdiom>;
    agent: () => EmbeddedAgent | null;
    selection: () => EmbeddedElementRef | null;
    /** Called when the user's agent reaches the server, for the window's status. */
    onSeen: () => void;
};
/** Answers the user's agent's tool calls against the session's queue. */
export declare const ownAgentInvoker: (deps: OwnAgentDeps) => ToolInvoker;

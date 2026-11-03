import type { EmbeddedAgentEvent, EmbeddedAgentState, EmbeddedIdiom, EmbeddedQueueItem } from '@shared/types';
import { type AgentToolInvoker } from '../agent/harness';
import type { AgentProvider } from '../agent/provider';
/**
 * Embedded Scamp's agent: always listening to a queue of edits the user
 * made on the running app, and writing them into the project's source.
 * Continuous by default (a short pause batches a burst of edits); paused,
 * the queue holds until Run now sends it all as one batch.
 * see docs/plans/embedded-scamp-plan.md
 */
export declare const BATCH_DELAY_MS = 1500;
export type EmbeddedAgentDeps = {
    folder: string;
    idioms: ReadonlyArray<EmbeddedIdiom>;
    getProvider: () => Promise<AgentProvider | null>;
    emit: (event: EmbeddedAgentEvent) => void;
    /** For tests; real runs use the project's file tools. */
    invoker?: (touched: Set<string>, readOnly: boolean) => AgentToolInvoker;
    batchDelayMs?: number;
};
export declare const embeddedSystemPrompt: (folder: string, idioms: ReadonlyArray<EmbeddedIdiom>) => string;
export type EmbeddedAgent = {
    state: () => EmbeddedAgentState;
    enqueue: (item: EmbeddedQueueItem) => void;
    remove: (id: string) => void;
    setPaused: (paused: boolean) => void;
    runNow: () => void;
    cancel: () => void;
    designCheck: () => Promise<void>;
    /** Files the agent has written since the last accept or discard. */
    touched: () => string[];
    clearTouched: (paths?: ReadonlyArray<string>) => void;
    dispose: () => void;
};
export declare const createEmbeddedAgent: (deps: EmbeddedAgentDeps) => EmbeddedAgent;

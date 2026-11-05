import type { AgentKeySetResult, AuthSignInResult, EmbeddedAgentEvent, EmbeddedChooseResult, EmbeddedGitResult, EmbeddedGitStatus, EmbeddedPreflight, EmbeddedQueueItem, EmbeddedRawSource, EmbeddedRecentProject, EmbeddedResolvedSource, EmbeddedStartProgress, EmbeddedStartResult } from '@shared/types';
declare const embeddedApi: {
    chooseFolder: () => Promise<EmbeddedChooseResult>;
    /** Recent projects, with whether each folder is still there. */
    recent: () => Promise<Array<EmbeddedRecentProject & {
        exists: boolean;
    }>>;
    forgetRecent: (folder: string) => Promise<void>;
    open: (folder: string) => Promise<EmbeddedPreflight | {
        error: string;
    }>;
    preflight: () => Promise<EmbeddedPreflight | {
        error: string;
    }>;
    gitInit: () => Promise<EmbeddedGitResult>;
    signIn: () => Promise<AuthSignInResult>;
    setAgentKey: (key: string) => Promise<AgentKeySetResult>;
    start: () => Promise<EmbeddedStartResult>;
    onStartProgress: (listener: (p: EmbeddedStartProgress) => void) => (() => void);
    stop: () => Promise<void>;
    enqueue: (item: EmbeddedQueueItem) => Promise<boolean>;
    removeQueued: (id: string) => Promise<void>;
    setPaused: (paused: boolean) => Promise<void>;
    runNow: () => Promise<void>;
    cancel: () => Promise<void>;
    designCheck: () => Promise<void>;
    onAgentEvent: (listener: (e: EmbeddedAgentEvent) => void) => (() => void);
    gitStatus: () => Promise<(EmbeddedGitStatus & {
        agentFiles: string[];
    }) | null>;
    gitDiff: (paths?: string[]) => Promise<string>;
    accept: (message?: string) => Promise<EmbeddedGitResult>;
    discard: () => Promise<EmbeddedGitResult>;
    revert: (sha: string) => Promise<EmbeddedGitResult>;
    switchBranch: (name: string, create: boolean) => Promise<EmbeddedGitResult>;
    push: () => Promise<EmbeddedGitResult>;
    pull: () => Promise<EmbeddedGitResult>;
    /** Apply the page's `data-scamp-force` marks as forced pseudo-classes. */
    syncPseudo: () => Promise<boolean>;
    /** Routes read from the project's files (Next.js); empty for other stacks. */
    routes: () => Promise<string[]>;
    resolveSource: (raw: EmbeddedRawSource, hints: {
        tag: string;
        classes: string[];
        text: string;
    }) => Promise<EmbeddedResolvedSource>;
};
export type ScampEmbeddedApi = typeof embeddedApi;
export {};

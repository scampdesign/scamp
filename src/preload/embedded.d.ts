import type { AgentKeySetResult, AuthSignInResult, EmbeddedAgentEvent, EmbeddedChooseResult, EmbeddedGitResult, EmbeddedGitStatus, EmbeddedHistory, EmbeddedPreflight, EmbeddedContentField, EmbeddedChooseImageResult, EmbeddedContentOrigin, EmbeddedElementRef, EmbeddedOwnAgentStatus, EmbeddedQueueItem, EmbeddedWorker, TerminalCreateArgs, TerminalCreateResult, TerminalDataPayload, TerminalExitPayload, TerminalKillArgs, TerminalResizeArgs, TerminalWriteArgs, EmbeddedRawSource, EmbeddedRecentProject, EmbeddedResolvedSource, EmbeddedStartProgress, EmbeddedStartResult } from '@shared/types';
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
    /** False when the item wasn't in the queue: the agent has it, or it's gone. */
    removeQueued: (id: string) => Promise<boolean>;
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
    history: () => Promise<EmbeddedHistory | null>;
    historyGoTo: (sha: string) => Promise<EmbeddedGitResult>;
    /** Undo (or redo) what one agent run wrote. */
    undoRun: (runId: string, redo?: boolean) => Promise<EmbeddedGitResult>;
    /** Where an element's text, image, or link comes from. */
    contentOrigin: (source: string, field: EmbeddedContentField, calls: Array<{
        name: string;
        call: string | null;
    }>) => Promise<EmbeddedContentOrigin>;
    /** Pick an image and copy it into the project's `public/`. */
    chooseImage: () => Promise<EmbeddedChooseImageResult>;
    /** Who writes changes: Scamp's agent or the user's own, over MCP. */
    setWorker: (worker: EmbeddedWorker) => Promise<EmbeddedOwnAgentStatus | null>;
    ownAgentStatus: () => Promise<EmbeddedOwnAgentStatus | null>;
    selectionChanged: (element: EmbeddedElementRef | null) => void;
    createTerminal: (args: TerminalCreateArgs) => Promise<TerminalCreateResult>;
    writeTerminal: (args: TerminalWriteArgs) => Promise<void>;
    resizeTerminal: (args: TerminalResizeArgs) => Promise<void>;
    killTerminal: (args: TerminalKillArgs) => Promise<void>;
    onTerminalData: (handler: (payload: TerminalDataPayload) => void) => (() => void);
    onTerminalExit: (handler: (payload: TerminalExitPayload) => void) => (() => void);
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

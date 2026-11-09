import type { EmbeddedGitResult, EmbeddedHistory } from '@shared/types';
export declare const headSha: (folder: string) => Promise<string | null>;
export declare const isAncestor: (folder: string, ancestor: string, of: string) => Promise<boolean>;
/** Where the history starts: the fork point from the usual parent branch, or HEAD now. */
export declare const historyBase: (folder: string) => Promise<string | null>;
/** The newest commit the timeline reaches: `tip`, unless the branch has moved on without it. */
export declare const currentTip: (folder: string, tip: string | null) => Promise<string | null>;
export declare const readHistory: (folder: string, base: string | null, tip: string | null) => Promise<EmbeddedHistory>;
/**
 * Move the branch to `sha`: an entry of the timeline, or its base. Refuses
 * with a code when it can't: unaccepted agent changes (`pending`), commits
 * already pushed past it (`pushed`), or the user's changes in the way
 * (`changed`).
 */
export declare const goToCommit: (folder: string, sha: string, history: {
    base: string | null;
    tip: string | null;
    pendingAgentFiles: number;
}) => Promise<EmbeddedGitResult>;

import type { EmbeddedGitResult } from '@shared/types';
/**
 * Every agent run's files, before and after, so Cmd+Z can put back what a
 * run wrote, and redo it. One record per run, for Scamp's own agent and the
 * user's alike: which files a run changed comes from git, compared with a
 * snapshot taken as it started. Undo refuses a file that changed since the
 * run, so it never throws away an edit made outside Scamp.
 * see docs/plans/embedded-canvas-gaps.md (P2)
 */
export type RunSnapshot = {
    hashes: Map<string, string>;
    contents: Map<string, Buffer | null>;
};
export type RunFile = {
    path: string;
    before: Buffer | null;
    after: Buffer | null;
};
export type RunRecord = {
    id: string;
    files: RunFile[];
};
/** What's changed from HEAD as a run starts, contents included: the run's "before" for those files. */
export declare const snapshotRun: (folder: string) => Promise<RunSnapshot>;
/** The files the run changed, with their content before it and now. */
export declare const recordRun: (folder: string, id: string, before: RunSnapshot) => Promise<RunRecord>;
export declare const undoRun: (folder: string, run: RunRecord) => Promise<EmbeddedGitResult>;
export declare const redoRun: (folder: string, run: RunRecord) => Promise<EmbeddedGitResult>;
/**
 * Discard: each file back to how it was before the first run that changed it,
 * so edits the user made before the session survive. Returns the paths it put back.
 */
export declare const discardRuns: (folder: string, runs: Iterable<RunRecord>, paths: ReadonlyArray<string>) => Promise<Set<string>>;

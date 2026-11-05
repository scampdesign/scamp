import type { EmbeddedChangedFile, EmbeddedGitResult, EmbeddedGitStatus } from '@shared/types';
/**
 * The git a designer needs, and no more: a branch to work on, what changed,
 * accept (commit), discard, revert, switch, push and pull. Git is Embedded
 * Scamp's undo: every agent write is a diff on a `scamp/` branch.
 * see docs/plans/embedded-scamp-plan.md
 */
export declare const SCAMP_BRANCH_PREFIX = "scamp/";
/** Every commit Scamp makes starts with this, so its history can be listed. */
export declare const SCAMP_COMMIT_PREFIX = "Scamp: ";
export type GitRun = {
    ok: boolean;
    stdout: string;
    stderr: string;
    code: number;
};
export declare const git: (cwd: string, args: string[], timeoutMs?: number) => Promise<GitRun>;
/** `## main...origin/main [ahead 1, behind 2]` and the entries after it. */
export declare const parseStatus: (porcelain: string) => {
    branch: string;
    ahead: number;
    behind: number;
    changed: EmbeddedChangedFile[];
};
/** `scamp/2026-11-03-1430`, unique among `existing`. */
export declare const sessionBranchName: (now: Date, existing: ReadonlyArray<string>) => string;
/** A path inside the repo, relative to it, or null for one that escapes. */
export declare const repoRelative: (folder: string, path: string) => string | null;
export declare const isRepo: (folder: string) => Promise<boolean>;
export declare const listBranches: (folder: string) => Promise<string[]>;
export declare const gitIdentity: (folder: string) => Promise<string | null>;
export declare const hasOrigin: (folder: string) => Promise<boolean>;
/** Keep Scamp's own folder, env files and installs out of every commit, without touching `.gitignore`. */
export declare const excludeFromGit: (folder: string, patterns: ReadonlyArray<string>) => Promise<void>;
export declare const ALWAYS_EXCLUDED: string[];
/** `git init` with a first commit that leaves out env files and installs. */
export declare const initRepo: (folder: string) => Promise<EmbeddedGitResult>;
export declare const gitStatus: (folder: string) => Promise<EmbeddedGitStatus>;
/** Start the session on a fresh `scamp/` branch, or keep working on the one checked out. */
export declare const ensureSessionBranch: (folder: string, now: Date) => Promise<{
    ok: true;
    branch: string;
} | {
    ok: false;
    error: string;
}>;
/** The unified diff of `paths` (all changes when empty), new files included. */
export declare const gitDiff: (folder: string, paths: ReadonlyArray<string>) => Promise<string>;
/** Accept: commit exactly these files, never anything else in the tree. */
export declare const commitFiles: (folder: string, paths: ReadonlyArray<string>, subject: string) => Promise<EmbeddedGitResult>;
/** Discard: put these files back as the last commit has them, deleting ones the agent created. */
export declare const discardFiles: (folder: string, paths: ReadonlyArray<string>) => Promise<EmbeddedGitResult>;
export declare const revertCommit: (folder: string, sha: string) => Promise<EmbeddedGitResult>;
export declare const switchBranch: (folder: string, name: string, create: boolean) => Promise<EmbeddedGitResult>;
export declare const pushBranch: (folder: string) => Promise<EmbeddedGitResult>;
export declare const pullBranch: (folder: string) => Promise<EmbeddedGitResult>;

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

import type { EmbeddedChangedFile, EmbeddedGitResult, EmbeddedGitStatus } from '@shared/types';

/**
 * The git a designer needs, and no more: a branch to work on, what changed,
 * accept (commit), discard, revert, switch, push and pull. Git is Embedded
 * Scamp's undo: every agent write is a diff on a `scamp/` branch.
 * see docs/plans/embedded-scamp-plan.md
 */

export const SCAMP_BRANCH_PREFIX = 'scamp/';
/** Every commit Scamp makes starts with this, so its history can be listed. */
export const SCAMP_COMMIT_PREFIX = 'Scamp: ';

export type GitRun = { ok: boolean; stdout: string; stderr: string; code: number };

export const git = (cwd: string, args: string[], timeoutMs = 60_000): Promise<GitRun> =>
  new Promise((done) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        // A push or pull that needs credentials fails with a message
        // instead of waiting on a prompt nobody can see.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      },
      (err, stdout, stderr) => {
        const code = err === null ? 0 : typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1;
        done({ ok: err === null, stdout: String(stdout), stderr: String(stderr), code });
      }
    );
  });

/** The last line git wrote to stderr, as a user-facing reason. */
const reason = (run: GitRun, fallback: string): string => {
  const lines = (run.stderr || run.stdout).trim().split('\n').filter((l) => l.trim().length > 0);
  return lines.at(-1)?.replace(/^(fatal|error):\s*/, '') ?? fallback;
};

/** `## main...origin/main [ahead 1, behind 2]` and the entries after it. */
export const parseStatus = (
  porcelain: string
): { branch: string; ahead: number; behind: number; changed: EmbeddedChangedFile[] } => {
  const lines = porcelain.split('\n').filter((l) => l.length > 0);
  let branch = '';
  let ahead = 0;
  let behind = 0;
  const changed: EmbeddedChangedFile[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const head = line.slice(3);
      branch = head.replace(/^No commits yet on /, '').split('...')[0]?.split(' ')[0] ?? '';
      ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0);
      behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0);
      continue;
    }
    const xy = line.slice(0, 2);
    let path = line.slice(3);
    // A rename lists `old -> new`; the file to show is the new one.
    if (path.includes(' -> ')) path = path.split(' -> ')[1] ?? path;
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    const status: EmbeddedChangedFile['status'] =
      xy === '??' ? '?' : xy.includes('D') ? 'D' : xy.includes('A') ? 'A' : 'M';
    changed.push({ path, status });
  }
  return { branch, ahead, behind, changed };
};

/** `scamp/2026-11-03-1430`, unique among `existing`. */
export const sessionBranchName = (now: Date, existing: ReadonlyArray<string>): string => {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const base = `${SCAMP_BRANCH_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
};

/** A path inside the repo, relative to it, or null for one that escapes. */
export const repoRelative = (folder: string, path: string): string | null => {
  const abs = isAbsolute(path) ? path : resolve(folder, path);
  const rel = relative(folder, abs);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel.split('\\').join('/');
};

export const isRepo = async (folder: string): Promise<boolean> =>
  (await git(folder, ['rev-parse', '--is-inside-work-tree'])).stdout.trim() === 'true';

export const listBranches = async (folder: string): Promise<string[]> => {
  const run = await git(folder, ['branch', '--format=%(refname:short)']);
  return run.ok ? run.stdout.split('\n').map((b) => b.trim()).filter((b) => b.length > 0) : [];
};

export const gitIdentity = async (folder: string): Promise<string | null> => {
  const name = (await git(folder, ['config', 'user.name'])).stdout.trim();
  const email = (await git(folder, ['config', 'user.email'])).stdout.trim();
  return name.length > 0 && email.length > 0 ? `${name} <${email}>` : null;
};

export const hasOrigin = async (folder: string): Promise<boolean> =>
  (await git(folder, ['remote'])).stdout.split('\n').some((r) => r.trim() === 'origin');

/** Keep Scamp's own folder, env files and installs out of every commit, without touching `.gitignore`. */
export const excludeFromGit = async (folder: string, patterns: ReadonlyArray<string>): Promise<void> => {
  const where = (await git(folder, ['rev-parse', '--git-path', 'info/exclude'])).stdout.trim();
  if (where.length === 0) return;
  const file = isAbsolute(where) ? where : join(folder, where);
  const current = await fs.readFile(file, 'utf-8').catch(() => '');
  const have = new Set(current.split('\n').map((l) => l.trim()));
  const missing = patterns.filter((p) => !have.has(p));
  if (missing.length === 0) return;
  await fs.mkdir(join(file, '..'), { recursive: true });
  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  await fs.appendFile(file, `${prefix}# Embedded Scamp\n${missing.join('\n')}\n`);
};

export const ALWAYS_EXCLUDED = ['.scamp/'];
const INIT_EXCLUDED = ['.scamp/', 'node_modules/', '.env', '.env.*', '!.env.example'];

/** `git init` with a first commit that leaves out env files and installs. */
export const initRepo = async (folder: string): Promise<EmbeddedGitResult> => {
  const init = await git(folder, ['init']);
  if (!init.ok) return { ok: false, error: reason(init, 'git init failed.') };
  await excludeFromGit(folder, INIT_EXCLUDED);
  await git(folder, ['add', '-A']);
  const commit = await git(folder, ['commit', '-m', 'Initial commit (by Scamp)']);
  if (!commit.ok && !/nothing to commit/.test(commit.stdout)) {
    return { ok: false, error: reason(commit, 'The first commit failed.') };
  }
  return { ok: true };
};

export const gitStatus = async (folder: string): Promise<EmbeddedGitStatus> => {
  const [status, branches, remote, log] = await Promise.all([
    git(folder, ['status', '--porcelain=v1', '-b', '--untracked-files=all']),
    listBranches(folder),
    hasOrigin(folder),
    git(folder, ['log', '-n', '30', '--format=%H%x09%s']),
  ]);
  const parsed = parseStatus(status.stdout);
  const scampCommits = log.stdout
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((p): p is [string, string] => p.length === 2 && (p[1] ?? '').startsWith(SCAMP_COMMIT_PREFIX))
    .map(([sha, subject]) => ({ sha, subject }));
  return { ...parsed, branches, hasRemote: remote, scampCommits };
};

/** Start the session on a fresh `scamp/` branch, or keep working on the one checked out. */
export const ensureSessionBranch = async (folder: string, now: Date): Promise<{ ok: true; branch: string } | { ok: false; error: string }> => {
  const current = (await git(folder, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  if (current.startsWith(SCAMP_BRANCH_PREFIX)) return { ok: true, branch: current };
  const name = sessionBranchName(now, await listBranches(folder));
  const run = await git(folder, ['switch', '-c', name]);
  return run.ok ? { ok: true, branch: name } : { ok: false, error: reason(run, 'Couldn’t create the branch.') };
};

/** The unified diff of `paths` (all changes when empty), new files included. */
export const gitDiff = async (folder: string, paths: ReadonlyArray<string>): Promise<string> => {
  const status = parseStatus((await git(folder, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths])).stdout);
  const tracked = await git(folder, ['diff', 'HEAD', '--', ...paths]);
  let out = tracked.stdout;
  for (const file of status.changed.filter((c) => c.status === '?')) {
    // Exits 1 when the files differ, which for a new file they always do.
    const added = await git(folder, ['diff', '--no-index', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', file.path]);
    out += added.stdout;
  }
  return out;
};

/** Accept: commit exactly these files, never anything else in the tree. */
export const commitFiles = async (folder: string, paths: ReadonlyArray<string>, subject: string): Promise<EmbeddedGitResult> => {
  if (paths.length === 0) return { ok: false, error: 'There is nothing to commit.' };
  const add = await git(folder, ['add', '-A', '--', ...paths]);
  if (!add.ok) return { ok: false, error: reason(add, 'Couldn’t stage the changes.') };
  const commit = await git(folder, ['commit', '-m', `${SCAMP_COMMIT_PREFIX}${subject}`, '--', ...paths]);
  return commit.ok ? { ok: true } : { ok: false, error: reason(commit, 'The commit failed.') };
};

/** Discard: put these files back as the last commit has them, deleting ones the agent created. */
export const discardFiles = async (folder: string, paths: ReadonlyArray<string>): Promise<EmbeddedGitResult> => {
  if (paths.length === 0) return { ok: true };
  const status = parseStatus((await git(folder, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths])).stdout);
  const created = status.changed.filter((c) => c.status === '?').map((c) => c.path);
  const tracked = status.changed.filter((c) => c.status !== '?').map((c) => c.path);
  if (tracked.length > 0) {
    const restore = await git(folder, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked]);
    if (!restore.ok) return { ok: false, error: reason(restore, 'Couldn’t discard the changes.') };
  }
  for (const path of created) {
    const rel = repoRelative(folder, path);
    if (rel !== null) await fs.rm(join(folder, rel), { force: true });
  }
  return { ok: true };
};

export const revertCommit = async (folder: string, sha: string): Promise<EmbeddedGitResult> => {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return { ok: false, error: 'That isn’t a commit.' };
  const run = await git(folder, ['revert', '--no-edit', sha]);
  if (run.ok) return { ok: true };
  await git(folder, ['revert', '--abort']);
  return { ok: false, error: reason(run, 'The revert didn’t apply cleanly, so nothing was changed.') };
};

const BRANCH_NAME = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,100}(?<![./])$/;

export const switchBranch = async (folder: string, name: string, create: boolean): Promise<EmbeddedGitResult> => {
  if (!BRANCH_NAME.test(name)) return { ok: false, error: 'Use letters, numbers, dashes and slashes for a branch name.' };
  const run = await git(folder, create ? ['switch', '-c', name] : ['switch', name]);
  return run.ok ? { ok: true } : { ok: false, error: reason(run, 'Couldn’t switch branches.') };
};

export const pushBranch = async (folder: string): Promise<EmbeddedGitResult> => {
  if (!(await hasOrigin(folder))) return { ok: false, error: 'This project has no remote named origin to push to.' };
  const run = await git(folder, ['push', '-u', 'origin', 'HEAD'], 120_000);
  return run.ok ? { ok: true, message: 'Pushed.' } : { ok: false, error: reason(run, 'The push failed.') };
};

export const pullBranch = async (folder: string): Promise<EmbeddedGitResult> => {
  if (!(await hasOrigin(folder))) return { ok: false, error: 'This project has no remote named origin to pull from.' };
  // Fast-forward only: a pull never writes a merge commit or leaves conflicts.
  const run = await git(folder, ['pull', '--ff-only'], 120_000);
  return run.ok ? { ok: true, message: 'Up to date.' } : { ok: false, error: reason(run, 'The pull failed.') };
};

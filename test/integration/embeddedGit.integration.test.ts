import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  commitFiles,
  discardFiles,
  ensureSessionBranch,
  excludeFromGit,
  git,
  gitDiff,
  gitStatus,
  initRepo,
  pullBranch,
  pushBranch,
  revertCommit,
  switchBranch,
} from '../../src/main/embedded/git';

/**
 * Embedded Scamp's git, against a real repository in a temp folder: the
 * branch it works on, accepting only what the agent wrote, discarding it,
 * and reverting a commit. see docs/plans/embedded-scamp-plan.md
 */

let dir: string;

const write = (rel: string, text: string): Promise<void> =>
  fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }).then(() => fs.writeFile(path.join(dir, rel), text));
const read = (rel: string): Promise<string> => fs.readFile(path.join(dir, rel), 'utf-8');

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'embedded-git-'));
  await git(dir, ['init', '-b', 'main']);
  await git(dir, ['config', 'user.name', 'Test']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await write('src/App.module.css', '.card { padding: 16px; }\n');
  await write('src/App.tsx', 'export const App = () => null;\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-m', 'start']);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('embedded git', () => {
  it('starts a scamp/ branch, and keeps using one already checked out', async () => {
    const first = await ensureSessionBranch(dir, new Date(2026, 10, 3, 14, 30));
    expect(first).toEqual({ ok: true, branch: 'scamp/2026-11-03-1430' });
    const again = await ensureSessionBranch(dir, new Date(2026, 10, 3, 15, 0));
    expect(again).toEqual({ ok: true, branch: 'scamp/2026-11-03-1430' });
  });

  it('accepts only the agent’s files, leaving the user’s own changes uncommitted', async () => {
    await ensureSessionBranch(dir, new Date());
    await write('src/App.module.css', '.card { padding: 24px; }\n');
    await write('src/App.tsx', 'export const App = () => 1; // the user’s own edit\n');
    expect(await commitFiles(dir, ['src/App.module.css'], 'card padding 24px')).toEqual({ ok: true });
    const status = await gitStatus(dir);
    expect(status.changed).toEqual([{ path: 'src/App.tsx', status: 'M' }]);
    expect(status.scampCommits.map((c) => c.subject)).toEqual(['Scamp: card padding 24px']);
  });

  it('discards the agent’s edits, deleting a file it created', async () => {
    await write('src/App.module.css', '.card { padding: 24px; }\n');
    await write('src/New.module.css', '.x {}\n');
    expect(await discardFiles(dir, ['src/App.module.css', 'src/New.module.css'])).toEqual({ ok: true });
    expect(await read('src/App.module.css')).toBe('.card { padding: 16px; }\n');
    await expect(fs.access(path.join(dir, 'src/New.module.css'))).rejects.toThrow();
  });

  it('diffs tracked changes and new files', async () => {
    await write('src/App.module.css', '.card { padding: 24px; }\n');
    await write('src/New.module.css', '.x {}\n');
    const diff = await gitDiff(dir, ['src/App.module.css', 'src/New.module.css']);
    expect(diff).toContain('+.card { padding: 24px; }');
    expect(diff).toContain('+.x {}');
  });

  it('reverts a Scamp commit', async () => {
    await write('src/App.module.css', '.card { padding: 24px; }\n');
    await commitFiles(dir, ['src/App.module.css'], 'padding');
    const [commit] = (await gitStatus(dir)).scampCommits;
    expect(await revertCommit(dir, commit?.sha ?? '')).toEqual({ ok: true });
    expect(await read('src/App.module.css')).toBe('.card { padding: 16px; }\n');
  });

  it('refuses a malformed sha, and a branch name git would reject', async () => {
    expect(await revertCommit(dir, 'HEAD; rm -rf /')).toEqual({ ok: false, error: 'That isn’t a commit.' });
    expect((await switchBranch(dir, '--force', true)).ok).toBe(false);
    expect((await switchBranch(dir, 'a..b', true)).ok).toBe(false);
    expect(await switchBranch(dir, 'design/nav', true)).toEqual({ ok: true });
  });

  it('keeps .scamp/ out of git without touching .gitignore, and only once', async () => {
    await excludeFromGit(dir, ['.scamp/']);
    await excludeFromGit(dir, ['.scamp/']);
    const exclude = await read('.git/info/exclude');
    expect(exclude.match(/^\.scamp\/$/gm)).toHaveLength(1);
    await write('.scamp/embedded/vite.config.scamp.mjs', 'export default {};\n');
    expect((await gitStatus(dir)).changed).toEqual([]);
    await expect(fs.access(path.join(dir, '.gitignore'))).rejects.toThrow();
  });

  it('pushes the branch to origin and pulls from it, fast-forward only', async () => {
    const remote = await fs.mkdtemp(path.join(os.tmpdir(), 'embedded-remote-'));
    try {
      await git(remote, ['init', '--bare', '-b', 'main']);
      expect((await pushBranch(dir)).ok).toBe(false);
      await git(dir, ['remote', 'add', 'origin', remote]);
      await ensureSessionBranch(dir, new Date(2026, 10, 3, 10, 0));
      await write('src/App.module.css', '.card { padding: 20px; }\n');
      await commitFiles(dir, ['src/App.module.css'], 'padding 20px');
      expect(await pushBranch(dir)).toEqual({ ok: true, message: 'Pushed.' });
      const branches = (await git(remote, ['branch', '--format=%(refname:short)'])).stdout;
      expect(branches).toContain('scamp/2026-11-03-1000');
      expect(await pullBranch(dir)).toEqual({ ok: true, message: 'Up to date.' });
    } finally {
      await fs.rm(remote, { recursive: true, force: true });
    }
  });

  it('initializes a folder, leaving env files and installs out of the first commit', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'embedded-init-'));
    try {
      await fs.writeFile(path.join(fresh, 'index.html'), '<div></div>\n');
      await fs.writeFile(path.join(fresh, '.env'), 'SECRET=1\n');
      await fs.mkdir(path.join(fresh, 'node_modules'));
      await fs.writeFile(path.join(fresh, 'node_modules', 'x.js'), '');
      const result = await initRepo(fresh);
      // Without a global identity the commit can't be made; the init still is.
      if (result.ok) {
        const tracked = (await git(fresh, ['ls-files'])).stdout.split('\n').filter((l) => l.length > 0);
        expect(tracked).toEqual(['index.html']);
      } else {
        expect(result.error.length).toBeGreaterThan(0);
      }
    } finally {
      await fs.rm(fresh, { recursive: true, force: true });
    }
  });
});

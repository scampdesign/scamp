import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commitFiles } from '../../src/main/embedded/git';
import { goToCommit, headSha, historyBase, readHistory } from '../../src/main/embedded/history';
import { recordRun, redoRun, snapshotRun, undoRun } from '../../src/main/embedded/runs';

/**
 * The session's history and run records on a real repository: going back
 * and forward through Scamp's commits without losing the newer ones, the
 * refusals (unaccepted changes, pushed commits, the user's own changes in
 * the way), and undoing and redoing what one agent run wrote.
 */

const gitIn = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

const css = (dir: string): string => path.join(dir, 'src', 'Card.module.css');

describe('history', () => {
  let dir: string;
  let base: string | null;

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-history-')));
    await fs.mkdir(path.join(dir, 'src'));
    await fs.writeFile(css(dir), '.card { padding: 16px; }\n');
    gitIn(dir, 'init', '-q', '-b', 'main');
    gitIn(dir, 'add', '.');
    gitIn(dir, 'commit', '-q', '-m', 'init');
    gitIn(dir, 'switch', '-q', '-c', 'scamp/session');
    base = await historyBase(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const accept = async (padding: string, change: string): Promise<string> => {
    await fs.writeFile(css(dir), `.card { padding: ${padding}; }\n`);
    expect(await commitFiles(dir, ['src/Card.module.css'], change, `- ${change}`)).toEqual({ ok: true });
    return (await headSha(dir)) ?? '';
  };

  it('starts at the fork from main, and lists each Accept with its changes and files', async () => {
    await accept('24px', '<div> padding → 24px (all)');
    const history = await readHistory(dir, base, await headSha(dir));
    expect(history.atBase).toBe(false);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ subject: 'Scamp: <div> padding → 24px (all)', changes: [{ text: '<div> padding → 24px (all)', detail: '' }], files: ['src/Card.module.css'], current: true, undone: false });
  });

  it('goes back, keeps the newer steps reachable as undone, and goes forward again', async () => {
    const first = await accept('24px', 'first');
    const second = await accept('32px', 'second');
    const tip = second;
    expect(await goToCommit(dir, first, { base, tip, pendingAgentFiles: 0 })).toEqual({ ok: true });
    expect(await fs.readFile(css(dir), 'utf8')).toContain('24px');
    let history = await readHistory(dir, base, tip);
    expect(history.entries.map((e) => [e.subject, e.current, e.undone])).toEqual([
      ['Scamp: second', false, true],
      ['Scamp: first', true, false],
    ]);
    expect(await goToCommit(dir, base ?? '', { base, tip, pendingAgentFiles: 0 })).toEqual({ ok: true });
    expect(await fs.readFile(css(dir), 'utf8')).toContain('16px');
    history = await readHistory(dir, base, tip);
    expect(history.atBase).toBe(true);
    expect(await goToCommit(dir, second, { base, tip, pendingAgentFiles: 0 })).toEqual({ ok: true });
    expect(await fs.readFile(css(dir), 'utf8')).toContain('32px');
  });

  it('drops the undone steps once a new commit is made from an earlier point', async () => {
    const first = await accept('24px', 'first');
    const second = await accept('32px', 'second');
    await goToCommit(dir, first, { base, tip: second, pendingAgentFiles: 0 });
    const third = await accept('40px', 'third');
    // The tip is the new commit now; the old second step is off this line.
    const history = await readHistory(dir, base, third);
    expect(history.entries.map((e) => e.subject)).toEqual(['Scamp: third', 'Scamp: first']);
    expect((await goToCommit(dir, second, { base, tip: third, pendingAgentFiles: 0 })).ok).toBe(false);
  });

  it('refuses while the agent has unaccepted changes', async () => {
    const first = await accept('24px', 'first');
    expect(await goToCommit(dir, base ?? '', { base, tip: first, pendingAgentFiles: 1 })).toMatchObject({ ok: false, code: 'pending' });
  });

  it('refuses to go back past what was pushed, so nothing pushed is rewritten', async () => {
    const remote = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-history-remote-')));
    try {
      gitIn(remote, 'init', '-q', '--bare');
      gitIn(dir, 'remote', 'add', 'origin', remote);
      const first = await accept('24px', 'first');
      gitIn(dir, 'push', '-q', '-u', 'origin', 'scamp/session');
      expect(await goToCommit(dir, base ?? '', { base, tip: first, pendingAgentFiles: 0 })).toMatchObject({ ok: false, code: 'pushed' });
      expect(await fs.readFile(css(dir), 'utf8')).toContain('24px');
    } finally {
      await fs.rm(remote, { recursive: true, force: true });
    }
  });

  it('keeps the user’s own uncommitted changes, and refuses when they’re in the way', async () => {
    await fs.writeFile(path.join(dir, 'src', 'notes.txt'), 'mine\n');
    gitIn(dir, 'add', 'src/notes.txt');
    gitIn(dir, 'commit', '-q', '-m', 'notes');
    const notes = (await headSha(dir)) ?? '';
    const first = await accept('24px', 'first');
    // An edit in a file the step doesn't change survives the move.
    await fs.writeFile(path.join(dir, 'src', 'notes.txt'), 'mine, edited\n');
    expect(await goToCommit(dir, notes, { base, tip: first, pendingAgentFiles: 0 })).toEqual({ ok: true });
    expect(await fs.readFile(path.join(dir, 'src', 'notes.txt'), 'utf8')).toBe('mine, edited\n');
    // An edit in the file the step changes stops it.
    await fs.writeFile(css(dir), '.card { padding: 99px; }\n');
    expect(await goToCommit(dir, first, { base, tip: first, pendingAgentFiles: 0 })).toMatchObject({ ok: false, code: 'changed' });
    expect(await fs.readFile(css(dir), 'utf8')).toContain('99px');
  });

  it('refuses a commit outside the session’s history', async () => {
    const first = await accept('24px', 'first');
    expect((await goToCommit(dir, 'not-a-sha', { base, tip: first, pendingAgentFiles: 0 })).ok).toBe(false);
    expect((await goToCommit(dir, '0'.repeat(40), { base, tip: first, pendingAgentFiles: 0 })).ok).toBe(false);
  });
});

describe('run records', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-runs-')));
    await fs.mkdir(path.join(dir, 'src'));
    await fs.writeFile(css(dir), '.card { padding: 16px; }\n');
    await fs.writeFile(path.join(dir, 'src', 'logo.bin'), Buffer.from([0, 1, 2, 255]));
    await fs.writeFile(path.join(dir, 'src', 'old.css'), '.old {}\n');
    gitIn(dir, 'init', '-q');
    gitIn(dir, 'add', '.');
    gitIn(dir, 'commit', '-q', '-m', 'init');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('records what one run changed, undoes it exactly, and redoes it', async () => {
    // The user's own change before the run: not the run's.
    await fs.writeFile(path.join(dir, 'README.md'), 'mine\n');
    const before = await snapshotRun(dir);
    await fs.writeFile(css(dir), '.card { padding: 24px; }\n');
    await fs.writeFile(path.join(dir, 'src', 'logo.bin'), Buffer.from([9, 9]));
    await fs.writeFile(path.join(dir, 'src', 'tokens.css'), ':root {}\n');
    await fs.rm(path.join(dir, 'src', 'old.css'));
    const run = await recordRun(dir, 'run-1', before);
    expect(run.files.map((f) => f.path)).toEqual(['src/Card.module.css', 'src/logo.bin', 'src/old.css', 'src/tokens.css']);

    expect(await undoRun(dir, run)).toEqual({ ok: true });
    expect(await fs.readFile(css(dir), 'utf8')).toBe('.card { padding: 16px; }\n');
    expect([...(await fs.readFile(path.join(dir, 'src', 'logo.bin')))]).toEqual([0, 1, 2, 255]);
    expect(await fs.readFile(path.join(dir, 'src', 'old.css'), 'utf8')).toBe('.old {}\n');
    await expect(fs.access(path.join(dir, 'src', 'tokens.css'))).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, 'README.md'), 'utf8')).toBe('mine\n');

    expect(await redoRun(dir, run)).toEqual({ ok: true });
    expect(await fs.readFile(css(dir), 'utf8')).toBe('.card { padding: 24px; }\n');
    expect(await fs.readFile(path.join(dir, 'src', 'tokens.css'), 'utf8')).toBe(':root {}\n');
    await expect(fs.access(path.join(dir, 'src', 'old.css'))).rejects.toThrow();
  });

  it('takes a file the user had changed before the run back to their version, not HEAD’s', async () => {
    await fs.writeFile(css(dir), '.card { padding: 20px; }\n');
    const before = await snapshotRun(dir);
    await fs.writeFile(css(dir), '.card { padding: 24px; }\n');
    const run = await recordRun(dir, 'run-2', before);
    await undoRun(dir, run);
    expect(await fs.readFile(css(dir), 'utf8')).toBe('.card { padding: 20px; }\n');
  });

  it('refuses, changing nothing, when a file changed since the run', async () => {
    const before = await snapshotRun(dir);
    await fs.writeFile(css(dir), '.card { padding: 24px; }\n');
    await fs.writeFile(path.join(dir, 'src', 'tokens.css'), ':root {}\n');
    const run = await recordRun(dir, 'run-3', before);
    await fs.writeFile(css(dir), '.card { padding: 99px; }\n');
    const result = await undoRun(dir, run);
    expect(result).toMatchObject({ ok: false, code: 'changed' });
    expect(result.ok ? '' : result.error).toContain('src/Card.module.css');
    expect(await fs.readFile(path.join(dir, 'src', 'tokens.css'), 'utf8')).toBe(':root {}\n');
  });
});

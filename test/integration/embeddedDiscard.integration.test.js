import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { discardFiles, gitDiff, gitStatus } from '../../src/main/embedded/git';
import { discardRuns, recordRun, snapshotRun } from '../../src/main/embedded/runs';
const git = (cwd, ...args) => {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' });
};
describe('embedded discard', () => {
    let repo;
    let project;
    beforeEach(async () => {
        repo = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-discard-'));
        // A monorepo: the project is a subfolder of the repository.
        project = path.join(repo, 'apps', 'web');
        await fs.mkdir(path.join(project, 'src'), { recursive: true });
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'committed\n');
        git(repo, 'init', '-q');
        git(repo, 'add', '.');
        git(repo, 'commit', '-qm', 'init');
    });
    afterEach(async () => {
        await fs.rm(repo, { recursive: true, force: true });
    });
    it('lists changed files from the project folder, not the repository root', async () => {
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'changed\n');
        const status = await gitStatus(project);
        expect(status.changed).toEqual([{ path: 'src/a.css', status: 'M' }]);
    });
    it('discards a tracked edit and deletes a new file in a subfolder project', async () => {
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'agent\n');
        await fs.writeFile(path.join(project, 'src', 'new.css'), 'agent\n');
        const result = await discardFiles(project, ['src/a.css', 'src/new.css']);
        expect(result).toEqual({ ok: true });
        expect(await fs.readFile(path.join(project, 'src', 'a.css'), 'utf-8')).toBe('committed\n');
        await expect(fs.access(path.join(project, 'src', 'new.css'))).rejects.toThrow();
    });
    it('includes a new file in the diff of a subfolder project', async () => {
        await fs.writeFile(path.join(project, 'src', 'new.css'), 'agent\n');
        expect(await gitDiff(project, ['src/new.css'])).toContain('+agent');
    });
    it('puts back the user’s uncommitted edits and untracked files, not HEAD', async () => {
        // Before the session: a hand edit, and a file never committed.
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'hand edit\n');
        await fs.writeFile(path.join(project, 'src', 'mine.css'), 'mine\n');
        const before = await snapshotRun(project);
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'agent\n');
        await fs.writeFile(path.join(project, 'src', 'mine.css'), 'agent\n');
        await fs.writeFile(path.join(project, 'src', 'created.css'), 'agent\n');
        const run = await recordRun(project, 'r1', before);
        const touched = ['src/a.css', 'src/mine.css', 'src/created.css'];
        const putBack = await discardRuns(project, [run], touched);
        expect([...putBack].sort()).toEqual(touched.slice().sort());
        expect(await fs.readFile(path.join(project, 'src', 'a.css'), 'utf-8')).toBe('hand edit\n');
        expect(await fs.readFile(path.join(project, 'src', 'mine.css'), 'utf-8')).toBe('mine\n');
        await expect(fs.access(path.join(project, 'src', 'created.css'))).rejects.toThrow();
    });
    it('uses the earliest run’s content when several runs changed a file', async () => {
        const first = await snapshotRun(project);
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'run one\n');
        const runOne = await recordRun(project, 'r1', first);
        const second = await snapshotRun(project);
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'run two\n');
        const runTwo = await recordRun(project, 'r2', second);
        await discardRuns(project, [runOne, runTwo], ['src/a.css']);
        expect(await fs.readFile(path.join(project, 'src', 'a.css'), 'utf-8')).toBe('committed\n');
    });
    it('leaves files that are not in the touched list alone', async () => {
        const before = await snapshotRun(project);
        await fs.writeFile(path.join(project, 'src', 'a.css'), 'run\n');
        const run = await recordRun(project, 'r1', before);
        const putBack = await discardRuns(project, [run], []);
        expect(putBack.size).toBe(0);
        expect(await fs.readFile(path.join(project, 'src', 'a.css'), 'utf-8')).toBe('run\n');
    });
});

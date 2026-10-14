import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { contextFilePath, writeContextFile, } from '../../src/main/ipc/contextOps';
/**
 * The context file write itself. Real filesystem, no mocks — the things
 * worth checking here are the ones a unit test can't see: that the
 * `.scamp/` folder gets created, that a second write replaces rather than
 * appends, and that a failure stays silent.
 * see docs/archive/2026-08-05-live-context-file-plan.md
 */
describe('context file write', () => {
    let projectDir;
    beforeEach(async () => {
        projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-context-'));
    });
    afterEach(async () => {
        await fs.rm(projectDir, { recursive: true, force: true });
    });
    it('writes to .scamp/context.md inside the project', async () => {
        await writeContextFile({ projectPath: projectDir, content: '# hello\n' });
        const written = await fs.readFile(path.join(projectDir, '.scamp', 'context.md'), 'utf-8');
        expect(written).toBe('# hello\n');
    });
    it('creates the .scamp directory when it does not exist yet', async () => {
        // A fresh project has no `.scamp/` until something writes there.
        await expect(fs.access(path.join(projectDir, '.scamp'))).rejects.toThrow();
        await writeContextFile({ projectPath: projectDir, content: 'x' });
        await expect(fs.access(path.join(projectDir, '.scamp'))).resolves.toBeUndefined();
    });
    it('replaces the file rather than appending', async () => {
        await writeContextFile({ projectPath: projectDir, content: 'first\n' });
        await writeContextFile({ projectPath: projectDir, content: 'second\n' });
        const written = await fs.readFile(contextFilePath(projectDir), 'utf-8');
        expect(written).toBe('second\n');
    });
    it('leaves an existing .scamp folder and its contents alone', async () => {
        // Snapshots and component thumbnails live here too.
        const snapshots = path.join(projectDir, '.scamp', 'snapshots');
        await fs.mkdir(snapshots, { recursive: true });
        await fs.writeFile(path.join(snapshots, 'keep.txt'), 'keep', 'utf-8');
        await writeContextFile({ projectPath: projectDir, content: 'x' });
        expect(await fs.readFile(path.join(snapshots, 'keep.txt'), 'utf-8')).toBe('keep');
    });
    it('stays silent when the project folder is gone', async () => {
        // The user can delete or unmount the folder mid-session. A failed
        // context write is never worth surfacing — the next selection retries.
        await fs.rm(projectDir, { recursive: true, force: true });
        await expect(writeContextFile({ projectPath: projectDir, content: 'x' })).resolves.toBeUndefined();
    });
    it('stays silent when the target path is not writable', async () => {
        // `.scamp` already exists as a FILE, so mkdir and write both fail.
        await fs.writeFile(path.join(projectDir, '.scamp'), 'not a dir', 'utf-8');
        await expect(writeContextFile({ projectPath: projectDir, content: 'x' })).resolves.toBeUndefined();
    });
});

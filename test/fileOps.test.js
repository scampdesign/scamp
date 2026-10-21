import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { atomicWrite, writePagePair } from '../src/main/ipc/fileOps';
const tmpFiles = async (dir) => (await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'));
const errnoError = (code) => {
    const err = new Error(code);
    err.code = code;
    return err;
};
/** Force the Windows code path regardless of the host running the test. */
const withWin32 = async (fn) => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
        await fn();
    }
    finally {
        if (original)
            Object.defineProperty(process, 'platform', original);
    }
};
describe('atomicWrite', () => {
    let dir;
    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-ops-'));
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true });
    });
    it('writes the content to the target path', async () => {
        const target = path.join(dir, 'page.tsx');
        await atomicWrite(target, 'hello');
        expect(await fs.readFile(target, 'utf-8')).toBe('hello');
    });
    it('overwrites existing content', async () => {
        const target = path.join(dir, 'home.module.css');
        await atomicWrite(target, 'first');
        await atomicWrite(target, 'second');
        expect(await fs.readFile(target, 'utf-8')).toBe('second');
    });
    it('leaves no .tmp file behind after a successful write', async () => {
        await atomicWrite(path.join(dir, 'a.tsx'), 'x');
        expect(await tmpFiles(dir)).toEqual([]);
    });
    describe('Windows transient rename lock', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });
        it('retries the rename when it fails with a transient EPERM, then succeeds', async () => {
            await withWin32(async () => {
                const target = path.join(dir, 'home.module.css');
                const realRename = fs.rename.bind(fs);
                let calls = 0;
                const spy = vi
                    .spyOn(fs, 'rename')
                    .mockImplementation(async (from, to) => {
                    calls += 1;
                    if (calls <= 2)
                        throw errnoError('EPERM');
                    return realRename(from, to);
                });
                await atomicWrite(target, 'after-retry');
                expect(spy).toHaveBeenCalledTimes(3);
                expect(await fs.readFile(target, 'utf-8')).toBe('after-retry');
                expect(await tmpFiles(dir)).toEqual([]);
            });
        });
        it('rethrows and cleans up the .tmp when retries are exhausted', async () => {
            await withWin32(async () => {
                const target = path.join(dir, 'home.module.css');
                vi.spyOn(fs, 'rename').mockImplementation(async () => {
                    throw errnoError('EPERM');
                });
                await expect(atomicWrite(target, 'never-lands')).rejects.toThrow('EPERM');
                expect(await tmpFiles(dir)).toEqual([]);
                await expect(fs.access(target)).rejects.toThrow();
            });
        });
        it('does not retry a non-transient error and cleans up the .tmp', async () => {
            await withWin32(async () => {
                const target = path.join(dir, 'home.module.css');
                const spy = vi.spyOn(fs, 'rename').mockImplementation(async () => {
                    throw errnoError('ENOENT');
                });
                await expect(atomicWrite(target, 'nope')).rejects.toThrow('ENOENT');
                expect(spy).toHaveBeenCalledTimes(1);
                expect(await tmpFiles(dir)).toEqual([]);
            });
        });
    });
});
describe('writePagePair', () => {
    // A failed CSS write used to leave the new TSX on disk beside the old
    // CSS, and the canvas loaded that mix. see docs/audits/2026-10-20-repo-audit.md, finding 12
    let dir;
    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-pair-'));
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });
    it('writes both files', async () => {
        const tsx = path.join(dir, 'home.tsx');
        const css = path.join(dir, 'home.module.css');
        await writePagePair(tsx, 'new tsx', css, 'new css');
        expect(await fs.readFile(tsx, 'utf-8')).toBe('new tsx');
        expect(await fs.readFile(css, 'utf-8')).toBe('new css');
    });
    it('puts the TSX back when the CSS can’t be written', async () => {
        const tsx = path.join(dir, 'home.tsx');
        await fs.writeFile(tsx, 'old tsx');
        // Its folder doesn't exist, so the CSS write fails.
        const css = path.join(dir, 'missing', 'home.module.css');
        await expect(writePagePair(tsx, 'new tsx', css, 'new css')).rejects.toThrow();
        expect(await fs.readFile(tsx, 'utf-8')).toBe('old tsx');
        expect(await tmpFiles(dir)).toEqual([]);
    });
    it('removes a TSX that didn’t exist before when the CSS can’t be written', async () => {
        const tsx = path.join(dir, 'new.tsx');
        const css = path.join(dir, 'missing', 'new.module.css');
        await expect(writePagePair(tsx, 'new tsx', css, 'new css')).rejects.toThrow();
        await expect(fs.access(tsx)).rejects.toThrow();
    });
});

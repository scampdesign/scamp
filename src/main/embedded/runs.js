import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { changedBetween, changedFiles } from './ownAgent';
const read = (path) => fs.readFile(path).catch(() => null);
/** A file as HEAD has it, or null when HEAD has no such file. */
const headContent = (folder, path) => new Promise((done) => {
    execFile('git', ['show', `HEAD:./${path}`], { cwd: folder, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        done(err === null ? stdout : null);
    });
});
/** What's changed from HEAD as a run starts, contents included: the run's "before" for those files. */
export const snapshotRun = async (folder) => {
    const hashes = await changedFiles(folder);
    const contents = new Map();
    for (const path of hashes.keys())
        contents.set(path, await read(join(folder, path)));
    return { hashes, contents };
};
/** The files the run changed, with their content before it and now. */
export const recordRun = async (folder, id, before) => {
    const changed = changedBetween(before.hashes, await changedFiles(folder));
    const files = [];
    for (const path of changed) {
        const was = before.contents.has(path) ? (before.contents.get(path) ?? null) : await headContent(folder, path);
        files.push({ path, before: was, after: await read(join(folder, path)) });
    }
    return { id, files };
};
const same = (a, b) => (a === null || b === null ? a === b : a.equals(b));
const put = async (path, content) => {
    if (content === null) {
        await fs.rm(path, { force: true });
        return;
    }
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, content);
};
/** Put each file of the run back to `from` → `to`, if every one is still as the run left it. */
const swap = async (folder, run, direction) => {
    const expect = (f) => (direction === 'undo' ? f.after : f.before);
    const changed = [];
    for (const f of run.files)
        if (!same(await read(join(folder, f.path)), expect(f)))
            changed.push(f.path);
    if (changed.length > 0) {
        return { ok: false, code: 'changed', error: `${changed.join(', ')} changed since, so Scamp left ${changed.length === 1 ? 'it' : 'them'} as ${changed.length === 1 ? 'it is' : 'they are'}.` };
    }
    for (const f of run.files)
        await put(join(folder, f.path), direction === 'undo' ? f.before : f.after);
    return { ok: true };
};
export const undoRun = (folder, run) => swap(folder, run, 'undo');
export const redoRun = (folder, run) => swap(folder, run, 'redo');
/**
 * Discard: each file back to how it was before the first run that changed it,
 * so edits the user made before the session survive. Returns the paths it put back.
 */
export const discardRuns = async (folder, runs, paths) => {
    const wanted = new Set(paths);
    const first = new Map();
    for (const run of runs)
        for (const f of run.files)
            if (wanted.has(f.path) && !first.has(f.path))
                first.set(f.path, f.before);
    for (const [path, content] of first)
        await put(join(folder, path), content);
    return new Set(first.keys());
};

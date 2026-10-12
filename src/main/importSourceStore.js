import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
/**
 * The original of an imported page, kept where an agent can read it.
 *
 * An import is a lossy translation into a model far more constrained
 * than a browser, and the report says what was changed but not what the
 * page originally said. Keeping the source next to the result turns
 * "why is this element like this?" from a guess into a lookup — the
 * agent can read the rule that produced a layout instead of inferring
 * one from the output.
 *
 * Deliberately NOT in the project. This is scratch: a copy of somebody
 * else's page, useful while the import is being tidied up and noise
 * afterwards. It lives in the OS temp directory and goes when the
 * project closes, so nothing about it ever reaches a commit.
 * see docs/notes/import-source-store.md
 */
/** Everything this process has written, so it can all be removed. */
const roots = new Set();
let activeProject = null;
const BASE = join(tmpdir(), 'scamp-import-source');
/** One directory per project path, named by hash so it cannot collide. */
const rootFor = (projectPath) => join(BASE, createHash('sha256').update(projectPath).digest('hex').slice(0, 16));
/**
 * Make sure the base is this account's alone. On Linux `/tmp` is shared
 * and the name is predictable, so another account could create it first
 * and plant records, or read the pages kept here.
 */
const ensurePrivateBase = async () => {
    await fs.mkdir(BASE, { recursive: true, mode: 0o700 });
    const st = await fs.lstat(BASE);
    const ours = process.getuid === undefined || st.uid === process.getuid();
    if (!st.isDirectory() || !ours) {
        throw new Error(`${BASE} belongs to another user; import sources aren't kept.`);
    }
    // Folders made by earlier versions were readable by everyone.
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0)
        await fs.chmod(BASE, 0o700);
};
/** A view name as a single safe path segment. */
const safeName = (name) => name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
const metaPath = (dir) => join(dir, 'source.json');
/**
 * Point the store at a project, removing whatever the last one left.
 *
 * Called where a project opens. "The project is closed" and "a
 * different project opened" are the same event from here, and the app
 * only ever has one open at a time.
 */
export const setActiveImportProject = async (projectPath) => {
    if (activeProject !== null && activeProject !== projectPath) {
        await disposeImportSources(activeProject);
    }
    activeProject = projectPath;
};
/** Write one page's original beside the view it became. */
export const saveImportSource = async (projectPath, view, url, source) => {
    await ensurePrivateBase();
    const dir = join(rootFor(projectPath), safeName(view));
    await fs.mkdir(dir, { recursive: true });
    const htmlPath = join(dir, 'page.html');
    const cssPath = join(dir, 'styles.css');
    await fs.writeFile(htmlPath, source.html, 'utf-8');
    await fs.writeFile(cssPath, source.css, 'utf-8');
    const stored = {
        view,
        htmlPath,
        cssPath,
        htmlBytes: Buffer.byteLength(source.html, 'utf-8'),
        cssBytes: Buffer.byteLength(source.css, 'utf-8'),
        url,
        unreadable: source.unreadable,
        truncated: source.truncated,
    };
    await fs.writeFile(metaPath(dir), JSON.stringify(stored, null, 2), 'utf-8');
    roots.add(rootFor(projectPath));
    return stored;
};
/** Every original kept for this project, newest first. */
export const listImportSources = async (projectPath) => {
    await ensurePrivateBase();
    const root = rootFor(projectPath);
    let names;
    try {
        names = await fs.readdir(root);
    }
    catch {
        return [];
    }
    const out = [];
    for (const name of names) {
        const file = metaPath(join(root, name));
        try {
            const [raw, stat] = await Promise.all([fs.readFile(file, 'utf-8'), fs.stat(file)]);
            out.push({ stored: JSON.parse(raw), at: stat.mtimeMs });
        }
        catch {
            // A half-written or hand-deleted entry is not worth failing over.
        }
    }
    return out.sort((a, b) => b.at - a.at).map((entry) => entry.stored);
};
/** One original's text, and how much of it there was. */
export const readImportSource = async (projectPath, view, part, limit) => {
    await ensurePrivateBase();
    const dir = join(rootFor(projectPath), safeName(view));
    let stored;
    try {
        stored = JSON.parse(await fs.readFile(metaPath(dir), 'utf-8'));
    }
    catch {
        return null;
    }
    // The fixed names, never the record's paths: a record is only as
    // trustworthy as whoever wrote it.
    const full = await fs.readFile(join(dir, part === 'html' ? 'page.html' : 'styles.css'), 'utf-8');
    return { stored, text: full.slice(0, limit), truncated: full.length > limit };
};
/** Remove one project's originals, or everything this process wrote. */
export const disposeImportSources = async (projectPath) => {
    const targets = projectPath === undefined ? [...roots] : [rootFor(projectPath)];
    await Promise.all(targets.map(async (dir) => {
        try {
            await fs.rm(dir, { recursive: true, force: true });
        }
        catch {
            // Temp cleanup is best-effort: the OS clears the directory
            // eventually, and failing here must not block a project close.
        }
        roots.delete(dir);
    }));
    if (projectPath === undefined)
        activeProject = null;
};

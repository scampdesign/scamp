import { promises as fs } from 'fs';
import { extname, join, relative, resolve } from 'path';
import { parseCallSite } from '@shared/reactSource';
/**
 * `.scamp/react-import.json`: where each element of a React import came
 * from. Electron-free; the IPC layer supplies the app's folder.
 * see docs/plans/react-import-plan.md
 */
export const RECORD_FILE = join('.scamp', 'react-import.json');
const empty = (name, folder) => ({
    version: 1,
    app: { name, folder },
    views: {},
    components: {},
});
const isRecord = (value) => {
    if (value === null || typeof value !== 'object')
        return false;
    const v = value;
    return v['version'] === 1 && typeof v['views'] === 'object' && typeof v['components'] === 'object';
};
export const readRecord = async (projectPath) => {
    try {
        const parsed = JSON.parse(await fs.readFile(join(projectPath, RECORD_FILE), 'utf-8'));
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
};
/**
 * Add a finished import to the record. A view or component imported again
 * replaces its entry; the app's folder is kept unless a new one is known.
 */
export const mergeRecord = async (projectPath, update) => {
    const current = (await readRecord(projectPath)) ?? empty(update.appName, update.folder);
    const next = {
        version: 1,
        app: { name: update.appName, folder: update.folder ?? current.app.folder },
        views: { ...current.views, ...update.views },
        components: { ...current.components, ...update.components },
    };
    const file = join(projectPath, RECORD_FILE);
    await fs.mkdir(join(projectPath, '.scamp'), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(next, null, 2), 'utf-8');
    await fs.rename(`${file}.tmp`, file);
    return next;
};
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
/** The id in a class name (`dp_nav_item_0010` → `0010`), or the id as given. */
export const elementIdFrom = (element) => {
    const m = element.match(/_([0-9a-z]{3,8})$/i);
    return m?.[1] ?? element;
};
/** A source file of the app, only if it's inside the app's folder. */
const insideApp = (folder, path) => {
    if (!SOURCE_EXTENSIONS.has(extname(path)))
        return null;
    const file = resolve(folder, `.${path.startsWith('/') ? path : `/${path}`}`);
    const inside = relative(folder, file);
    return inside.startsWith('..') || inside === '' ? null : file;
};
/**
 * The agent's read of the app's source: the JSX around an element, with
 * line numbers; or, with no element, which source files the target drew
 * from and which of its elements each one wrote.
 */
export const sourceFor = async (record, target, element) => {
    if (record === null)
        return { ok: false, error: 'This project has no React import to read the source of.' };
    if (record.app.folder === null) {
        return { ok: false, error: 'Scamp didn’t start this app, so it doesn’t know where its source is.' };
    }
    const entry = record.views[target] ?? record.components[target];
    if (entry === undefined)
        return { ok: false, error: `${target} didn’t come from the React import.` };
    if (element === undefined || element.length === 0) {
        const byFile = new Map();
        for (const [id, site] of Object.entries(entry.sites)) {
            const call = parseCallSite(site);
            if (call === null)
                continue;
            byFile.set(call.path, [...(byFile.get(call.path) ?? []), id]);
        }
        const lines = [...byFile.entries()].map(([path, ids]) => `${path}: ${ids.length} elements (${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ', …' : ''})`);
        return { ok: true, text: `${target} was drawn from ${byFile.size} source files:\n${lines.join('\n')}` };
    }
    const id = elementIdFrom(element);
    const site = entry.sites[id];
    if (site === undefined) {
        return { ok: false, error: `Scamp has no source line for ${element}. Try its parent: words lifted into their own element share their parent's line.` };
    }
    const call = parseCallSite(site);
    const file = call === null ? null : insideApp(record.app.folder, call.path);
    if (call === null || file === null)
        return { ok: false, error: `${element}'s source isn't a file in the app.` };
    let text;
    try {
        text = await fs.readFile(file, 'utf-8');
    }
    catch {
        return { ok: false, error: `Couldn't read ${call.path}; the app may have changed since the import.` };
    }
    const lines = text.split('\n');
    const from = Math.max(1, call.line - 15);
    const to = Math.min(lines.length, call.line + 25);
    const width = String(to).length;
    const body = lines
        .slice(from - 1, to)
        .map((line, i) => `${String(from + i).padStart(width)}${from + i === call.line ? ' >' : '  '} ${line}`)
        .join('\n');
    return { ok: true, text: `${call.path}, line ${call.line} (marked >):\n${body}` };
};

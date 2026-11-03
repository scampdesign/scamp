import { promises as fs } from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { listProjectFiles, SKIPPED_DIRS } from './projectFiles';
/**
 * The tools Embedded Scamp's agent works on a real codebase with. Every
 * path is checked against the project folder: nothing outside it, and never
 * installs, git internals, Scamp's own folder, lockfiles or env files.
 * see docs/plans/embedded-scamp-plan.md
 */
const LOCKFILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock']);
const MAX_READ = 400_000;
/** The project-relative path a tool may touch, or why it may not. */
export const guardPath = (folder, path, forWrite) => {
    if (typeof path !== 'string' || path.trim().length === 0)
        return { ok: false, error: 'Give a path inside the project.' };
    const abs = resolve(folder, path.trim());
    const rel = relative(folder, abs);
    if (rel.startsWith('..') || isAbsolute(rel))
        return { ok: false, error: `${path} is outside the project.` };
    const parts = rel.split(/[\\/]/);
    if (parts.some((p) => SKIPPED_DIRS.has(p)))
        return { ok: false, error: `${path} is in a folder Scamp leaves alone.` };
    const name = parts[parts.length - 1] ?? '';
    if (/^\.env(\.|$)/.test(name))
        return { ok: false, error: 'Env files hold secrets; Scamp doesn’t read or write them.' };
    if (forWrite && LOCKFILES.has(name))
        return { ok: false, error: 'Lockfiles are written by the package manager, not by edits.' };
    return { ok: true, rel: rel.split('\\').join('/'), abs };
};
/** A symlink inside the project can point outside it: the real path must stay in. */
const staysInside = async (folder, abs) => {
    const root = await fs.realpath(folder);
    // A file that doesn't exist yet is checked through the nearest folder that does.
    let probe = abs;
    for (;;) {
        const real = await fs.realpath(probe).catch(() => null);
        if (real !== null) {
            const rel = relative(root, real);
            return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
        }
        const up = dirname(probe);
        if (up === probe)
            return false;
        probe = up;
    }
};
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ ...text(t), isError: true });
const READ_TOOLS = [
    {
        name: 'list_files',
        description: 'List the project’s files (not node_modules or build output), optionally under one folder.',
        input_schema: { type: 'object', properties: { path: { type: 'string', description: 'A folder inside the project, such as src/components. Omit for all.' } } },
    },
    {
        name: 'read_file',
        description: 'Read a file in the project, with line numbers. Read a file before editing it.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                start_line: { type: 'number', description: 'First line, 1-based.' },
                end_line: { type: 'number', description: 'Last line, inclusive.' },
            },
            required: ['path'],
        },
    },
    {
        name: 'search',
        description: 'Find text in the project’s source files. Case-insensitive; returns file:line and the line.',
        input_schema: {
            type: 'object',
            properties: { query: { type: 'string' }, path: { type: 'string', description: 'Limit to files under this folder.' } },
            required: ['query'],
        },
    },
];
const WRITE_TOOLS = [
    {
        name: 'edit_file',
        description: 'Replace one exact piece of text in a file. `old_string` must appear exactly once; include enough surrounding lines to make it unique.',
        input_schema: {
            type: 'object',
            properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },
            required: ['path', 'old_string', 'new_string'],
        },
    },
    {
        name: 'write_file',
        description: 'Create a new file, or replace a whole file you have read. Prefer edit_file for changes.',
        input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    },
];
export const EMBEDDED_READ_TOOLS = READ_TOOLS;
export const EMBEDDED_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
export const EMBEDDED_WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));
/** A tool invoker for one project; `touched` collects every file it wrote. */
export const embeddedToolInvoker = (folder, touched, readOnly) => async (name, args) => {
    if (readOnly && EMBEDDED_WRITE_TOOL_NAMES.has(name))
        return fail('This run only reads the project.');
    try {
        if (name === 'list_files') {
            const under = typeof args['path'] === 'string' && args['path'].length > 0 ? guardPath(folder, args['path'], false) : null;
            if (under !== null && !under.ok)
                return fail(under.error);
            const files = (await listProjectFiles(folder)).filter((f) => under === null || f.startsWith(`${under.rel}/`));
            return text(files.length === 0 ? '(no files)' : files.slice(0, 1500).join('\n'));
        }
        if (name === 'read_file') {
            const g = guardPath(folder, args['path'], false);
            if (!g.ok)
                return fail(g.error);
            if (!(await staysInside(folder, g.abs)))
                return fail(`${g.rel} leads outside the project.`);
            const body = await fs.readFile(g.abs, 'utf-8');
            if (body.length > MAX_READ)
                return fail(`${g.rel} is too large to read whole; read it in ranges.`);
            const lines = body.split('\n');
            const start = Math.max(1, Math.floor(Number(args['start_line'] ?? 1)) || 1);
            const end = Math.min(lines.length, Math.floor(Number(args['end_line'] ?? lines.length)) || lines.length);
            return text(lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join('\n'));
        }
        if (name === 'search') {
            const query = typeof args['query'] === 'string' ? args['query'].toLowerCase() : '';
            if (query.length === 0)
                return fail('Give some text to search for.');
            const under = typeof args['path'] === 'string' && args['path'].length > 0 ? guardPath(folder, args['path'], false) : null;
            if (under !== null && !under.ok)
                return fail(under.error);
            const hits = [];
            for (const file of await listProjectFiles(folder)) {
                if (hits.length >= 100)
                    break;
                if (under !== null && !file.startsWith(`${under.rel}/`))
                    continue;
                if (!/\.(tsx?|jsx?|mjs|cjs|css|scss|sass|less|html|vue|svelte|json)$/.test(file) || guardPath(folder, file, false).ok === false)
                    continue;
                const lines = (await fs.readFile(join(folder, file), 'utf-8').catch(() => '')).split('\n');
                lines.forEach((line, i) => {
                    if (hits.length < 100 && line.toLowerCase().includes(query))
                        hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 200)}`);
                });
            }
            return text(hits.length === 0 ? 'No matches.' : hits.join('\n'));
        }
        if (name === 'edit_file') {
            const g = guardPath(folder, args['path'], true);
            if (!g.ok)
                return fail(g.error);
            if (!(await staysInside(folder, g.abs)))
                return fail(`${g.rel} leads outside the project.`);
            const oldString = args['old_string'];
            const newString = args['new_string'];
            if (typeof oldString !== 'string' || typeof newString !== 'string' || oldString.length === 0) {
                return fail('edit_file needs old_string and new_string.');
            }
            const body = await fs.readFile(g.abs, 'utf-8');
            const first = body.indexOf(oldString);
            if (first === -1)
                return fail(`That text isn’t in ${g.rel}. Read the file again and copy it exactly.`);
            if (body.indexOf(oldString, first + 1) !== -1)
                return fail(`That text appears more than once in ${g.rel}; include more lines around it.`);
            await fs.writeFile(g.abs, body.slice(0, first) + newString + body.slice(first + oldString.length));
            touched.add(g.rel);
            return { ...text(`Edited ${g.rel}.`), summary: `Edited ${g.rel}` };
        }
        if (name === 'write_file') {
            const g = guardPath(folder, args['path'], true);
            if (!g.ok)
                return fail(g.error);
            if (!(await staysInside(folder, g.abs)))
                return fail(`${g.rel} leads outside the project.`);
            if (typeof args['content'] !== 'string')
                return fail('write_file needs content.');
            await fs.mkdir(dirname(g.abs), { recursive: true });
            await fs.writeFile(g.abs, args['content']);
            touched.add(g.rel);
            return { ...text(`Wrote ${g.rel}.`), summary: `Wrote ${g.rel}` };
        }
        return fail(`There is no tool named ${name}.`);
    }
    catch (err) {
        return fail(`${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
};

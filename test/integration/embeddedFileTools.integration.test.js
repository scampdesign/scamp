import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { embeddedToolInvoker, guardPath } from '../../src/main/embedded/fileTools';
/**
 * The agent's file tools on a real folder: they stay inside the project,
 * never touch installs, git, Scamp's folder, env files or lockfiles, and
 * an edit must match exactly once. see docs/plans/embedded-scamp-plan.md
 */
let dir;
let outside;
const textOf = (result) => result.content.map((c) => c.text).join('');
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'embedded-tools-'));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'embedded-outside-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'Card.module.css'), '.card {\n  padding: 16px;\n}\n.other {\n  padding: 16px;\n}\n');
    await fs.writeFile(path.join(dir, '.env'), 'SECRET=1\n');
    await fs.writeFile(path.join(outside, 'secret.txt'), 'outside\n');
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
});
describe('guardPath', () => {
    it('allows a project file, relative and normalized', () => {
        expect(guardPath('/p/app', 'src/./Card.tsx', false)).toMatchObject({ ok: true, rel: 'src/Card.tsx' });
    });
    it('refuses paths outside, in skipped folders, env files, and lockfiles for writes', () => {
        expect(guardPath('/p/app', '../x', false).ok).toBe(false);
        expect(guardPath('/p/app', 'node_modules/react/index.js', false).ok).toBe(false);
        expect(guardPath('/p/app', '.git/config', false).ok).toBe(false);
        expect(guardPath('/p/app', '.scamp/embedded/vite.config.scamp.mjs', true).ok).toBe(false);
        expect(guardPath('/p/app', '.env.local', false).ok).toBe(false);
        expect(guardPath('/p/app', 'package-lock.json', true).ok).toBe(false);
        expect(guardPath('/p/app', 'package-lock.json', false).ok).toBe(true);
        expect(guardPath('/p/app', '', false).ok).toBe(false);
    });
});
describe('embeddedToolInvoker', () => {
    it('reads with line numbers, and edits a unique match, recording the file', async () => {
        const touched = new Set();
        const invoke = embeddedToolInvoker(dir, touched, false);
        expect(textOf(await invoke('read_file', { path: 'src/Card.module.css', start_line: 1, end_line: 2 }))).toBe('1\t.card {\n2\t  padding: 16px;');
        const edit = await invoke('edit_file', { path: 'src/Card.module.css', old_string: '.card {\n  padding: 16px;', new_string: '.card {\n  padding: 24px;' });
        expect(edit.isError).toBeUndefined();
        expect(edit.summary).toBe('Edited src/Card.module.css');
        expect(await fs.readFile(path.join(dir, 'src', 'Card.module.css'), 'utf-8')).toContain('.card {\n  padding: 24px;');
        expect([...touched]).toEqual(['src/Card.module.css']);
    });
    it('refuses an edit that matches twice, or not at all, and writes nothing', async () => {
        const touched = new Set();
        const invoke = embeddedToolInvoker(dir, touched, false);
        expect(textOf(await invoke('edit_file', { path: 'src/Card.module.css', old_string: 'padding: 16px;', new_string: 'x' }))).toMatch(/more than once/);
        expect(textOf(await invoke('edit_file', { path: 'src/Card.module.css', old_string: 'margin', new_string: 'x' }))).toMatch(/isn’t in/);
        expect(touched.size).toBe(0);
    });
    it('refuses env files and paths outside the project', async () => {
        const invoke = embeddedToolInvoker(dir, new Set(), false);
        expect((await invoke('read_file', { path: '.env' })).isError).toBe(true);
        expect((await invoke('read_file', { path: path.join(outside, 'secret.txt') })).isError).toBe(true);
    });
    it('refuses a symlink that leads outside the project', async () => {
        await fs.symlink(outside, path.join(dir, 'src', 'link'));
        const invoke = embeddedToolInvoker(dir, new Set(), false);
        const read = await invoke('read_file', { path: 'src/link/secret.txt' });
        expect(read.isError).toBe(true);
        expect(textOf(read)).toMatch(/outside the project/);
        expect((await invoke('write_file', { path: 'src/link/new.txt', content: 'x' })).isError).toBe(true);
        await expect(fs.access(path.join(outside, 'new.txt'))).rejects.toThrow();
    });
    it('creates a new file, and lists and searches the project’s own files', async () => {
        const touched = new Set();
        const invoke = embeddedToolInvoker(dir, touched, false);
        expect((await invoke('write_file', { path: 'src/theme/tokens.css', content: ':root { --gap: 8px; }\n' })).isError).toBeUndefined();
        expect(touched.has('src/theme/tokens.css')).toBe(true);
        expect(textOf(await invoke('list_files', { path: 'src' }))).toBe('src/Card.module.css\nsrc/theme/tokens.css');
        expect(textOf(await invoke('search', { query: '--GAP' }))).toBe('src/theme/tokens.css:1: :root { --gap: 8px; }');
    });
    it('refuses writes on a read-only run', async () => {
        const invoke = embeddedToolInvoker(dir, new Set(), true);
        expect((await invoke('edit_file', { path: 'src/Card.module.css', old_string: '.card', new_string: '.x' })).isError).toBe(true);
        expect((await invoke('read_file', { path: 'src/Card.module.css' })).isError).toBeUndefined();
    });
});

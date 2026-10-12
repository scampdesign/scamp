import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { disposeImportSources, listImportSources, readImportSource, saveImportSource, setActiveImportProject, } from '../../src/main/importSourceStore';
/**
 * The kept original of an imported page.
 *
 * Real files in a real temp directory: the whole point of this module is
 * where the bytes go and when they are removed, which a mocked `fs`
 * could not tell you.
 * see docs/notes/import-source-store.md
 */
const source = (over = {}) => ({
    html: '<html><body><p class="a">hi</p></body></html>',
    css: '.a { color: red; }',
    unreadable: [],
    truncated: false,
    ...over,
});
const projects = [];
const project = (name) => {
    const dir = path.join(tmpdir(), `scamp-src-test-${process.pid}-${name}`);
    projects.push(dir);
    return dir;
};
afterEach(async () => {
    await disposeImportSources();
});
describe('saveImportSource', () => {
    it('writes the page and its styles where the caller can find them', async () => {
        const stored = await saveImportSource(project('a'), 'Lobby', 'https://x.test/', source());
        expect(await fs.readFile(stored.htmlPath, 'utf-8')).toContain('<p class="a">hi</p>');
        expect(await fs.readFile(stored.cssPath, 'utf-8')).toBe('.a { color: red; }');
    });
    it('keeps them out of the project, because they are somebody else\'s page', async () => {
        const dir = project('b');
        const stored = await saveImportSource(dir, 'Lobby', 'https://x.test/', source());
        expect(stored.htmlPath.startsWith(dir)).toBe(false);
        expect(stored.htmlPath.startsWith(tmpdir())).toBe(true);
    });
    it('records what it could not read, rather than leaving it unexplained', async () => {
        const stored = await saveImportSource(project('c'), 'Lobby', 'https://x.test/', source({ unreadable: ['https://cdn.test/a.css'], truncated: true }));
        expect(stored.unreadable).toEqual(['https://cdn.test/a.css']);
        expect(stored.truncated).toBe(true);
    });
    it('survives a view name that is not a safe path segment', async () => {
        const stored = await saveImportSource(project('d'), '../../etc/passwd', 'u', source());
        expect(stored.htmlPath).not.toContain('..');
        expect(await fs.readFile(stored.htmlPath, 'utf-8')).toContain('hi');
    });
    it('keeps two projects\' originals apart', async () => {
        const one = project('e');
        const two = project('f');
        await saveImportSource(one, 'Lobby', 'https://one.test/', source());
        await saveImportSource(two, 'Lobby', 'https://two.test/', source());
        expect((await listImportSources(one))[0]?.url).toBe('https://one.test/');
        expect((await listImportSources(two))[0]?.url).toBe('https://two.test/');
    });
});
describe('listImportSources', () => {
    it('says nothing for a project that has imported nothing', async () => {
        expect(await listImportSources(project('g'))).toEqual([]);
    });
    it('lists every kept original with its sizes', async () => {
        const dir = project('h');
        await saveImportSource(dir, 'Lobby', 'https://x.test/a', source());
        await saveImportSource(dir, 'Pricing', 'https://x.test/b', source());
        const list = await listImportSources(dir);
        expect(list.map((s) => s.view).sort()).toEqual(['Lobby', 'Pricing']);
        expect(list[0]?.cssBytes).toBeGreaterThan(0);
    });
});
describe('readImportSource', () => {
    it('reads the css by name', async () => {
        const dir = project('i');
        await saveImportSource(dir, 'Lobby', 'https://x.test/', source());
        const found = await readImportSource(dir, 'Lobby', 'css', 1000);
        expect(found?.text).toBe('.a { color: red; }');
        expect(found?.truncated).toBe(false);
    });
    it('reads the html when asked for it', async () => {
        const dir = project('j');
        await saveImportSource(dir, 'Lobby', 'https://x.test/', source());
        expect((await readImportSource(dir, 'Lobby', 'html', 1000))?.text).toContain('<body>');
    });
    it('truncates at the limit and says that it did', async () => {
        const dir = project('k');
        await saveImportSource(dir, 'Lobby', 'u', source({ css: 'x'.repeat(500) }));
        const found = await readImportSource(dir, 'Lobby', 'css', 100);
        expect(found?.text).toHaveLength(100);
        expect(found?.truncated).toBe(true);
    });
    it('returns null for a view nobody imported', async () => {
        expect(await readImportSource(project('l'), 'Nope', 'css', 100)).toBeNull();
    });
    it('reads from the view\'s own folder, never a path its record names', async () => {
        // Audit item 14: a planted record pointed the read at any file.
        const dir = project('l2');
        const stored = await saveImportSource(dir, 'Lobby', 'u', source());
        const secret = path.join(tmpdir(), `scamp-src-test-${process.pid}-secret.txt`);
        await fs.writeFile(secret, 'private key');
        const record = path.join(path.dirname(stored.cssPath), 'source.json');
        await fs.writeFile(record, JSON.stringify({ ...stored, cssPath: secret }));
        try {
            expect((await readImportSource(dir, 'Lobby', 'css', 1000))?.text).toBe('.a { color: red; }');
        }
        finally {
            await fs.rm(secret, { force: true });
        }
    });
});
describe('the shared temp folder', () => {
    it('is made private to this user, even when an earlier version left it open', async () => {
        const base = path.join(tmpdir(), 'scamp-import-source');
        await fs.mkdir(base, { recursive: true });
        await fs.chmod(base, 0o755);
        await saveImportSource(project('p1'), 'Lobby', 'u', source());
        if (process.platform !== 'win32') {
            expect((await fs.stat(base)).mode & 0o777).toBe(0o700);
        }
    });
});
describe('disposal', () => {
    it('removes a project\'s originals when a different project opens', async () => {
        const one = project('m');
        const two = project('n');
        await setActiveImportProject(one);
        await saveImportSource(one, 'Lobby', 'u', source());
        await setActiveImportProject(two);
        expect(await listImportSources(one)).toEqual([]);
    });
    it('leaves the newly opened project alone', async () => {
        const one = project('o');
        const two = project('p');
        await setActiveImportProject(one);
        await setActiveImportProject(two);
        await saveImportSource(two, 'Lobby', 'u', source());
        expect(await listImportSources(two)).toHaveLength(1);
    });
    it('does not throw when re-opening the same project', async () => {
        const one = project('q');
        await setActiveImportProject(one);
        await saveImportSource(one, 'Lobby', 'u', source());
        await setActiveImportProject(one);
        expect(await listImportSources(one)).toHaveLength(1);
    });
    it('removes everything on shutdown', async () => {
        const one = project('r');
        const two = project('s');
        await saveImportSource(one, 'Lobby', 'u', source());
        await saveImportSource(two, 'Lobby', 'u', source());
        await disposeImportSources();
        expect(await listImportSources(one)).toEqual([]);
        expect(await listImportSources(two)).toEqual([]);
    });
    it('is quiet when there is nothing to remove', async () => {
        await expect(disposeImportSources(project('t'))).resolves.toBeUndefined();
    });
});

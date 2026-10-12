import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
// `pathContainment` imports `getWatchedPath` from `../watcher`, which
// transitively pulls in `electron` + `chokidar` (unavailable in the node
// test env). Stub the watcher so importing the module under test stays
// pure — these tests only exercise `resolveInsideProject`, which takes
// the root explicitly and never touches the watcher.
vi.mock('../src/main/watcher', () => ({ getWatchedPath: () => null }));
// Dynamic import (matching the other main-side tests) so this main module
// isn't pulled into the web tsconfig's static file list.
const { resolveInsideProject, allowProjectOpen, assertOpenableFolder } = await import('../src/main/ipc/pathContainment');
// Tests target `resolveInsideProject`, the pure core (it takes the root
// explicitly). `assertInsideActiveProject` just sources the root from the
// watcher and delegates here. Paths are absolute so `path.resolve` is
// deterministic regardless of cwd.
const ROOT = resolve('/tmp/scamp-project');
describe('resolveInsideProject', () => {
    it('returns the resolved path for a file directly inside the root', () => {
        expect(resolveInsideProject(`${ROOT}/app/page.tsx`, ROOT)).toBe(`${ROOT}/app/page.tsx`);
    });
    it('allows a deeply nested path', () => {
        expect(resolveInsideProject(`${ROOT}/app/home/page.module.css`, ROOT)).toBe(`${ROOT}/app/home/page.module.css`);
    });
    it('allows the project root itself', () => {
        expect(resolveInsideProject(ROOT, ROOT)).toBe(ROOT);
    });
    it('normalizes a trailing separator on the root', () => {
        expect(resolveInsideProject(`${ROOT}/a.txt`, `${ROOT}/`)).toBe(`${ROOT}/a.txt`);
    });
    it('collapses harmless interior `..` segments that stay inside', () => {
        expect(resolveInsideProject(`${ROOT}/app/../theme.css`, ROOT)).toBe(`${ROOT}/theme.css`);
    });
    it('rejects a `..` escape out of the project', () => {
        expect(() => resolveInsideProject(`${ROOT}/../etc/passwd`, ROOT)).toThrow(/outside the active project/);
    });
    it('rejects an absolute path elsewhere on the filesystem', () => {
        expect(() => resolveInsideProject('/etc/passwd', ROOT)).toThrow(/outside the active project/);
    });
    it('rejects a sibling directory that shares the root as a name prefix', () => {
        // `/tmp/scamp-project-evil` must NOT count as inside `/tmp/scamp-project`.
        expect(() => resolveInsideProject(`${ROOT}-evil/secret.txt`, ROOT)).toThrow(/outside the active project/);
    });
    it('rejects the exact prefix sibling without a separator', () => {
        expect(() => resolveInsideProject(`${ROOT}-evil`, ROOT)).toThrow(/outside the active project/);
    });
});
describe('assertOpenableFolder', () => {
    it('refuses a folder main never handed out', () => {
        expect(() => assertOpenableFolder('/home/someone')).toThrow('Choose the project folder');
    });
    it('accepts a folder once allowed, however the path is spelled', () => {
        allowProjectOpen(`${ROOT}-open`);
        expect(() => assertOpenableFolder(`${ROOT}-open/`)).not.toThrow();
        expect(() => assertOpenableFolder(`${ROOT}-open/../scamp-project-open`)).not.toThrow();
    });
});

import { describe, expect, it } from 'vitest';
import { MAX_RECENT, parseRecent, removeRecent, upsertRecent } from '../src/main/embedded/recent';
const entry = (folder, lastOpened = '2026-11-04T10:00:00.000Z') => ({
    folder,
    name: folder.split('/').pop() ?? folder,
    lastOpened,
});
describe('parseRecent', () => {
    it('reads the stored list', () => {
        expect(parseRecent(JSON.stringify({ projects: [entry('/work/shop')] }))).toEqual([entry('/work/shop')]);
    });
    it('drops malformed entries one by one, and returns nothing for a bad file', () => {
        const text = JSON.stringify({ projects: [entry('/work/shop'), { folder: '' }, { folder: '/x', name: 3 }, null] });
        expect(parseRecent(text)).toEqual([entry('/work/shop')]);
        expect(parseRecent('')).toEqual([]);
        expect(parseRecent('{"projects":"no"}')).toEqual([]);
    });
});
describe('upsertRecent', () => {
    it('puts the opened project first, with no second copy', () => {
        const list = [entry('/a'), entry('/b')];
        expect(upsertRecent(list, entry('/b', '2026-11-05T00:00:00.000Z')).map((p) => [p.folder, p.lastOpened])).toEqual([
            ['/b', '2026-11-05T00:00:00.000Z'],
            ['/a', '2026-11-04T10:00:00.000Z'],
        ]);
    });
    it('keeps only the newest projects', () => {
        const list = Array.from({ length: MAX_RECENT }, (_, i) => entry(`/p${i}`));
        const next = upsertRecent(list, entry('/new'));
        expect(next).toHaveLength(MAX_RECENT);
        expect(next[0]?.folder).toBe('/new');
        expect(next.some((p) => p.folder === `/p${MAX_RECENT - 1}`)).toBe(false);
    });
});
describe('removeRecent', () => {
    it('removes only the given folder', () => {
        expect(removeRecent([entry('/a'), entry('/b')], '/a')).toEqual([entry('/b')]);
        expect(removeRecent([entry('/a')], '/missing')).toEqual([entry('/a')]);
    });
});

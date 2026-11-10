import { describe, expect, it } from 'vitest';
import { aliasesFrom, listOrigin } from '../src/main/embedded/listOrigin';
/**
 * Where a list's order comes from, for a move among items one `.map()`
 * draws: an array written in the project, or data Scamp can't reorder.
 */
const files = {
    'src/App.tsx': [
        "import { categories } from '@/data';", // 1
        "import { Card } from './Card';", // 2
        'const PEOPLE = ["Ada", "Grace"] as const;', // 3
        'export const App = ({ rows }: { rows: string[] }) => {', // 4
        '  const [todos] = useState<string[]>([]);', // 5
        '  const sorted = [...PEOPLE].sort();', // 6
        '  const local = ["a", "b"];', // 7
        '  return (', // 8
        '    <main>', // 9
        '      {PEOPLE.map((n) => <Card key={n} name={n} />)}', // 10
        '      {categories.map((c) => <li key={c.id}>{c.name}</li>)}', // 11
        '      {todos.map((t) => <p key={t}>{t}</p>)}', // 12
        '      {rows.map((r) => <p key={r}>{r}</p>)}', // 13
        '      {sorted.map((s) => <p key={s}>{s}</p>)}', // 14
        '      {local.map((s) => <b key={s}>{s}</b>)}', // 15
        '      {perfection.breakdown.map((s) => <i key={s}>{s}</i>)}', // 16
        '      {["x", "y"].map((s) => <u key={s}>{s}</u>)}', // 17
        '      <h1>Title</h1>', // 18
        '    </main>', // 19
        '  );', // 20
        '};', // 21
    ].join('\n'),
    'src/Card.tsx': 'export const Card = ({ name }: { name: string }) => (\n  <article>{name}</article>\n);',
    'src/data/index.ts': 'import { cooking } from "./cooking";\nexport const categories: Category[] = [\n  cooking,\n];',
};
const read = async (file) => files[file] ?? null;
const aliases = [{ prefix: '@/', target: 'src/' }];
const origin = (...sources) => listOrigin({ sources, read, aliases });
describe('listOrigin: written in the project', () => {
    it('finds an array written in the file, through `as const`', async () => {
        expect(await origin('src/App.tsx:10:26')).toEqual({ kind: 'written', at: 'src/App.tsx:3', name: 'PEOPLE' });
    });
    it('follows an import through a path alias, to an index file', async () => {
        expect(await origin('src/App.tsx:11:30')).toEqual({ kind: 'written', at: 'src/data/index.ts:2', name: 'categories' });
    });
    it('finds an array written inside the component, or right in the `.map()`', async () => {
        expect(await origin('src/App.tsx:15:25')).toEqual({ kind: 'written', at: 'src/App.tsx:7', name: 'local' });
        expect(await origin('src/App.tsx:17:30')).toMatchObject({ kind: 'written', at: 'src/App.tsx:17' });
    });
    it('looks where the component is used when its own JSX isn’t in a list', async () => {
        expect(await origin('src/Card.tsx:2:3', 'src/App.tsx:10:26')).toMatchObject({ kind: 'written', name: 'PEOPLE' });
    });
});
describe('listOrigin: data', () => {
    it('says state, props, and values worked out while the app runs can’t be reordered', async () => {
        expect(await origin('src/App.tsx:12:25')).toMatchObject({ kind: 'data', reason: 'the list `todos` is kept in state while the app runs' });
        expect(await origin('src/App.tsx:13:24')).toMatchObject({ kind: 'data', reason: 'the list `rows` is passed in as a prop' });
        expect(await origin('src/App.tsx:14:26')).toMatchObject({ kind: 'data', reason: expect.stringContaining('worked out while the app runs') });
        expect(await origin('src/App.tsx:16:40')).toMatchObject({ kind: 'data', reason: 'the list comes from `perfection.breakdown`, worked out while the app runs' });
    });
    it('is null for an element that isn’t drawn by a list, or a source it can’t read', async () => {
        expect(await origin('src/App.tsx:18:7')).toBeNull();
        expect(await origin('src/Missing.tsx:1:1')).toBeNull();
        expect(await origin()).toBeNull();
    });
});
describe('aliasesFrom', () => {
    it('reads tsconfig paths as prefixes, with baseUrl', () => {
        expect(aliasesFrom('{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }')).toEqual([{ prefix: '@/', target: 'src/' }]);
        expect(aliasesFrom('{\n  // comment\n  "compilerOptions": { "baseUrl": "./app", "paths": { "~/*": ["lib/*"], "exact": ["x"] }, },\n}')).toEqual([{ prefix: '~/', target: 'app/lib/' }]);
    });
    it('is empty for a config it can’t read', () => {
        expect(aliasesFrom('not json')).toEqual([]);
        expect(aliasesFrom('{}')).toEqual([]);
    });
});

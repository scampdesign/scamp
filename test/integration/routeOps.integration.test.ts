import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  listRoutes,
  parseRenderExport,
  parseViewImport,
  readDevVarsKeys,
  renameRouteForView,
  renameRouteView,
  routePathFor,
  setRenderExport,
  setRouteRender,
  writeRouteFile,
} from '../../src/main/ipc/routeOps';
import { parseDevJsonLine } from '../../src/main/devServer/devLog';

/**
 * The app's read of `routes/`, against the framework's own contract-2
 * fixture (which is what scampjs ships) and a temp copy for the writes.
 * see docs/notes/routes-in-the-app.md
 */
const FIXTURE = path.resolve(__dirname, '../../node_modules/scampjs/fixtures/contract-2');

describe('routePathFor', () => {
  it('follows the framework segment grammar, api prefix included', () => {
    expect(routePathFor('index.tsx')).toBe('/');
    expect(routePathFor('about.tsx')).toBe('/about');
    expect(routePathFor('game/[token]/lobby.tsx')).toBe('/game/:token/lobby');
    expect(routePathFor('docs/[...slug].tsx')).toBe('/docs/:slug*');
    expect(routePathFor('(marketing)/pricing.tsx')).toBe('/pricing');
    expect(routePathFor('api/health.ts')).toBe('/api/health');
    expect(routePathFor('notes.md')).toBeNull();
  });
});

describe('render export parsing and writing', () => {
  it('reads the mode or null, and rewrites in place', () => {
    expect(parseRenderExport("export const render = 'client';\n")).toBe('client');
    expect(parseRenderExport('export const render = "server"\n')).toBe('server');
    expect(parseRenderExport('export default function X() {}\n')).toBeNull();
    expect(setRenderExport("import X from '@/views/X/X';\n\nexport const render = 'static';\n", 'server')).toBe(
      "import X from '@/views/X/X';\n\nexport const render = 'server';\n"
    );
  });

  it('inserts the export after the imports when the file has none', () => {
    const tsx = "import X from '@/views/X/X';\nimport { y } from '@/lib/y';\n\nexport default function R() { return <X />; }\n";
    expect(setRenderExport(tsx, 'client')).toBe(
      "import X from '@/views/X/X';\nimport { y } from '@/lib/y';\n\nexport const render = 'client';\n\nexport default function R() { return <X />; }\n"
    );
    expect(setRenderExport('export default function R() { return null; }\n', 'static')).toBe(
      "export const render = 'static';\n\nexport default function R() { return null; }\n"
    );
  });

  it('reads the view a route imports', () => {
    expect(parseViewImport("import Lobby from '@/views/Lobby/Lobby';\n")).toBe('Lobby');
    expect(parseViewImport("import { db } from '@/lib/db';\n")).toBeNull();
  });
});

describe('listRoutes on the contract-2 fixture', () => {
  it('lists page routes first with render and view, then api routes', async () => {
    expect(await listRoutes(FIXTURE)).toEqual([
      { file: 'index.tsx', kind: 'page', path: '/', render: 'static', view: 'Home' },
      { file: 'game/[token]/lobby.tsx', kind: 'page', path: '/game/:token/lobby', render: 'client', view: 'Lobby' },
      { file: 'api/games/[token]/start.ts', kind: 'api', path: '/api/games/:token/start' },
      { file: 'api/health.ts', kind: 'api', path: '/api/health' },
    ]);
  });

  it('is empty for a project without routes/', async () => {
    expect(await listRoutes(os.tmpdir())).toEqual([]);
  });
});

describe('writes', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-routes-'));
    await fs.cp(FIXTURE, dir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('setRouteRender rewrites the file and leaves the rest', async () => {
    await setRouteRender(dir, 'game/[token]/lobby.tsx', 'server');
    const tsx = await fs.readFile(path.join(dir, 'routes/game/[token]/lobby.tsx'), 'utf-8');
    expect(tsx).toContain("export const render = 'server';");
    expect(tsx).toContain('export async function load(');
    expect((await listRoutes(dir))[1]).toMatchObject({ render: 'server' });
  });

  it('writeRouteFile creates a new route and refuses an existing one or a path outside routes/', async () => {
    await writeRouteFile(dir, 'about.tsx', 'export default function A() { return null; }\n');
    expect((await listRoutes(dir)).map((r) => r.path)).toContain('/about');
    await expect(writeRouteFile(dir, 'index.tsx', '')).rejects.toThrow('already exists');
    await expect(writeRouteFile(dir, '../package.json', '')).rejects.toThrow('not a route file');
    // Separators Windows reads that `/` splitting misses.
    await expect(writeRouteFile(dir, '..\\..\\x.js', '')).rejects.toThrow('not a route file');
    await expect(writeRouteFile(dir, 'C:x.js', '')).rejects.toThrow('not a route file');
    await expect(readDevVarsKeys(dir)).resolves.toEqual({ exists: false, keys: [] });
    await fs.writeFile(path.join(dir, '.dev.vars'), '# local\nDATABASE_URL=file:./dev.db\nexport TOKEN=abc\nBROKEN\n', 'utf-8');
    await expect(readDevVarsKeys(dir)).resolves.toEqual({ exists: true, keys: ['DATABASE_URL', 'TOKEN'] });
  });
});

describe('renameRouteView', () => {
  const ROUTE = `import Lobby from '@/views/Lobby/Lobby';
import type { LoadContext } from 'scampjs';

export const render = 'server';

export async function load(ctx: LoadContext) {
  // The author's own query, which a rename must not touch.
  return { players: await ctx.env.DB.select('Lobby players') };
}

export default function LobbyRoute({ data }: { data: { players: string[] } }) {
  return <Lobby players={data.players} />;
}
`;

  it('points the import, the tag, and the route function at the new name', () => {
    const out = renameRouteView(ROUTE, 'Lobby', 'Waiting');
    expect(out).toContain("import Waiting from '@/views/Waiting/Waiting';");
    expect(out).toContain('export default function WaitingRoute(');
    expect(out).toContain('<Waiting players={data.players} />');
    expect(out).not.toContain('Lobby/Lobby');
  });

  it("leaves the author's own code alone, strings included", () => {
    const out = renameRouteView(ROUTE, 'Lobby', 'Waiting');
    expect(out).toContain("ctx.env.DB.select('Lobby players')");
    expect(out).toContain("export const render = 'server';");
    expect(out).toContain('// The author’s own query'.replace('’', "'"));
  });

  it('rewrites a closing tag as well as a self-closing one', () => {
    const paired = "import A from '@/views/A/A';\n\nexport default function ARoute() {\n  return <A>x</A>;\n}\n";
    const out = renameRouteView(paired, 'A', 'B');
    expect(out).toContain('<B>x</B>');
  });

  it('changes nothing when the route renders a different view', () => {
    expect(renameRouteView(ROUTE, 'Other', 'Renamed')).toBe(ROUTE);
  });
});

describe('renameRouteForView', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-route-rename-'));
    await fs.cp(FIXTURE, dir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('moves the route the app named and points it at the new view', async () => {
    await writeRouteFile(dir, 'about.tsx', "import About from '@/views/About/About';\n\nexport default function AboutRoute() {\n  return <About />;\n}\n");

    const file = await renameRouteForView(dir, 'About', 'Contact');

    expect(file).toBe('contact.tsx');
    expect(await fs.readFile(path.join(dir, 'routes/contact.tsx'), 'utf-8')).toContain(
      "import Contact from '@/views/Contact/Contact';"
    );
    await expect(fs.access(path.join(dir, 'routes/about.tsx'))).rejects.toThrow();
  });

  it('leaves a route the developer placed where it is, and only fixes its references', async () => {
    await fs.mkdir(path.join(dir, 'routes', 'company'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'routes', 'company', 'story.tsx'),
      "import About from '@/views/About/About';\n\nexport default function AboutRoute() {\n  return <About />;\n}\n",
      'utf-8'
    );

    const file = await renameRouteForView(dir, 'About', 'Contact');

    // The URL was their decision; the broken import was not.
    expect(file).toBe('company/story.tsx');
    expect(await fs.readFile(path.join(dir, 'routes/company/story.tsx'), 'utf-8')).toContain(
      "import Contact from '@/views/Contact/Contact';"
    );
  });

  it('reports nothing to do when no route renders the view', async () => {
    await expect(renameRouteForView(dir, 'Nothing', 'Renamed')).resolves.toBeNull();
  });

  it('refuses rather than overwrite a route already at the new name', async () => {
    await writeRouteFile(dir, 'about.tsx', "import About from '@/views/About/About';\n\nexport default function AboutRoute() {\n  return <About />;\n}\n");
    await writeRouteFile(dir, 'contact.tsx', '// someone else got here first\n');

    await expect(renameRouteForView(dir, 'About', 'Contact')).rejects.toThrow('already exists');
    expect(await fs.readFile(path.join(dir, 'routes/contact.tsx'), 'utf-8')).toContain('someone else');
  });
});

describe('parseDevJsonLine', () => {
  it('turns request and error lines into app-log entries and ignores the rest', () => {
    expect(
      parseDevJsonLine('{"t":"2026-09-10T15:00:00.000Z","kind":"request","method":"GET","path":"/lobby","status":200,"ms":12}')
    ).toEqual({ level: 'info', message: 'GET /lobby 200 12ms' });
    expect(parseDevJsonLine('{"t":"x","kind":"error","path":"/x","message":"boom","stack":"..."}')).toEqual({
      level: 'error',
      message: '/x: boom',
    });
    expect(parseDevJsonLine('scamp dev ready http://127.0.0.1:3000')).toBeNull();
    expect(parseDevJsonLine('{not json')).toBeNull();
    expect(parseDevJsonLine('{"kind":"other"}')).toBeNull();
  });
});

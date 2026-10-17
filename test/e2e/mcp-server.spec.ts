import { promises as fs } from 'fs';
import { join } from 'path';

import { test, expect } from './fixtures/app';
import { dragInFrame, selectTool } from './fixtures/canvas';
import { pageRoot } from './fixtures/selectors';
import { waitForSaved } from './fixtures/assertions';

/**
 * The MCP server, end to end in a real Electron session.
 *
 * This is the ONLY level that exercises the main↔renderer seam: unit and
 * integration tests cover each half, but nothing else proves a tool call
 * arriving over HTTP in main comes back with live canvas state from the
 * renderer's store. The test speaks the real protocol over the real socket,
 * exactly as an agent would.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */

test.use({ projectOptions: { format: 'nextjs' } });

type McpConfig = { url: string; token: string; running: boolean };

/** Wait for the server to advertise itself — startup races project open. */
const readConfig = async (projectPath: string): Promise<McpConfig> => {
  const path = join(projectPath, '.scamp', 'mcp.json');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const parsed = JSON.parse(await fs.readFile(path, 'utf-8')) as McpConfig;
      if (parsed.running && parsed.url && parsed.token) return parsed;
    } catch {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`.scamp/mcp.json never reported a running server`);
};

const rpc = async (
  config: McpConfig,
  method: string,
  params?: unknown
): Promise<Record<string, unknown>> => {
  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-scamp-token': config.token,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await res.json()) as Record<string, unknown>;
};

/** Call a tool and return its text content, which is JSON for every tool. */
const callTool = async (
  config: McpConfig,
  name: string,
  args: Record<string, unknown> = {}
): Promise<string> => {
  const body = await rpc(config, 'tools/call', { name, arguments: args });
  const result = body['result'] as
    | { content: Array<{ text: string }>; isError?: boolean }
    | undefined;
  if (result === undefined) throw new Error(`no result: ${JSON.stringify(body)}`);
  return result.content[0]?.text ?? '';
};

test.describe('MCP server, live', () => {
  test('starts with the project and advertises itself in .scamp/', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);
    expect(config.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(config.token.length).toBeGreaterThan(10);
  });

  test('registers itself in .mcp.json so the user runs no command', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);
    const written = JSON.parse(
      await fs.readFile(join(project.dir, '.mcp.json'), 'utf-8')
    );
    expect(written.mcpServers.scamp.url).toBe(config.url);
    expect(written.mcpServers.scamp.headers['X-Scamp-Token']).toBe(config.token);
  });

  test('gitignores the registration so the token is never committed', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await readConfig(project.dir);
    const gitignore = await fs.readFile(join(project.dir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.mcp.json');
  });

  test('completes the handshake, carries instructions, and lists every tool', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);

    const init = await rpc(config, 'initialize', { protocolVersion: '2025-06-18' });
    expect(init['result']).toMatchObject({
      capabilities: { tools: {} },
      serverInfo: { name: 'scamp' },
    });
    // The server-carried guidance — reaches an agent that skipped agent.md.
    expect((init['result'] as { instructions: string }).instructions).toContain('components/');

    const list = await rpc(config, 'tools/list');
    const tools = (list['result'] as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      'scamp_check_project',
      'scamp_check_view',
      'scamp_find_overflow',
      'scamp_get_active_page',
      'scamp_get_canvas_state',
      'scamp_get_component_scaffold',
      'scamp_get_conventions',
      'scamp_get_element_by_id',
      'scamp_get_element_tree',
      'scamp_get_import_source',
      'scamp_get_react_source',
      'scamp_get_recent_edits',
      'scamp_get_selected_element',
      'scamp_get_theme_tokens',
      'scamp_get_view_props',
      'scamp_list_components',
      'scamp_list_import_sources',
      'scamp_list_pages',
      'scamp_list_routes',
    ]);
  });

  test('answers about an imported page from main, not from the canvas', async ({
    window,
    project,
  }) => {
    // Both tools read a temp directory rather than the canvas store, so
    // they take the main-side path `scamp_list_routes` uses. The suite
    // asserted they were ADVERTISED; nothing called them.
    // see docs/notes/import-source-store.md
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);

    // Nothing imported in this project: an empty list, not an error.
    const list = await callTool(config, 'scamp_list_import_sources');
    expect(JSON.parse(list)).toEqual([]);

    // And a view nobody imported says where to look rather than failing
    // in a way an agent cannot act on.
    const body = await rpc(config, 'tools/call', {
      name: 'scamp_get_import_source',
      arguments: { name: 'Ghost' },
    });
    const result = body['result'] as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('scamp_list_import_sources');
  });

  test('answers from the live canvas, across the main↔renderer seam', async ({
    window,
    project,
  }) => {
    // The whole point of the feature: draw something, select it, and have an
    // agent learn about it without the user describing anything.
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 260, y: 200 });

    const config = await readConfig(project.dir);
    const text = await callTool(config, 'scamp_get_selected_element');
    const element = JSON.parse(text);

    expect(element.class).toMatch(/^rect_[0-9a-f]{4}$/);
    expect(element.tag).toBe('div');
    expect(element.styles).toBeDefined();
  });

  test('follows the selection rather than answering from a snapshot', async ({
    window,
    project,
  }) => {
    // The case that decided pull-through over a cached snapshot: a stale
    // answer here would be confidently wrong, not visibly broken.
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 160, y: 140 });
    const config = await readConfig(project.dir);
    const first = JSON.parse(await callTool(config, 'scamp_get_selected_element'));

    await selectTool(window, 'r');
    await dragInFrame(window, { x: 220, y: 60 }, { x: 340, y: 160 });
    const second = JSON.parse(await callTool(config, 'scamp_get_selected_element'));

    expect(second.id).not.toBe(first.id);
  });

  test('reports the open page with project-relative paths', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);
    const active = JSON.parse(await callTool(config, 'scamp_get_active_page'));
    expect(active.kind).toBe('page');
    // Absolute paths would leak the user's home directory into text the
    // agent quotes back.
    expect(active.tsx.startsWith('/')).toBe(false);
    expect(active.tsx).toContain('page.tsx');
  });

  test('returns the element tree for the open page', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 200, y: 160 });

    const config = await readConfig(project.dir);
    const tree = JSON.parse(await callTool(config, 'scamp_get_element_tree'));
    expect(tree.root.children.length).toBeGreaterThan(0);
  });

  test('tells an agent what the designer changed, and only what is new', async ({
    window,
    project,
  }) => {
    // Phase 6 of docs/plans/incremental-writes-plan.md, over the wire.
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);

    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 200, y: 160 });
    await waitForSaved(window);
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 240, y: 60 }, { x: 380, y: 160 });
    await waitForSaved(window);

    const first = JSON.parse(await callTool(config, 'scamp_get_recent_edits'));
    expect(first.saves.length).toBeGreaterThan(0);
    expect(first.revision).toBeGreaterThan(0);
    const change = first.saves[first.saves.length - 1].files[0].changes[0];
    expect(change.line).toBeGreaterThan(0);
    expect(typeof change.text).toBe('string');

    // Nothing new since then.
    const caughtUp = JSON.parse(
      await callTool(config, 'scamp_get_recent_edits', { since: first.revision })
    );
    expect(caughtUp.saves).toEqual([]);

    // One more edit, and only that one comes back.
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 220 }, { x: 200, y: 320 });
    await waitForSaved(window);
    const next = JSON.parse(
      await callTool(config, 'scamp_get_recent_edits', { since: first.revision })
    );
    expect(next.saves.length).toBeGreaterThan(0);
    expect(next.saves.every((s: { revision: number }) => s.revision > first.revision)).toBe(true);
  });

  test('reports an unknown element id as isError, keeping the turn alive', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);
    const text = await callTool(config, 'scamp_get_element_by_id', { id: 'zzzz' });
    expect(text).toContain('No element with that id');
  });

  test('describes a view’s props from a file an agent just wrote, by name or slug', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);

    // Written from outside, in the contract's canonical forms — the
    // watcher lists it, and the tool answers from the parsed tree.
    const dir = join(project.dir, 'views', 'Lobby');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      join(dir, 'Lobby.module.css'),
      ['.root {', '  width: 100%;', '  position: relative;', '}', '', '.code_e1d2 {', '  width: 200px;', '}', '', '.row_e1e4 {', '  width: 200px;', '}', '', '.note_e1f5 {', '  width: 200px;', '}', '', '.start_e1f9 {', '  width: 200px;', '}', ''].join('\n'),
      'utf-8'
    );
    await fs.writeFile(
      join(dir, 'Lobby.tsx'),
      [
        "import styles from './Lobby.module.css';",
        '',
        'type LobbyProps = {',
        '  code?: string;',
        '  players?: Array<{ id: string; label: string }>;',
        '  waiting?: boolean;',
        '  onStart?: () => void;',
        '  className?: string;',
        '};',
        '',
        'export default function Lobby({',
        '  code = "KZQ4",',
        '  players = [',
        '    { id: "1", label: "Player 1 · Alex" },',
        '    { id: "2", label: "Player 2 · Bea" },',
        '  ],',
        '  waiting = true,',
        '  onStart,',
        '  className,',
        '}: LobbyProps) {',
        '  return (',
        "    <div data-scamp-id=\"root\" className={`${styles.root} ${className ?? ''}`}>",
        '      <h2 data-scamp-id="code_e1d2" className={styles.code_e1d2}>{code}</h2>',
        '      {players.map((player) => (',
        '        <p data-scamp-id="row_e1e4" className={styles.row_e1e4} key={player.id}>{player.label}</p>',
        '      ))}',
        '      {waiting && (',
        '        <p data-scamp-id="note_e1f5" className={styles.note_e1f5}>Waiting for everyone to join</p>',
        '      )}',
        '      <button data-scamp-id="start_e1f9" className={styles.start_e1f9} type="button" onClick={onStart}>Start the game</button>',
        '    </div>',
        '  );',
        '}',
        '',
        "export const _scamp = { contract: 0, events: ['onStart'] } as const;",
        '',
      ].join('\n'),
      'utf-8'
    );

    await expect
      .poll(async () => callTool(config, 'scamp_get_view_props', { name: 'Lobby' }), {
        timeout: 15_000,
      })
      .toContain('"kind": "view"');
    const lobby = JSON.parse(await callTool(config, 'scamp_get_view_props', { name: 'Lobby' }));
    expect(lobby.tsx).toBe('views/Lobby/Lobby.tsx');
    expect(lobby.propsType).toBe(
      [
        'type LobbyProps = {',
        '  code?: string;',
        '  players?: Array<{ id: string; label: string }>;',
        '  waiting?: boolean;',
        '  onStart?: () => void;',
        '  className?: string;',
        '};',
      ].join('\n')
    );
    expect(lobby.events).toEqual(['onStart']);
    expect(lobby.samples).toEqual({
      code: 'KZQ4',
      players: [
        { id: '1', label: 'Player 1 · Alex' },
        { id: '2', label: 'Player 2 · Bea' },
      ],
      waiting: true,
    });

    // scamp_list_pages reports the view by slug; the slug works too.
    const bySlug = JSON.parse(await callTool(config, 'scamp_get_view_props', { name: 'lobby' }));
    expect(bySlug.name).toBe('Lobby');

    const missing = await callTool(config, 'scamp_get_view_props', { name: 'Nope' });
    expect(missing).toContain('No view or component named "Nope"');
  });

  test('rejects a request with no token', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
    });
    expect(res.status).toBe(401);
  });

  test('rejects a request carrying a browser Origin', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scamp-token': config.token,
        origin: 'https://evil.example',
      },
      body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
    });
    expect(res.status).toBe(403);
  });

  test('surfaces its status in the terminal panel, and whether an agent has connected', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.keyboard.press('ControlOrMeta+`');
    const pill = window.locator('[data-testid="mcp-status"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-running', 'true');

    // One authenticated request is what turns "listening" into
    // "connected". The pill polls, so allow it a couple of cycles.
    const config = await readConfig(project.dir);
    await rpc(config, 'ping');
    await expect(pill).toHaveAttribute('data-agent', 'connected', { timeout: 10_000 });
  });

  test('the copy button offers each agent its own connect command or config', async ({ window, app, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.keyboard.press('ControlOrMeta+`');
    const config = await readConfig(project.dir);
    await window.locator('[data-action="copy-mcp-command"]').click();
    const menu = window.getByTestId('mcp-connect-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(7);

    await menu.locator('[data-agent-id="codex"]').click();
    await expect(menu).toHaveCount(0);
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(['[mcp_servers.scamp]', `url = "${config.url}"`, `http_headers = { "X-Scamp-Token" = "${config.token}" }`].join('\n'));
  });
});

test.describe('checks across the project', () => {
  // A plain page that isn't open, using a token theme.css never declares.
  const PRICING_TSX = `import styles from './page.module.css';

export default function Pricing() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="a1b2" className={styles.card_a1b2}></div>
    </div>
  );
}
`;
  const PRICING_CSS = `.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  color: var(--nowhere-declared);\n}\n`;

  test.use({
    projectOptions: { format: 'nextjs', extraPages: ['pricing'], pageContent: { pricing: { tsx: PRICING_TSX, css: PRICING_CSS } } },
  });

  test('scamp_check_project and scamp_check_view see a plain page that isn’t open', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const config = await readConfig(project.dir);

    const all = JSON.parse(await callTool(config, 'scamp_check_project')) as {
      checked: number;
      withFindings: Array<{ name: string; kind: string; findings: Array<{ kind: string; message: string }> }>;
    };
    expect(all.checked).toBeGreaterThanOrEqual(2);
    expect(all.withFindings.map((r) => `${r.kind}:${r.name}`)).toEqual(['page:pricing']);
    expect(all.withFindings[0]?.findings[0]?.kind).toBe('undeclared-token');

    const one = JSON.parse(await callTool(config, 'scamp_check_view', { name: 'pricing' })) as {
      kind: string;
      findings: Array<{ message: string }>;
    };
    expect(one.kind).toBe('page');
    expect(one.findings[0]?.message).toContain('--nowhere-declared');

    // The open page is checked as the canvas shows it.
    expect(JSON.parse(await callTool(config, 'scamp_check_view', { name: 'home' })).findings).toEqual([]);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';

/**
 * The user's own agent writing Embedded Scamp's changes, with no API key:
 * choosing it on the setup screen, Scamp registering its MCP server in the
 * project for Claude Code and Codex (kept out of git), and the test standing in for Claude Code over
 * MCP: take the batch, write the CSS Module, say done, and the Changes tab
 * reviews exactly that file. see docs/plans/embedded-agent-connection-plan.md
 */

// Signed in, with no Anthropic key and no scripted agent. A home with Codex installed and no folder trusted,
// so the run doesn't depend on which agents this machine has.
const home = mkdtempSync(path.join(tmpdir(), 'scamp-home-'));
mkdirSync(path.join(home, '.codex'));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', HOME: home, USERPROFILE: home } });
test.afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

type McpConfig = { url: string; token: string };

const callTool = async (mcp: McpConfig, name: string, args: Record<string, unknown> = {}): Promise<string> => {
  const res = await fetch(mcp.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-scamp-token': mcp.token },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const body = (await res.json()) as { result: { content: Array<{ text: string }> } };
  return body.result.content.map((c) => c.text).join('');
};

test('with My agent chosen, the user’s agent takes the edits over MCP and Scamp reviews what it wrote', async ({ app, window }) => {
  const dir = await copyEmbeddedApp();
  try {
    const embedded = await openEmbedded(app, window, dir);

    // No key: the setup screen offers the user's own agent instead.
    await expect(embedded.locator('[data-check="agent"]')).toHaveAttribute('data-status', 'fail');
    await embedded.getByTestId('embedded-use-own-agent').click();
    await expect(embedded.locator('[data-check="agent"]')).toHaveAttribute('data-status', 'pass');
    await expect(embedded.locator('[data-check="agent"]')).toContainText('Your own agent writes changes');
    await startEmbedded(embedded);

    // Scamp registered its server for Claude Code, and kept the token out of git.
    const mcp = JSON.parse(await fs.readFile(path.join(dir, '.scamp', 'mcp.json'), 'utf8')) as McpConfig;
    const claude = JSON.parse(await fs.readFile(path.join(dir, '.mcp.json'), 'utf8')) as { mcpServers: { scamp: { url: string } } };
    expect(claude.mcpServers.scamp.url).toBe(mcp.url);
    const codex = await fs.readFile(path.join(dir, '.codex', 'config.toml'), 'utf8');
    expect(codex).toContain(`[mcp_servers.scamp]\nurl = "${mcp.url}"`);
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' });
    expect(status).not.toContain('.mcp.json');
    expect(status).not.toContain('.codex');

    // Starting with My agent and nothing connected, the steps and a terminal open over the editor.
    const connect = embedded.getByTestId('embedded-agent-connect');
    await expect(connect).toBeVisible();
    await expect(connect).toContainText('Waiting to connect');
    // Codex is installed but doesn't trust the folder: its button starts it with Scamp's server anyway.
    await expect(embedded.getByTestId('embedded-terminal-start-codex')).toBeVisible();
    await expect(connect).toContainText('choose Yes when it asks whether to trust this folder');

    // A terminal in the project's folder, whose session lives on while the window is minimized.
    const rows = embedded.locator('[data-testid="embedded-terminal"] .xterm-rows');
    await embedded.getByTestId('embedded-terminal').click();
    await embedded.keyboard.type('pwd');
    await embedded.keyboard.press('Enter');
    await expect(rows).toContainText(path.basename(dir));
    await embedded.getByTestId('embedded-terminal-paste').click();
    await expect(rows).toContainText('Work my Scamp edit queue');
    await embedded.getByTestId('embedded-agent-connect-minimize').click();
    await expect(connect).toBeHidden();
    await embedded.getByTestId('embedded-tab-agent').click();
    await expect(embedded.getByTestId('embedded-worker-own')).toHaveAttribute('aria-pressed', 'true');
    await expect(embedded.getByTestId('embedded-own-agent')).toContainText('Waiting to connect');
    await embedded.getByTestId('embedded-agent-connect-open').click();
    await expect(connect).toBeVisible();
    await expect(rows).toContainText('Work my Scamp edit queue');

    // The agent reaching Scamp's server minimizes the window into the Agent tab.
    await callTool(mcp, 'scamp_embedded_get_selection', {});
    await expect(connect).toBeHidden();
    await expect(embedded.getByTestId('embedded-own-agent')).toContainText('Connected');
    await expect(embedded.getByTestId('embedded-agent-connect-open')).toHaveText('Open terminal');

    // An edit to every card waits for the user's agent.
    await embedded.getByTestId('embedded-tab-style').click();
    await clickInPage(embedded, 'article', 'corner');
    await embedded.getByTestId('embedded-scope-all').click();
    await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '30');

    // The test stands in for Claude Code.
    const brief = await callTool(mcp, 'scamp_embedded_wait_for_edits', { waitSeconds: 20 });
    expect(brief).toContain('`padding`');
    expect(brief).toContain('→ `30px`');
    expect(brief).toContain('call scamp_embedded_done');
    await expect(embedded.getByTestId('embedded-agent-status')).toHaveText(/Writing/);
    const css = path.join(dir, 'src', 'Card.module.css');
    await fs.writeFile(css, (await fs.readFile(css, 'utf8')).replace('padding: 16px', 'padding: 30px'));
    expect(await callTool(mcp, 'scamp_embedded_done', { summary: 'Set the card padding to 30px.' })).toBe('Done. Scamp sees changes in: src/Card.module.css.');

    await embedded.getByTestId('embedded-tab-history').click();
    await expect(embedded.getByTestId('embedded-agent-status')).toHaveText(/Done/);
    await expect(embedded.getByTestId('embedded-review')).toContainText('src/Card.module.css');
    await expect(embedded.getByTestId('embedded-own-agent')).toContainText('Connected');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

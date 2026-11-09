import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';

/**
 * The user's own agent writing Embedded Scamp's changes, with no API key:
 * choosing it on the setup screen, Scamp registering its MCP server in the
 * project (kept out of git), and the test standing in for Claude Code over
 * MCP: take the batch, write the CSS Module, say done, and the Changes tab
 * reviews exactly that file. see docs/plans/embedded-agent-connection-plan.md
 */

// Signed in, with no Anthropic key and no scripted agent.
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1' } });

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
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' })).not.toContain('.mcp.json');

    await embedded.getByTestId('embedded-tab-changes').click();
    await expect(embedded.getByTestId('embedded-worker-own')).toHaveAttribute('aria-pressed', 'true');
    await expect(embedded.getByTestId('embedded-own-agent')).toContainText('Waiting for your agent to connect');

    // A terminal in the project's folder, beside the choice, that survives a switch of tabs.
    const rows = embedded.locator('[data-testid="embedded-terminal"] .xterm-rows');
    await embedded.getByTestId('embedded-terminal').click();
    await embedded.keyboard.type('pwd');
    await embedded.keyboard.press('Enter');
    await expect(rows).toContainText(path.basename(dir));
    await embedded.getByTestId('embedded-terminal-paste').click();
    await expect(rows).toContainText('Work my Scamp edit queue');
    await embedded.getByTestId('embedded-tab-style').click();
    await embedded.getByTestId('embedded-tab-changes').click();
    await expect(rows).toContainText(path.basename(dir));

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

    await embedded.getByTestId('embedded-tab-changes').click();
    await expect(embedded.getByTestId('embedded-agent-status')).toHaveText(/Done/);
    await expect(embedded.getByTestId('embedded-review')).toContainText('src/Card.module.css');
    await expect(embedded.getByTestId('embedded-own-agent')).toContainText('Your agent is connected');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

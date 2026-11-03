import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, gitIn, inPage, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';

/**
 * Embedded Scamp end to end, on a Vite + React fixture and the scripted
 * agent: set up, start, select a card, restyle it with the panel (live on
 * the page), the agent writes the CSS Module, then review and accept onto
 * the scamp/ branch. see docs/plans/embedded-scamp-plan.md
 */

const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-edit-${process.pid}.json`);
writeFileSync(
  SCRIPT,
  JSON.stringify([
    {
      content: [
        {
          type: 'tool_use',
          name: 'edit_file',
          input: { path: 'src/Card.module.css', old_string: '.card {\n  padding: 16px;', new_string: '.card {\n  padding: 24px;' },
        },
      ],
    },
    { content: [{ type: 'text', text: 'Set the card padding to 24px in src/Card.module.css.' }] },
  ])
);

test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });

const paddingOf = (index: number): string =>
  `getComputedStyle(document.querySelectorAll('article')[${index}]).paddingTop`;

test('restyles a card live, the agent writes it into the CSS Module, and accept commits it on a scamp/ branch', async ({ app, window }) => {
  const dir = await copyEmbeddedApp();
  try {
    const embedded = await openEmbedded(app, window, dir);

    // The setup screen: what passed, and what Start will do.
    await expect(embedded.getByRole('heading', { name: 'Set up fixture-embedded-app' })).toBeVisible();
    await expect(embedded.locator('[data-check="scamp"]')).toHaveAttribute('data-status', 'pass');
    await expect(embedded.locator('[data-check="bundler"]')).toHaveAttribute('data-status', 'pass');
    await expect(embedded.locator('[data-check="branch"]')).toHaveAttribute('data-status', 'action');
    await startEmbedded(embedded);
    expect(gitIn(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toMatch(/^scamp\//);

    // Every element carries its source; the card's JSX draws three.
    await expect.poll(() => inPage(embedded, `document.querySelectorAll('[data-scamp-src^="src/Card.jsx:4"]').length`)).toBe(3);

    await clickInPage(embedded, 'article', 'corner');
    await expect(embedded.getByTestId('embedded-source')).toContainText('src/Card.jsx:4');
    await expect(embedded.getByTestId('embedded-scope-all')).toHaveText('All 3');

    // Layer 1: the panel edit shows on the page at once, on this card only.
    await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '24');
    await expect.poll(() => inPage(embedded, paddingOf(0))).toBe('24px');
    expect(await inPage(embedded, paddingOf(1))).toBe('16px');
    await expect(embedded.getByTestId('embedded-pending')).toContainText('padding: 24px');

    // Layer 2: the agent writes it into the source in the project's idiom.
    await expect(embedded.getByTestId('embedded-agent-status')).toHaveText(/Done/, { timeout: 30_000 });
    expect(await fs.readFile(path.join(dir, 'src', 'Card.module.css'), 'utf-8')).toContain('padding: 24px;');
    // The page's preview is dropped; the real CSS, hot-reloaded, carries it.
    await expect.poll(() => inPage(embedded, `document.querySelector('article').style.padding`)).toBe('');
    await expect.poll(() => inPage(embedded, paddingOf(0)), { timeout: 15_000 }).toBe('24px');

    // Review and accept: one commit, only the agent's file.
    await embedded.getByTestId('embedded-tab-changes').click();
    await expect(embedded.getByTestId('embedded-review')).toContainText('src/Card.module.css');
    await expect(embedded.getByTestId('embedded-diff')).toContainText('+  padding: 24px;');
    await embedded.getByTestId('embedded-accept').click();
    await expect(embedded.getByTestId('embedded-notice')).toHaveText('Committed.');
    expect(gitIn(dir, 'log', '-1', '--format=%s')).toMatch(/^Scamp: /);
    expect(gitIn(dir, 'status', '--porcelain')).toBe('');
    await expect(embedded.getByTestId('embedded-commits')).toContainText('Scamp:');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

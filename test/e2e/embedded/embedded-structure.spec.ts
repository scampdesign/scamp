import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, inPage, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';

/**
 * The rest of the canvas gaps, end to end: an edit Scamp writes into a CSS
 * Module itself (gap 1), the conversation (13), the code view (14), the dev
 * server's output (15), delete and duplicate (7), Shift-click to select
 * more than one (9), and dropping a layer inside another (8).
 * see docs/plans/embedded-canvas-gaps.md
 */

// The agent is never needed: the first edit is written directly, and the queue is paused after.
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-structure-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([{ content: [{ type: 'text', text: 'Done.' }] }]));

test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });

const style = (selector: string, index: number, prop: string): string =>
  `getComputedStyle(document.querySelectorAll(${JSON.stringify(selector)})[${index}]).${prop}`;

test('writes certain edits itself, and deletes, duplicates, selects several, and moves inside', async ({ app, window }) => {
  const dir = await copyEmbeddedApp();
  try {
    const embedded = await openEmbedded(app, window, dir);
    await startEmbedded(embedded);
    const queue = embedded.getByTestId('embedded-queue');

    // Every card's padding: Scamp writes the CSS Module itself, and says so in the conversation.
    await clickInPage(embedded, 'article', 'corner');
    await embedded.getByTestId('embedded-scope-all').click();
    await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '30');
    await expect.poll(() => fs.readFile(path.join(dir, 'src', 'Card.module.css'), 'utf8'), { timeout: 15_000 }).toContain('padding: 30px;');
    await embedded.getByTestId('embedded-tab-agent').click();
    await expect(embedded.getByTestId('embedded-chat')).toContainText('Changed spacing on every Card');
    await expect(embedded.getByTestId('embedded-chat')).toContainText('Scamp wrote this directly, in src/Card.module.css.');
    await expect(embedded.getByTestId('embedded-server-output')).toBeVisible();
    await embedded.getByTestId('embedded-pause').click();
    await embedded.getByTestId('embedded-tab-style').click();

    // The code view: the element's JSX and the rules that style it.
    await clickInPage(embedded, 'article', 'corner');
    await embedded.getByTestId('embedded-code').locator('summary').click();
    await expect(embedded.getByTestId('embedded-code-jsx')).toContainText('<article className={styles.card}>');
    await expect(embedded.getByTestId('embedded-code-rule').first()).toContainText('padding');

    // Duplicate: a copy shows after it until the agent writes it.
    await clickInPage(embedded, '.title');
    await embedded.getByTestId('embedded-duplicate').click();
    await expect.poll(() => inPage<number>(embedded, `document.querySelectorAll('h1').length`)).toBe(2);

    // Delete: hidden at once, and Cmd+Z brings it back.
    await clickInPage(embedded, '.about-link');
    await embedded.getByTestId('embedded-delete').click();
    await expect.poll(() => inPage<string>(embedded, style('.about-link', 0, 'display'))).toBe('none');
    await embedded.getByTestId('embedded-tab-history').click();
    await embedded.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => inPage<string>(embedded, style('.about-link', 0, 'display'))).not.toBe('none');
    await embedded.getByTestId('embedded-tab-style').click();

    // Shift-click a second card: one edit reaches both, and not the third.
    await clickInPage(embedded, 'article', 'corner');
    await embedded.getByTestId('embedded-scope-one').click();
    const second = await inPage<{ x: number; y: number }>(embedded, `(() => { const r = document.querySelectorAll('article')[1].getBoundingClientRect(); return { x: r.left + 3, y: r.top + 3 }; })()`);
    const box = await embedded.getByTestId('embedded-webview').boundingBox();
    if (box === null) throw new Error('the webview is not on screen');
    await embedded.keyboard.down('Shift');
    await embedded.mouse.click(box.x + second.x, box.y + second.y);
    await embedded.keyboard.up('Shift');
    await expect(embedded.getByTestId('embedded-also')).toContainText('2 elements selected');
    await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '6');
    await expect.poll(() => inPage<string>(embedded, style('article', 0, 'paddingTop'))).toBe('6px');
    expect(await inPage<string>(embedded, style('article', 1, 'paddingTop'))).toBe('6px');
    expect(await inPage<string>(embedded, style('article', 2, 'paddingTop'))).toBe('30px');

    // In the tree, drop the hint on the middle of the footer's row: it moves inside.
    const hint = embedded.locator('[data-testid="embedded-layer"][data-tag="p"]');
    const footer = embedded.locator('[data-testid="embedded-layer"][data-tag="footer"]');
    const row = await footer.boundingBox();
    await hint.dragTo(footer, { targetPosition: { x: 20, y: (row?.height ?? 20) / 2 } });

    await embedded.getByTestId('embedded-tab-agent').click();
    await expect(queue).toContainText('Duplicated Heading');
    await expect(queue).toContainText('and 1 more');
    await expect(queue).toContainText('Moved Text into');
    await expect(queue).not.toContainText('Deleted');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

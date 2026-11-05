import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, hoverInPage, inPage, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';
/**
 * Embedded Scamp's other ways to edit: freezing a menu that closes on
 * leave, one edit reaching every instance, pause and batch, an instruction
 * in words, and the read-only design check. see docs/plans/embedded-scamp-plan.md
 */
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-modes-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    { content: [{ type: 'text', text: 'Set every card’s padding to 30px and made the title bolder.' }] },
    { content: [{ type: 'text', text: '## Tokens and consistency\n- src/App.css:30 uses #cccccc where the project has no token.' }] },
]));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });
const menuOpen = (embedded) => inPage(embedded, `document.querySelector('.menu-item') !== null`);
test('freeze holds a menu open, one edit reaches every instance, and pause batches edits with an instruction', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        const panel = embedded.getByTestId('embedded-style-tab');
        // Without freeze, the menu closes the moment the pointer leaves it.
        await embedded.getByTestId('embedded-edit-toggle').click();
        await clickInPage(embedded, '.menu-button');
        await expect.poll(() => menuOpen(embedded)).toBe(true);
        await hoverInPage(embedded, '.cards', 'corner');
        await expect.poll(() => menuOpen(embedded)).toBe(false);
        // F8, with the pointer still on the page, freezes it open.
        await clickInPage(embedded, '.menu-button');
        await expect.poll(() => menuOpen(embedded)).toBe(true);
        await embedded.keyboard.press('F8');
        await expect(embedded.getByTestId('embedded-freeze-toggle')).toHaveAttribute('aria-pressed', 'true');
        await hoverInPage(embedded, '.cards', 'corner');
        await embedded.getByTestId('embedded-edit-toggle').click();
        expect(await menuOpen(embedded)).toBe(true);
        await clickInPage(embedded, '.menu-item');
        await expect(embedded.getByTestId('embedded-source')).toContainText('src/Menu.jsx');
        // Paused, edits wait in the queue.
        await embedded.getByTestId('embedded-tab-changes').click();
        await embedded.getByTestId('embedded-pause').click();
        await embedded.getByTestId('embedded-tab-style').click();
        // One edit, every instance.
        await clickInPage(embedded, 'article', 'corner');
        await embedded.getByTestId('embedded-scope-all').click();
        await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '30');
        await expect
            .poll(() => inPage(embedded, `Array.from(document.querySelectorAll('article')).map((a) => getComputedStyle(a).paddingTop).join(',')`))
            .toBe('30px,30px,30px');
        // An instruction in words joins the queue.
        await panel.getByTestId('embedded-instruction').fill('make the title bolder');
        await panel.getByRole('button', { name: 'Ask the agent' }).click();
        await embedded.getByTestId('embedded-tab-changes').click();
        const queue = embedded.getByTestId('embedded-queue');
        await expect(queue.locator('li')).toHaveCount(2);
        await expect(queue).toContainText('padding → 30px (all)');
        await expect(queue).toContainText('make the title bolder');
        // Run now sends both as one batch.
        await embedded.getByTestId('embedded-run-now').click();
        await expect(embedded.getByTestId('embedded-agent-status')).toHaveText(/Done/, { timeout: 30_000 });
        await expect(queue).toHaveCount(0);
        // The design check reads the project and reports, writing nothing.
        await embedded.getByTestId('embedded-tab-checks').click();
        await embedded.getByTestId('embedded-design-check').click();
        await expect(embedded.getByTestId('embedded-report')).toContainText('Tokens and consistency', { timeout: 30_000 });
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
test.describe('agent not connected', () => {
    test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1' } });
    test('the setup screen keeps Start off until the agent is connected, and the project is in Recent next time', async ({ app, window }) => {
        const dir = await copyEmbeddedApp();
        try {
            const embedded = await openEmbedded(app, window, dir);
            await expect(embedded.locator('[data-check="scamp"]')).toHaveAttribute('data-status', 'pass');
            await expect(embedded.locator('[data-check="agent"]')).toHaveAttribute('data-status', 'fail');
            await expect(embedded.locator('[data-check="agent"]').getByLabel('Anthropic API key')).toBeVisible();
            // What does pass still says so.
            await expect(embedded.locator('[data-check="bundler"]')).toHaveAttribute('data-status', 'pass');
            await expect(embedded.locator('[data-check="git"]')).toHaveAttribute('data-status', 'pass');
            await expect(embedded.getByTestId('embedded-start')).toBeDisabled();
            await embedded.close();
            // A new window lists the project; one click opens it, with no folder dialog.
            const reopened = app.waitForEvent('window');
            await window.evaluate(() => globalThis.scamp.openEmbedded());
            const again = await reopened;
            const recent = again.getByTestId('embedded-recent');
            await expect(recent).toContainText(dir);
            await recent.locator('button', { hasText: dir }).click();
            await expect(again.locator('[data-check="bundler"]')).toHaveAttribute('data-status', 'pass');
        }
        finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
test.describe('without the flag', () => {
    test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_EMBEDDED: '0' } });
    test('the start screen hides Edit React Project, and main refuses to open the window', async ({ window }) => {
        await expect(window.getByRole('button', { name: 'Open Project' })).toBeVisible();
        await expect(window.getByTestId('start-edit-react-project')).toHaveCount(0);
        const opened = await window.evaluate(() => globalThis.scamp.openEmbedded());
        expect(opened).toBe(false);
    });
});

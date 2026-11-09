import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, inPage, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';
/**
 * Undo, history, and breakpoints in Embedded Scamp: Cmd+Z takes back a
 * queued edit and its preview, then what an agent run wrote; after Accept
 * the change is in the history, and clicking an entry moves the project
 * there and back; an edit made at mobile width applies only up to it.
 * see docs/plans/embedded-canvas-gaps.md (P2, P3, P4)
 */
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-undo-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    {
        content: [
            {
                type: 'tool_use',
                name: 'edit_file',
                input: { path: 'src/Card.module.css', old_string: '.card {\n  padding: 16px;', new_string: '.card {\n  padding: 30px;' },
            },
        ],
    },
    { content: [{ type: 'text', text: 'Set the card padding to 30px.' }] },
]));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });
const padding = (embedded, index = 0) => inPage(embedded, `getComputedStyle(document.querySelectorAll('article')[${index}]).paddingTop`);
test('Cmd+Z undoes a queued edit and an agent run, the history goes back and forward, and a mobile edit stays at mobile', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    const cssFile = path.join(dir, 'src', 'Card.module.css');
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        const queue = embedded.getByTestId('embedded-queue');
        const pauseQueue = async () => {
            await embedded.getByTestId('embedded-tab-changes').click();
            if ((await embedded.getByTestId('embedded-pause').getAttribute('aria-pressed')) !== 'true')
                await embedded.getByTestId('embedded-pause').click();
        };
        // Cmd+Z from the window, not a field: a click on a tab moves focus there.
        const press = async (keys) => {
            await embedded.getByTestId('embedded-tab-changes').click();
            await embedded.keyboard.press(keys);
        };
        // Undo and redo a queued edit, preview and all.
        await pauseQueue();
        await embedded.getByTestId('embedded-tab-style').click();
        await clickInPage(embedded, 'article', 'corner');
        await embedded.getByTestId('embedded-scope-all').click();
        await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '30');
        await expect.poll(() => padding(embedded, 2)).toBe('30px');
        await press('ControlOrMeta+z');
        await expect(embedded.getByTestId('embedded-toast')).toContainText('Undid');
        await expect(queue.locator('li')).toHaveCount(0);
        await expect.poll(() => padding(embedded, 2)).toBe('16px');
        await press('ControlOrMeta+Shift+z');
        await expect(queue).toContainText('padding → 30px (all)');
        await expect.poll(() => padding(embedded, 2)).toBe('30px');
        // Undo and redo what the agent wrote.
        await embedded.getByTestId('embedded-pause').click();
        await expect(embedded.getByTestId('embedded-agent-status')).toHaveText(/Done/, { timeout: 30_000 });
        expect(await fs.readFile(cssFile, 'utf8')).toContain('padding: 30px');
        await press('ControlOrMeta+z');
        await expect.poll(async () => fs.readFile(cssFile, 'utf8')).toContain('padding: 16px');
        await press('ControlOrMeta+Shift+z');
        await expect.poll(async () => fs.readFile(cssFile, 'utf8')).toContain('padding: 30px');
        // Accept: the change is in the history, which goes back and forward.
        await embedded.getByTestId('embedded-accept').click();
        const history = embedded.getByTestId('embedded-history');
        await expect(history).toContainText('padding → 30px (all)');
        await history.getByRole('button', { name: /Session start/ }).click();
        await expect.poll(async () => fs.readFile(cssFile, 'utf8')).toContain('padding: 16px');
        await expect(history.locator('[data-undone="true"]')).toHaveCount(1);
        await history.getByRole('button', { name: /padding → 30px/ }).click();
        await expect.poll(async () => fs.readFile(cssFile, 'utf8')).toContain('padding: 30px');
        await expect(history.locator('[data-undone="true"]')).toHaveCount(0);
        // A mobile edit applies at mobile, not at desktop.
        await pauseQueue();
        await embedded.getByTestId('embedded-viewport-mobile').click();
        await expect.poll(async () => Math.round((await embedded.getByTestId('embedded-webview').boundingBox())?.width ?? 0)).toBe(390);
        await expect.poll(() => padding(embedded)).toBe('30px');
        await embedded.getByTestId('embedded-tab-style').click();
        await clickInPage(embedded, 'article', 'corner');
        await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '10');
        await expect.poll(() => padding(embedded)).toBe('10px');
        await embedded.getByTestId('embedded-tab-changes').click();
        await expect(queue).toContainText('<article @390> padding → 10px');
        await embedded.getByTestId('embedded-viewport-desktop').click();
        await expect.poll(() => padding(embedded)).toBe('30px');
        await embedded.getByTestId('embedded-viewport-mobile').click();
        await expect.poll(() => padding(embedded)).toBe('10px');
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

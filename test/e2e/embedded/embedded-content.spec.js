import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, guestPage, inPage, openEmbedded, pointInPage, startEmbedded } from '../fixtures/embedded';
/**
 * Editing content from the page: text written in the JSX, a prop written
 * where its component is used, a link's target and an image's alt text,
 * and text from data, which Scamp won't edit and says why. The in-page
 * editor opens on a double-click. see docs/plans/embedded-canvas-gaps.md (P5)
 */
// The queue stays paused, so the scripted agent never runs; it only connects the agent.
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-content-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([{ content: [{ type: 'text', text: 'Done.' }] }]));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });
const textOf = (embedded, selector) => inPage(embedded, `document.querySelector(${JSON.stringify(selector)}).textContent`);
test('text, props, links, and alt text written in the code are editable; text from data says why it isn’t', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        await embedded.getByTestId('embedded-tab-agent').click();
        await embedded.getByTestId('embedded-pause').click();
        await embedded.getByTestId('embedded-tab-style').click();
        const queue = embedded.getByTestId('embedded-queue');
        // Written in the JSX: edited in the panel, shown on the page at once, and undone.
        await clickInPage(embedded, '.title');
        const text = embedded.getByTestId('embedded-content-text');
        await expect(text).toHaveValue('Team');
        await expect(embedded.getByTestId('embedded-content-text-note')).toContainText('Written at src/App.jsx:');
        await text.fill('Our team');
        await text.press('Enter');
        await expect.poll(() => textOf(embedded, '.title')).toBe('Our team');
        await expect(queue).toContainText('Changed the text on Heading');
        await embedded.getByTestId('embedded-tab-history').click();
        await embedded.keyboard.press('ControlOrMeta+z');
        await expect.poll(() => textOf(embedded, '.title')).toBe('Team');
        await expect(queue.locator('li')).toHaveCount(0);
        await embedded.getByTestId('embedded-tab-style').click();
        // From data: a card's name comes from a list. Not editable, and it says why.
        await clickInPage(embedded, 'article h2');
        await expect(embedded.getByTestId('embedded-content-text-note')).toContainText('can’t be edited here');
        await expect(embedded.getByTestId('embedded-content-text')).toBeDisabled();
        const card = await pointInPage(embedded, 'article h2', 'center');
        await embedded.mouse.dblclick(card.x, card.y);
        await expect(embedded.getByTestId('embedded-toast')).toContainText('can’t be edited here');
        expect(await inPage(embedded, `document.querySelectorAll('[data-scamp-editor]').length`)).toBe(0);
        // A prop written where the component is used: editable there.
        await clickInPage(embedded, '.badge');
        await expect(embedded.getByTestId('embedded-content-text-note')).toContainText('Set where Badge is used, at src/App.jsx:');
        await embedded.getByTestId('embedded-content-text').fill('Fresh');
        await embedded.getByTestId('embedded-content-text').press('Enter');
        await expect.poll(() => textOf(embedded, '.badge')).toBe('Fresh');
        // A link's target and an image's alt text, written in the JSX.
        await clickInPage(embedded, '.about-link');
        await expect(embedded.getByTestId('embedded-content-href')).toHaveValue('/about');
        await embedded.getByTestId('embedded-content-href').fill('/team');
        await embedded.getByTestId('embedded-content-href').press('Enter');
        await expect.poll(() => inPage(embedded, `document.querySelector('.about-link').getAttribute('href')`)).toBe('/team');
        await clickInPage(embedded, '.logo');
        await expect(embedded.getByTestId('embedded-content-alt')).toHaveValue('Logo');
        await embedded.getByTestId('embedded-content-alt').fill('Scamp logo');
        await embedded.getByTestId('embedded-content-alt').press('Enter');
        await expect.poll(() => inPage(embedded, `document.querySelector('.logo').getAttribute('alt')`)).toBe('Scamp logo');
        // Double-click text written in the JSX: the in-page editor opens, and Enter keeps it.
        const title = await pointInPage(embedded, '.title', 'center');
        await embedded.mouse.dblclick(title.x, title.y);
        await expect.poll(() => inPage(embedded, `document.querySelectorAll('[data-scamp-editor]').length`)).toBe(1);
        await guestPage(app).keyboard.type('People');
        await guestPage(app).keyboard.press('Enter');
        await expect.poll(() => textOf(embedded, '.title')).toBe('People');
        expect(await inPage(embedded, `document.querySelectorAll('[data-scamp-editor]').length`)).toBe(0);
        await embedded.getByTestId('embedded-tab-agent').click();
        await expect(queue).toContainText('Changed the text on Badge');
        await expect(queue).toContainText('Changed the link on Link');
        await expect(queue).toContainText('Changed the alt text on Image');
        await expect(queue.locator('li')).toHaveCount(4);
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

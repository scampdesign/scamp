import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, inPage, openEmbedded, pointInPage, startEmbedded } from '../fixtures/embedded';
/**
 * Reordering in Embedded Scamp: dragging the selection on the page among
 * its siblings (a flex row), and dragging a layer in the tree (block flow).
 * Each shows as it'll look, with a stand-in copy where the element goes,
 * and queues a move for the agent. see docs/notes/embedded-move-preview.md
 */
// The queue stays paused, so the scripted agent never runs; it only connects the agent.
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-reorder-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([{ content: [{ type: 'text', text: 'Done.' }] }]));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });
/** The cards' names, left to right as drawn (a moved card's hidden original isn't drawn). */
const cardOrder = (embedded) => inPage(embedded, `Array.from(document.querySelectorAll('article')).filter((a) => a.getClientRects().length > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((a) => a.textContent.trim()).join(',')`);
test('dragging on the page and in the layers tree reorders siblings and queues each move', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        await embedded.getByTestId('embedded-tab-agent').click();
        await embedded.getByTestId('embedded-pause').click();
        const queue = embedded.getByTestId('embedded-queue');
        // The queue only shows on Agent, the drag note only on Style: check each where it is.
        await embedded.getByTestId('embedded-tab-style').click();
        // On the page: select the first card's title and drag it past the third card. The title
        // has no siblings, so the card moves, and the row previews it.
        expect(await cardOrder(embedded)).toBe('Ada Lovelace,Grace Hopper,Katherine Johnson');
        await clickInPage(embedded, 'article h2');
        await expect(embedded.getByTestId('embedded-style-tab')).toContainText('<h2>');
        const from = await pointInPage(embedded, 'article h2', 'center');
        const box = await embedded.getByTestId('embedded-webview').boundingBox();
        const third = await inPage(embedded, `(() => { const r = document.querySelectorAll('article')[2].getBoundingClientRect(); return { x: r.right - 4, y: r.top + r.height / 2 }; })()`);
        if (box === null)
            throw new Error('the webview is not on screen');
        await embedded.mouse.move(from.x, from.y);
        await embedded.mouse.down();
        await embedded.mouse.move(box.x + third.x, box.y + third.y, { steps: 12 });
        // Before letting go, the page already shows where it lands.
        await expect.poll(() => cardOrder(embedded)).toBe('Grace Hopper,Katherine Johnson,Ada Lovelace');
        await embedded.mouse.up();
        await expect.poll(() => cardOrder(embedded)).toBe('Grace Hopper,Katherine Johnson,Ada Lovelace');
        await expect(embedded.getByTestId('embedded-drag-note')).toContainText('Moving the <article> around it');
        await embedded.getByTestId('embedded-tab-agent').click();
        await expect(queue).toContainText('Moved Card after “Katherine Johnson”');
        await embedded.getByTestId('embedded-tab-style').click();
        // An element with nothing to move between says so, and moves nothing.
        await inPage(embedded, `(() => { const d = document.createElement('div'); d.className = 'solo'; d.innerHTML = '<span>Alone</span>'; document.body.append(d); })()`);
        await clickInPage(embedded, '.solo span');
        const solo = await pointInPage(embedded, '.solo span', 'center');
        await embedded.mouse.move(solo.x, solo.y);
        await embedded.mouse.down();
        await embedded.mouse.move(solo.x + 40, solo.y - 60, { steps: 8 });
        await embedded.mouse.up();
        await expect(embedded.getByTestId('embedded-drag-note')).toContainText('no siblings to move between');
        await embedded.getByTestId('embedded-tab-agent').click();
        await expect(queue.locator('li')).toHaveCount(1);
        // In the tree: drag the hint above the title. Block flow shows it there too, as a stand-in.
        const hint = embedded.locator('[data-testid="embedded-layer"][data-tag="p"]');
        const title = embedded.locator('[data-testid="embedded-layer"][data-tag="h1"]');
        await hint.dragTo(title, { targetPosition: { x: 20, y: 2 } });
        await expect(queue).toContainText('Moved Text before “Team”');
        expect(await inPage(embedded, `document.querySelector('p[data-scamp-ghost]').nextElementSibling.matches('h1')`)).toBe(true);
        expect(await inPage(embedded, `getComputedStyle(document.querySelector('p.hint:not([data-scamp-ghost])')).display`)).toBe('none');
        // In the tree, a layer with no siblings lifts too: the menu's button moves its menu.
        const button = embedded.locator('[data-testid="embedded-layer"][data-tag="button"]');
        await button.dragTo(title, { targetPosition: { x: 20, y: 2 } });
        await expect(embedded.getByTestId('embedded-layers-note')).toContainText('Moving the layer around it');
        await expect(queue).toContainText('Moved Menu before “Team”');
        await expect(queue.locator('li')).toHaveCount(3);
        await embedded.getByTestId('embedded-tab-style').click();
        // A list kept in state: the move is taken back, and the reason shown.
        const tagOrder = () => inPage(embedded, `Array.from(document.querySelectorAll('.tag')).filter((t) => t.getClientRects().length > 0).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((t) => t.textContent.trim()).join(',')`);
        await clickInPage(embedded, '.tag');
        const tag = await pointInPage(embedded, '.tag', 'center');
        const lastTag = await pointInPage(embedded, '.tag:last-child', 'center');
        await embedded.mouse.move(tag.x, tag.y);
        await embedded.mouse.down();
        await embedded.mouse.move(lastTag.x, lastTag.y + 6, { steps: 10 });
        await embedded.mouse.up();
        await expect(embedded.getByTestId('embedded-drag-note')).toContainText('the list `tags` is kept in state while the app runs');
        await expect.poll(tagOrder).toBe('Fast,Small,Local');
        // A closed <details> shows only its summary: Select parent reaches the <details>, and a drag of the summary moves it.
        await clickInPage(embedded, '.more-summary');
        await embedded.getByTestId('embedded-select-parent').click();
        await expect(embedded.getByTestId('embedded-style-tab')).toContainText('<details>');
        await clickInPage(embedded, '.more-summary');
        const summary = await pointInPage(embedded, '.more-summary', 'center');
        const tags = await pointInPage(embedded, '.tags', 'corner');
        await embedded.mouse.move(summary.x, summary.y);
        await embedded.mouse.down();
        await embedded.mouse.move(tags.x, tags.y, { steps: 10 });
        await embedded.mouse.up();
        await expect(embedded.getByTestId('embedded-drag-note')).toContainText('Moving the <details> around it');
        await embedded.getByTestId('embedded-tab-agent').click();
        await expect(queue.locator('li')).toHaveCount(4);
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, inPage, openEmbedded, pointInPage, startEmbedded } from '../fixtures/embedded';
/**
 * Reordering in Embedded Scamp: dragging the selection on the page among
 * its siblings (a flex row, previewed with `order`), and dragging a layer
 * in the tree (block flow, marked until the agent writes it). Both queue a
 * move for the agent. see docs/plans/embedded-scamp-plan.md
 */
// The queue stays paused, so the scripted agent never runs; it only connects the agent.
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-reorder-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([{ content: [{ type: 'text', text: 'Done.' }] }]));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });
/** The cards' names, left to right as drawn. */
const cardOrder = (embedded) => inPage(embedded, `Array.from(document.querySelectorAll('article')).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((a) => a.textContent.trim()).join(',')`);
test('dragging on the page and in the layers tree reorders siblings and queues each move', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        await embedded.getByTestId('embedded-tab-changes').click();
        await embedded.getByTestId('embedded-pause').click();
        const queue = embedded.getByTestId('embedded-queue');
        // The queue only shows on Changes, the drag note only on Style: check each where it is.
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
        await embedded.mouse.up();
        await expect.poll(() => cardOrder(embedded)).toBe('Grace Hopper,Katherine Johnson,Ada Lovelace');
        await expect(embedded.getByTestId('embedded-drag-note')).toContainText('Moving the <article> around it');
        await embedded.getByTestId('embedded-tab-changes').click();
        await expect(queue).toContainText('Move <article> after <article> “Katherine Johnson”');
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
        await embedded.getByTestId('embedded-tab-changes').click();
        await expect(queue.locator('li')).toHaveCount(1);
        // In the tree: drag the hint above the title. Block flow can't preview it; it's marked instead.
        const hint = embedded.locator('[data-testid="embedded-layer"][data-tag="p"]');
        const title = embedded.locator('[data-testid="embedded-layer"][data-tag="h1"]');
        await hint.dragTo(title, { targetPosition: { x: 20, y: 2 } });
        await expect(queue).toContainText('Move <p> before <h1> “Team”');
        expect(await inPage(embedded, `document.querySelectorAll('[data-scamp-overlay][title^="Moves here"]').length`)).toBe(1);
        // In the tree, a layer with no siblings lifts too: the menu's button moves its menu.
        const button = embedded.locator('[data-testid="embedded-layer"][data-tag="button"]');
        await button.dragTo(title, { targetPosition: { x: 20, y: 2 } });
        await expect(embedded.getByTestId('embedded-layers-note')).toContainText('Moving the layer around it');
        await expect(queue).toContainText('Move <div> before <h1> “Team”');
        await expect(queue.locator('li')).toHaveCount(3);
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

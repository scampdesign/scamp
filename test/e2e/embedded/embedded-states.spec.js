import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures/app';
import { clickInPage, copyEmbeddedApp, hoverInPage, inPage, openEmbedded, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';
/**
 * Embedded Scamp's hover states and layers: F8 holding a tooltip that only
 * CSS `:hover` shows, forcing `:hover` on the selection and styling that
 * state alone, and selecting from the layers tree. see docs/plans/embedded-scamp-plan.md
 */
// The queue stays paused, so the scripted agent never runs; it only connects the agent.
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-states-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([{ content: [{ type: 'text', text: 'Done.' }] }]));
test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });
const tipShown = (embedded) => inPage(embedded, `getComputedStyle(document.querySelector('.tip')).display`);
const titleStyle = (embedded, prop) => inPage(embedded, `getComputedStyle(document.querySelector('.title')).getPropertyValue(${JSON.stringify(prop)})`);
test('freeze holds CSS hover, a forced :hover state takes its own edits, and the layers tree selects', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        // A CSS-only tooltip: gone the moment the pointer leaves, unless frozen.
        await embedded.getByTestId('embedded-edit-toggle').click();
        await hoverInPage(embedded, '.hint', 'corner');
        await expect.poll(() => tipShown(embedded)).toBe('inline');
        await embedded.keyboard.press('F8');
        await expect(embedded.getByTestId('embedded-held')).toContainText('Holding :hover');
        // Off the tooltip, within the page: a move out to Scamp's toolbar never reaches the page.
        await hoverInPage(embedded, '.cards', 'corner');
        await expect.poll(() => tipShown(embedded)).toBe('inline');
        await embedded.getByTestId('embedded-release').click();
        await expect.poll(() => tipShown(embedded)).toBe('none');
        await expect(embedded.getByTestId('embedded-held')).toHaveCount(0);
        await embedded.getByTestId('embedded-edit-toggle').click();
        // Pause the agent so the hover edit waits in the queue.
        await embedded.getByTestId('embedded-tab-changes').click();
        await embedded.getByTestId('embedded-pause').click();
        await embedded.getByTestId('embedded-tab-style').click();
        // Select from the layers tree.
        await embedded.locator('[data-testid="embedded-layer"][data-tag="h1"]').click();
        await expect(embedded.getByTestId('embedded-source')).toContainText('src/App.jsx');
        await expect(embedded.locator('[data-testid="embedded-layer"][aria-selected="true"]')).toHaveAttribute('data-tag', 'h1');
        // Force :hover: the page draws the hover color with the pointer elsewhere.
        expect(await titleStyle(embedded, 'color')).not.toBe('rgb(200, 0, 0)');
        await embedded.getByTestId('embedded-state-hover').click();
        await expect.poll(() => titleStyle(embedded, 'color')).toBe('rgb(200, 0, 0)');
        await expect(embedded.getByTestId('embedded-held')).toContainText(':hover on h1');
        // An edit in that state previews only while it's forced.
        await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '30');
        await expect.poll(() => titleStyle(embedded, 'padding-top')).toBe('30px');
        await embedded.getByTestId('embedded-state-none').click();
        await expect.poll(() => titleStyle(embedded, 'color')).not.toBe('rgb(200, 0, 0)');
        expect(await titleStyle(embedded, 'padding-top')).toBe('0px');
        // The queue says the edit is for :hover.
        await embedded.getByTestId('embedded-tab-changes').click();
        await expect(embedded.getByTestId('embedded-queue')).toContainText('<h1:hover> padding → 30px');
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
test('the path field lists routes found on load, and an element Scamp can’t map is still edited and queued', async ({ app, window }) => {
    const dir = await copyEmbeddedApp();
    try {
        const embedded = await openEmbedded(app, window, dir);
        await startEmbedded(embedded);
        // Links on the page become routes under the path field.
        await embedded.getByTestId('embedded-path').focus();
        const routes = embedded.getByTestId('embedded-routes');
        await expect(routes.getByRole('option', { name: '/about' })).toBeVisible();
        await routes.getByRole('option', { name: '/about' }).click();
        await expect.poll(() => inPage(embedded, 'location.pathname')).toBe('/about');
        // An element no JSX wrote: no source, no React debug info.
        await inPage(embedded, `(() => { const d = document.createElement('div'); d.className = 'injected'; d.textContent = 'Injected note'; d.style.padding = '4px'; document.body.append(d); })()`);
        await embedded.getByTestId('embedded-tab-changes').click();
        await embedded.getByTestId('embedded-pause').click();
        await embedded.getByTestId('embedded-tab-style').click();
        await clickInPage(embedded, '.injected');
        await expect(embedded.getByTestId('embedded-source-note')).toContainText('Your edits still work');
        await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '20');
        await expect.poll(() => inPage(embedded, `getComputedStyle(document.querySelector('.injected')).paddingTop`)).toBe('20px');
        await embedded.getByTestId('embedded-tab-changes').click();
        await expect(embedded.getByTestId('embedded-queue')).toContainText('<div> padding → 20px');
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

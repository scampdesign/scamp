import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { test, expect } from '../fixtures/app';
import { importFrom, openPagesSection } from '../fixtures/components';
import { pageRoot } from '../fixtures/selectors';
/**
 * AI-assisted import, end to end on the scripted provider: import a page,
 * pick a token mode in the import window, and the cleanup starts in the
 * Agent panel under the skill — plan first, applied only on approval.
 * see docs/plans/builtin-agent-plan.md
 */
const FIXTURE_URL = pathToFileURL(path.resolve(__dirname, '../../fixtures/import/pages/marketing.html')).href;
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-import-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    // The plan turn: proves the skill's instructions reached the model.
    { content: [{ type: 'echo_system' }] },
    // The apply turn, after "Apply this plan".
    { content: [{ type: 'tool_use', name: 'scamp_set_styles', input: { element: 'root', set: 'opacity: 1' } }] },
    { content: [{ type: 'text', text: 'Cleanup done.' }] },
]));
test.use({ projectOptions: { format: 'scamp' } });
const importFixture = async (app, window) => {
    await openPagesSection(window);
    const opened = app.waitForEvent('window');
    await importFrom(window, 'website');
    const importWindow = await opened;
    await importWindow.waitForLoadState('domcontentloaded');
    const urlBar = importWindow.getByLabel('Address');
    await urlBar.fill(FIXTURE_URL);
    await urlBar.press('Enter');
    const importButton = importWindow.getByRole('button', { name: 'Import', exact: true });
    await expect(importButton).toBeEnabled();
    await importButton.click();
    await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 30_000 });
    return importWindow;
};
test.describe('signed out', () => {
    test('the import window offers no cleanup', async ({ app, window }) => {
        await expect(pageRoot(window)).toBeVisible();
        const importWindow = await importFixture(app, window);
        await expect(importWindow.getByTestId('import-cleanup')).toHaveCount(0);
    });
});
test.describe('signed in, with a key', () => {
    test.use({
        appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
    });
    test('picks a token mode in the import window, plans, and applies on approval', async ({ app, window }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Connect first: the import window only offers a cleanup that can run.
        await window.locator('[data-section="agent"]').click();
        await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
        await window.getByRole('button', { name: 'Connect' }).click();
        await expect(window.getByLabel('Message the agent')).toBeVisible();
        const importWindow = await importFixture(app, window);
        const offer = importWindow.getByTestId('import-cleanup');
        await expect(offer).toContainText('Clean up with AI');
        await offer.getByRole('button', { name: 'Keep hex values' }).click();
        await expect(offer).toContainText('Cleanup started');
        // The app window takes it from here, in the Agent panel.
        await expect(window.getByTestId('agent-panel')).toBeVisible();
        await expect(window.getByTestId('agent-user-message')).toContainText('Clean up ');
        await expect(window.getByTestId('agent-user-message')).toContainText('the page I just imported');
        const plan = window.getByTestId('agent-reply').first();
        await expect(plan).toHaveAttribute('data-status', 'done');
        // The cleanup skill's instructions are what the model was given.
        await expect(plan).toContainText('System: You are cleaning up a page Scamp imported');
        // Nothing is edited until the plan is approved.
        await expect(window.getByTestId('agent-tool')).toHaveCount(0);
        await window.getByRole('button', { name: 'Apply this plan' }).click();
        await expect(window.getByTestId('agent-plan-bar')).toHaveCount(0);
        const applied = window.getByTestId('agent-reply').nth(1);
        await expect(applied).toHaveAttribute('data-status', 'done');
        await expect(applied.getByTestId('agent-tool')).toHaveText(/^Updated root — opacity: 1;/);
    });
    test('offers the cleanup in the Agent panel too, for the view just imported', async ({ app, window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await window.locator('[data-section="agent"]').click();
        await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
        await window.getByRole('button', { name: 'Connect' }).click();
        const importWindow = await importFixture(app, window);
        await importWindow.close();
        await window.locator('[data-section="agent"]').click();
        const card = window.getByTestId('agent-cleanup-card');
        await expect(card).toContainText('Clean up ');
        await card.getByRole('button', { name: /Create theme tokens/ }).click();
        await expect(window.getByTestId('agent-user-message')).toContainText('the page I just imported');
        await expect(window.getByTestId('agent-reply').first()).toContainText('System: You are cleaning up');
        await expect(window.getByRole('button', { name: 'Apply this plan' })).toBeVisible();
    });
});

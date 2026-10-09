import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stubOpenDialog, test, expect } from '../fixtures/app';
import { openPagesSection } from '../fixtures/components';
import { copyFixtureApp } from '../fixtures/reactApp';
import { pageRoot } from '../fixtures/selectors';
/**
 * The React import's AI pass, end to end on the scripted provider: after a
 * multi-page import, the Agent panel offers to tidy a view from the app's
 * source; the agent reads it, plans, and renames a list on approval.
 * see docs/plans/react-import-plan.md, Phase 6
 */
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-react-tidy-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    // The plan turn: read the source, then answer with what it said.
    { content: [{ type: 'tool_use', name: 'scamp_get_react_source', input: { target: 'TeamDetail' } }] },
    { content: [{ type: 'echo_tool_result' }] },
    // The apply turn, after "Apply this plan".
    { content: [{ type: 'tool_use', name: 'scamp_rename_list', input: { list: 'members', to: 'team', row: 'person' } }] },
    { content: [{ type: 'text', text: 'Tidied.' }] },
]));
test.use({
    projectOptions: { format: 'scamp' },
    appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
});
test('tidies an imported view from the app’s source: reads, plans, applies on approval', async ({ app, window, project }) => {
    const appDir = await copyFixtureApp();
    try {
        await expect(pageRoot(window)).toBeVisible();
        await window.locator('[data-section="agent"]').click();
        await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
        await window.getByRole('button', { name: 'Connect' }).click();
        await expect(window.getByLabel('Message the agent')).toBeVisible();
        // Import the app's pages into this project.
        await openPagesSection(window);
        await stubOpenDialog(app, appDir);
        await window.getByRole('button', { name: /Import a React app/ }).click();
        const dialog = window.getByTestId('react-import-dialog');
        await dialog.getByRole('button', { name: 'Choose folder…' }).click();
        const opened = app.waitForEvent('window');
        await dialog.getByRole('button', { name: 'Run and import' }).click();
        const importWindow = await opened;
        const routes = importWindow.getByTestId('react-routes');
        await expect(routes.getByRole('button', { name: '/about' })).toBeVisible({ timeout: 30_000 });
        await routes.getByRole('checkbox', { name: 'Import /team/:member' }).check();
        await routes.getByLabel('/team/:member: member').fill('ada');
        await routes.getByRole('button', { name: /^Import \d+ pages$/ }).click();
        await expect(importWindow.getByTestId('import-batch-repeats')).toContainText('members', { timeout: 120_000 });
        await importWindow.close();
        // The last page imported is open; the panel offers to tidy it.
        await window.locator('[data-section="agent"]').click();
        const card = window.getByTestId('agent-react-tidy-card');
        await expect(card).toContainText('Tidy up TeamDetail');
        await card.getByRole('button', { name: /Tidy up with AI/ }).click();
        // A plan from the source, and nothing changed yet.
        await expect(window.getByTestId('agent-user-message')).toContainText('Tidy up TeamDetail, which I imported from the React app fixture-react-app');
        const reply = window.getByTestId('agent-reply').first();
        await expect(reply).toHaveAttribute('data-status', 'done');
        await expect(reply).toContainText('TeamDetail was drawn from');
        expect((await project.readView('TeamDetail')).tsx).toContain('members.map((member) =>');
        // Applied on approval.
        await window.getByRole('button', { name: 'Apply this plan' }).click();
        await expect(window.getByTestId('agent-reply').nth(1)).toHaveAttribute('data-status', 'done');
        await expect.poll(async () => (await project.readView('TeamDetail')).tsx, { timeout: 15_000 }).toContain('team.map((person) =>');
    }
    finally {
        await fs.rm(appDir, { recursive: true, force: true });
    }
});

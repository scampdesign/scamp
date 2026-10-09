import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
/**
 * The Scamp Agent panel, end to end, on the scripted provider: no network
 * and no real key. The script makes the agent call a real read tool, then
 * answer with what the tool returned — which proves the question went
 * from the panel to main, the tool ran against the live canvas, and the
 * answer came back.
 * see docs/plans/builtin-agent-plan.md
 */
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-script-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    { content: [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', name: 'scamp_get_element_tree', input: {} }] },
    { content: [{ type: 'echo_tool_result' }] },
]));
const openAgent = async (window) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-section="agent"]').click();
    await expect(window.getByTestId('agent-panel')).toBeVisible();
};
test.describe('signed out', () => {
    test('offers no agent at all', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(window.getByTestId('sidebar-rail')).toBeVisible();
        await expect(window.locator('[data-section="agent"]')).toHaveCount(0);
        // The shortcut does nothing either.
        await window.keyboard.press('ControlOrMeta+Shift+A');
        await expect(window.getByTestId('agent-panel')).toHaveCount(0);
    });
});
test.describe('signed in', () => {
    test.use({
        appEnv: {
            SCAMP_E2E_SIGNED_IN: '1',
            SCAMP_E2E_AGENT_VERIFY: 'accept',
            SCAMP_E2E_AGENT_SCRIPT: SCRIPT,
        },
    });
    test('asks for a key first, then answers from the live canvas', async ({ window }) => {
        await openAgent(window);
        // Not connected: the panel offers the same connect form as Settings.
        await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
        await window.getByRole('button', { name: 'Connect' }).click();
        // The fixture's home page is a view, and is named as one.
        await expect(window.getByTestId('agent-context')).toContainText('View: Home');
        await window.getByRole('button', { name: 'What’s on this page?' }).click();
        await expect(window.getByTestId('agent-user-message')).toHaveText('What’s on this page?');
        const reply = window.getByTestId('agent-reply');
        await expect(reply).toHaveAttribute('data-status', 'done');
        await expect(reply).toContainText('Let me look.');
        await expect(reply.getByTestId('agent-tool')).toHaveText('Read the layer tree');
        // The tool's real answer, from the renderer's live element tree.
        await expect(reply).toContainText('Tool said:');
        await expect(reply).toContainText('"root"');
        await expect(reply).toContainText(/\d+ tokens/);
    });
    test('starts a new conversation', async ({ window }) => {
        await openAgent(window);
        await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
        await window.getByRole('button', { name: 'Connect' }).click();
        await window.getByLabel('Message the agent').fill('Hello');
        await window.getByLabel('Message the agent').press('Enter');
        await expect(window.getByTestId('agent-reply')).toHaveAttribute('data-status', 'done');
        await window.getByRole('button', { name: 'New conversation' }).click();
        await expect(window.getByTestId('agent-reply')).toHaveCount(0);
        await expect(window.getByRole('button', { name: 'What’s on this page?' })).toBeVisible();
    });
    test('opens and closes with the keyboard', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await window.keyboard.press('ControlOrMeta+Shift+A');
        await expect(window.getByTestId('agent-panel')).toBeVisible();
        await window.keyboard.press('ControlOrMeta+Shift+A');
        await expect(window.getByTestId('agent-panel')).toHaveCount(0);
    });
});

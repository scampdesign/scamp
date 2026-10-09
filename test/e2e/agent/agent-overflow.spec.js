import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
/**
 * The agent's overflow check, end to end: the view is laid out in a real
 * browser window and what overflows comes back named by element.
 * see docs/notes/agent-overflow-check.md
 */
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-overflow-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    {
        content: [
            { type: 'tool_use', name: 'scamp_set_styles', input: { element: 'root', set: 'display: flex; flex-direction: column' } },
            { type: 'tool_use', name: 'scamp_add_element', input: { parent: 'root', name: 'wide', css: 'width: 2000px; height: 40px; flex-shrink: 0' } },
            { type: 'tool_use', name: 'scamp_add_element', input: { parent: 'root', name: 'fits', css: 'width: 200px; height: 40px' } },
            // Like a skip link moved above the page until it's focused: 80px down, pulled 200px up.
            {
                type: 'tool_use',
                name: 'scamp_add_element',
                input: { parent: 'root', name: 'skip', css: 'width: 120px; height: 30px; margin: -200px 0 0 0' },
            },
        ],
    },
    { content: [{ type: 'tool_use', name: 'scamp_find_overflow', input: {} }] },
    { content: [{ type: 'echo_tool_result' }] },
]));
test.use({
    projectOptions: { format: 'scamp' },
    appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
});
test('measures what overflows on a rendered view, and names it', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-section="agent"]').click();
    await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Message the agent').fill('What overflows?');
    await window.getByLabel('Message the agent').press('Enter');
    const reply = window.getByTestId('agent-reply');
    await expect(reply).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    // Laid out at the desktop width, with no scrollbar taking a slice of it.
    await expect(reply).toContainText('Rendered Home at 1440px wide');
    await expect(reply).toContainText(/wide_[0-9a-f]{4} \(id [0-9a-f]{4}\): 560px past the right of the page/);
    // The element that fits isn't a finding (it's named earlier, where it was added).
    const measured = (await reply.textContent())?.split('Tool said:')[1] ?? '';
    expect(measured).toContain('2 overflow findings');
    expect(measured).toMatch(/skip_[0-9a-f]{4} \(id [0-9a-f]{4}\): 120px past the top of the page/);
    expect(measured).not.toContain('fits_');
});

import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
/**
 * An agent reply's Markdown renders as structure, not as the characters
 * that wrote it — and never as HTML.
 */
const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-markdown-${process.pid}.json`);
writeFileSync(SCRIPT, JSON.stringify([
    {
        content: [
            {
                type: 'text',
                text: [
                    '# Convention review',
                    '',
                    'I checked **15 views**. The `theme.css` file declares only 10 tokens.',
                    '',
                    '## Suggested fix order',
                    '1. **Add the missing tokens.**',
                    '2. Remove the legacy pages.',
                    '',
                    '- <img src=x onerror="document.title=\'pwned\'">',
                ].join('\n'),
            },
        ],
    },
]));
test.use({
    appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
});
test('renders headings, lists, bold and code — and markup as text', async ({ window, app }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-section="agent"]').click();
    await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Message the agent').fill('Review the project');
    await window.getByLabel('Message the agent').press('Enter');
    const reply = window.getByTestId('agent-reply');
    await expect(reply).toHaveAttribute('data-status', 'done');
    await expect(reply.getByRole('heading', { name: 'Convention review' })).toBeVisible();
    await expect(reply.getByRole('heading', { name: 'Suggested fix order' })).toBeVisible();
    await expect(reply.locator('strong', { hasText: '15 views' })).toBeVisible();
    await expect(reply.locator('code', { hasText: 'theme.css' })).toBeVisible();
    await expect(reply.locator('ol > li')).toHaveCount(2);
    // No Markdown characters left over.
    await expect(reply).not.toContainText('**');
    await expect(reply).not.toContainText('# Convention');
    // Markup is shown as text, and never runs.
    await expect(reply.locator('img')).toHaveCount(0);
    await expect(reply).toContainText('<img src=x');
    expect(await window.title()).not.toBe('pwned');
    // Copy gives the Markdown the agent wrote, ready to paste elsewhere.
    await reply.getByTestId('agent-copy-reply').click();
    await expect(reply.getByRole('button', { name: 'Copy reply' })).toBeVisible();
    await expect
        .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toContain('# Convention review\n\nI checked **15 views**.');
});

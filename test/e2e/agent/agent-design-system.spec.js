import { existsSync, promises as fs, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../fixtures/app';
import { waitForSaved } from '../fixtures/assertions';
import { pageRoot } from '../fixtures/selectors';
/**
 * The Scamp Agent's design-system edits — a component and theme tokens —
 * each confirmed first, and each taken back by Undo AI changes, including
 * the files a plain restore would leave behind.
 * see docs/plans/builtin-agent-plan.md
 */
const script = (name, turns) => {
    const file = path.join(os.tmpdir(), `scamp-e2e-agent-${name}-${process.pid}.json`);
    writeFileSync(file, JSON.stringify(turns));
    return file;
};
const TSX = [
    "import styles from './home.module.css';",
    '',
    'export default function Home() {',
    '  return (',
    '    <div data-scamp-id="root" className={styles.root}>',
    '      <div data-scamp-id="a1b2" className={styles.card_a1b2}></div>',
    '    </div>',
    '  );',
    '}',
    '',
].join('\n');
const CSS = '.root {\n  width: 100%;\n  min-height: 100vh;\n}\n\n.card_a1b2 {\n  width: 200px;\n  height: 100px;\n  background: #3366ff;\n}\n';
const PROJECT = { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } };
// Components need a Next.js or Scamp project; legacy projects have none.
const NEXTJS_PROJECT = {
    format: 'nextjs',
    pageContent: { home: { tsx: TSX.replace("'./home.module.css'", "'./page.module.css'"), css: CSS } },
};
const SIGNED_IN = { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept' };
const askAndApprove = async (window, message) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-section="agent"]').click();
    await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Message the agent').fill(message);
    await window.getByLabel('Message the agent').press('Enter');
    await expect(window.getByTestId('agent-confirm')).toHaveAttribute('data-state', 'pending');
    await window.getByRole('button', { name: 'Apply changes' }).click();
    await expect(window.getByTestId('agent-reply')).toHaveAttribute('data-status', 'done');
};
const undoSession = async (window) => {
    await window.getByRole('button', { name: 'Undo AI changes' }).click();
    await window.getByRole('button', { name: 'Undo changes' }).click();
    await expect(window.getByTestId('agent-note')).toBeVisible();
};
test.describe('a component', () => {
    test.use({
        projectOptions: NEXTJS_PROJECT,
        appEnv: {
            ...SIGNED_IN,
            SCAMP_E2E_AGENT_SCRIPT: script('component', [
                { content: [{ type: 'tool_use', name: 'scamp_extract_component', input: { element: 'card_a1b2', name: 'Card' } }] },
                { content: [{ type: 'text', text: 'Card is a component now.' }] },
            ]),
        },
    });
    test('is created, used in place, and removed again by Undo AI changes', async ({ window, project }) => {
        await askAndApprove(window, 'Make the card a component');
        await expect(window.getByTestId('agent-tool')).toHaveText('Made card_a1b2 into the component Card');
        const componentDir = path.join(project.dir, 'components', 'Card');
        await expect.poll(() => existsSync(path.join(componentDir, 'Card.tsx'))).toBe(true);
        await waitForSaved(window);
        await undoSession(window);
        // A plain restore copies files back but never removes new ones; the
        // session removes the component it created.
        await expect.poll(() => existsSync(componentDir)).toBe(false);
    });
});
test.describe('theme tokens', () => {
    test.use({
        projectOptions: PROJECT,
        appEnv: {
            ...SIGNED_IN,
            SCAMP_E2E_AGENT_SCRIPT: script('tokens', [
                { content: [{ type: 'tool_use', name: 'scamp_set_theme_tokens', input: { tokens: { '--color-accent': '#ff6600' } } }] },
                { content: [{ type: 'text', text: 'Added an accent token.' }] },
            ]),
        },
    });
    test('are written to theme.css, and put back by Undo AI changes', async ({ window, project }) => {
        const themePath = path.join(project.dir, 'theme.css');
        const before = await fs.readFile(themePath, 'utf-8');
        await askAndApprove(window, 'Add an accent colour token');
        await expect(window.getByTestId('agent-tool')).toHaveText('Theme tokens — added --color-accent');
        await expect.poll(async () => fs.readFile(themePath, 'utf-8')).toContain('--color-accent: #ff6600');
        await undoSession(window);
        await expect.poll(async () => fs.readFile(themePath, 'utf-8')).toBe(before);
    });
});

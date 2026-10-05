import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { test, expect } from '../fixtures/app';
import { canvasElement, pageRoot } from '../fixtures/selectors';
import type { Page } from '@playwright/test';

/**
 * The Scamp Agent asks before a delete, and only the user's answer
 * decides it. Scripted provider; no network.
 * see docs/plans/builtin-agent-plan.md
 */

const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-confirm-${process.pid}.json`);
writeFileSync(
  SCRIPT,
  JSON.stringify([
    { content: [{ type: 'tool_use', name: 'scamp_delete_element', input: { element: 'card_a1b2' } }] },
    { content: [{ type: 'text', text: 'All set.' }] },
  ])
);

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

test.use({
  projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } },
  appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
});

const askToDelete = async (window: Page): Promise<void> => {
  await expect(pageRoot(window)).toBeVisible();
  await window.locator('[data-section="agent"]').click();
  await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
  await window.getByRole('button', { name: 'Connect' }).click();
  await window.getByLabel('Message the agent').fill('Delete the card');
  await window.getByLabel('Message the agent').press('Enter');
  const card = window.getByTestId('agent-confirm');
  await expect(card).toHaveAttribute('data-state', 'pending');
  await expect(card).toContainText('Delete card_a1b2 and everything inside it');
  await expect(window.getByTestId('agent-reply')).toContainText('Waiting for your answer.');
  // Nothing happens while it waits.
  await expect(canvasElement(window, 'card_a1b2')).toBeVisible();
};

test('Cancel keeps the element', async ({ window }) => {
  await askToDelete(window);
  await window.getByRole('button', { name: 'Cancel' }).click();
  await expect(window.getByTestId('agent-confirm')).toHaveAttribute('data-state', 'declined');
  await expect(window.getByTestId('agent-reply')).toHaveAttribute('data-status', 'done');
  await expect(canvasElement(window, 'card_a1b2')).toBeVisible();
});

test('Apply changes deletes it', async ({ window }) => {
  await askToDelete(window);
  await window.getByRole('button', { name: 'Apply changes' }).click();
  await expect(window.getByTestId('agent-confirm')).toHaveAttribute('data-state', 'approved');
  await expect(window.getByTestId('agent-reply')).toHaveAttribute('data-status', 'done');
  await expect(canvasElement(window, 'card_a1b2')).toHaveCount(0);
  await expect(window.getByTestId('agent-tool')).toHaveText('Deleted card_a1b2');
});

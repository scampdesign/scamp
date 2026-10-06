import { promises as fs, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { _electron as electron, type Page } from '@playwright/test';

import { dismissSentryPrompt, test, expect } from '../fixtures/app';
import { openPagesSection } from '../fixtures/components';
import { OZONE_ARGS } from '../fixtures/launchArgs';
import { pageRoot, pageSidebarItem } from '../fixtures/selectors';

/**
 * Each page has its own agent conversation, kept in
 * `.scamp/agent-history/` — so it is there when the user comes back to
 * the page, and when they open the project again.
 * see docs/plans/builtin-agent-plan.md
 */

const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-history-${process.pid}.json`);
writeFileSync(
  SCRIPT,
  JSON.stringify([
    { content: [{ type: 'text', text: 'The page has a header.' }] },
    { content: [{ type: 'echo_system' }] },
  ])
);

const ENV = {
  SCAMP_E2E_SIGNED_IN: '1',
  SCAMP_E2E_AGENT_VERIFY: 'accept',
  SCAMP_E2E_AGENT_SCRIPT: SCRIPT,
};

test.use({ appEnv: ENV, projectOptions: { extraPages: ['about'] } });

const connect = async (window: Page): Promise<void> => {
  await expect(pageRoot(window)).toBeVisible();
  await window.locator('[data-section="agent"]').click();
  await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
  await window.getByRole('button', { name: 'Connect' }).click();
  await expect(window.getByLabel('Message the agent')).toBeVisible();
};

const goTo = async (window: Page, slug: string): Promise<void> => {
  await openPagesSection(window);
  await pageSidebarItem(window, slug).click();
  await expect(pageRoot(window)).toBeVisible();
  await window.locator('[data-section="agent"]').click();
};

test('keeps a conversation per page, on disk, across a restart', async ({ window, app, project }) => {
  // The project opens on its first view, About.
  await connect(window);
  await expect(window.getByTestId('agent-context')).toContainText('View: About');
  await window.getByLabel('Message the agent').fill('What is on this page?');
  await window.getByLabel('Message the agent').press('Enter');
  await expect(window.getByTestId('agent-reply')).toHaveAttribute('data-status', 'done');
  await expect(window.getByTestId('agent-reply')).toContainText('The page has a header.');

  // Another page has a conversation of its own, empty to start.
  await goTo(window, 'home');
  await expect(window.getByTestId('agent-context')).toContainText('View: Home');
  await expect(window.getByTestId('agent-reply')).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'What’s on this page?' })).toBeVisible();

  // Back on About, its conversation is still there.
  await goTo(window, 'about');
  await expect(window.getByTestId('agent-user-message')).toHaveText('What is on this page?');
  await expect(window.getByTestId('agent-reply')).toContainText('The page has a header.');

  const file = path.join(project.dir, '.scamp', 'agent-history', 'view-About.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf-8')) as {
    version: number;
    model: Array<{ role: string }>;
    transcript: Array<{ role: string }>;
  };
  expect(saved.version).toBe(1);
  expect(saved.model.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(saved.transcript.map((t) => t.role)).toEqual(['user', 'assistant']);

  // Open the project again, in a fresh app.
  await app.close();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-userdata-'));
  const again = await electron.launch({
    args: [path.resolve(__dirname, '../../../out/main/index.js'), `--user-data-dir=${userDataDir}`, ...OZONE_ARGS],
    env: { ...process.env, SCAMP_E2E: '1', SCAMP_E2E_OPEN_PROJECT: project.dir, NODE_ENV: 'test', ...ENV },
  });
  try {
    const window2 = await again.firstWindow();
    await window2.waitForLoadState('domcontentloaded');
    await dismissSentryPrompt(window2);
    await connect(window2);
    await expect(window2.getByTestId('agent-user-message')).toHaveText('What is on this page?');
    await expect(window2.getByTestId('agent-reply')).toContainText('The page has a header.');

    // And the model gets the earlier exchange too: the next reply follows on.
    await window2.getByLabel('Message the agent').fill('And now?');
    await window2.getByLabel('Message the agent').press('Enter');
    await expect(window2.getByTestId('agent-reply')).toHaveCount(2);
    await expect(window2.getByTestId('agent-reply').nth(1)).toHaveAttribute('data-status', 'done');
    const resaved = JSON.parse(await fs.readFile(file, 'utf-8')) as { model: Array<{ role: string }> };
    expect(resaved.model.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

    // New conversation deletes it.
    await window2.getByRole('button', { name: 'New conversation' }).click();
    await expect(window2.getByTestId('agent-reply')).toHaveCount(0);
    await expect.poll(async () => fs.access(file).then(() => true, () => false)).toBe(false);
  } finally {
    await again.close().catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('lets the user widen what the agent considers', async ({ window }) => {
  await connect(window);
  const focus = window.getByLabel('What the agent considers');
  await focus.selectOption('project');
  await expect(window.getByTestId('agent-context')).toHaveText('Whole project · Open: View: About');
  await expect(window.getByRole('button', { name: 'Which pages don’t follow the project’s conventions?' })).toBeVisible();
  await focus.selectOption('page');
  await expect(window.getByTestId('agent-context')).toHaveText('View: About · Whole page');
});

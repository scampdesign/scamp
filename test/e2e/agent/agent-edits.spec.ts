import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { pageRoot } from '../fixtures/selectors';

/**
 * The Scamp Agent editing the canvas, end to end on the scripted
 * provider: the edits reach the canvas and the files, one Cmd+Z undoes
 * the whole turn, and a restore point was taken first.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-edits-${process.pid}.json`);
writeFileSync(
  SCRIPT,
  JSON.stringify([
    {
      content: [
        { type: 'tool_use', name: 'scamp_set_styles', input: { element: 'root', set: 'display: flex; flex-direction: column' } },
        {
          type: 'tool_use',
          name: 'scamp_add_element',
          input: { parent: 'root', name: 'note', text: 'Hello from the agent', css: 'color: #ff0000' },
        },
      ],
    },
    { content: [{ type: 'text', text: 'Added a note.' }] },
  ])
);

test.use({
  appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
});

test('edits reach the canvas and the files, and undo as one step', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await window.locator('[data-section="agent"]').click();
  await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
  await window.getByRole('button', { name: 'Connect' }).click();

  await window.getByLabel('Message the agent').fill('Add a red note');
  await window.getByLabel('Message the agent').press('Enter');

  const reply = window.getByTestId('agent-reply');
  await expect(reply).toHaveAttribute('data-status', 'done');
  // Each edit says what it changed.
  await expect(reply.getByTestId('agent-tool').nth(0)).toHaveText(
    'Updated root — display: flex; flex-direction: column;'
  );
  await expect(reply.getByTestId('agent-tool').nth(1)).toHaveText(/^Added <p> note_[0-9a-f]{4} to root$/);

  // On the canvas…
  const note = pageRoot(window).getByText('Hello from the agent');
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS('color', 'rgb(255, 0, 0)');

  // …and in the files, through the normal save path.
  await waitForSaved(window);
  const saved = await readPageFiles(project.dir, project.pageName);
  expect(saved.tsx).toContain('Hello from the agent');
  expect(saved.css).toMatch(/\.note_[0-9a-f]{4} \{[^}]*color: #ff0000/);
  expect(saved.css).toMatch(/\.root \{[^}]*display: flex/);

  // One Cmd+Z undoes the whole turn — both edits.
  // Out of the message box first: undo in a text field is the field's own.
  await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await window.keyboard.press('ControlOrMeta+z');
  await expect(note).toHaveCount(0);
  await waitForSaved(window);
  const undone = await readPageFiles(project.dir, project.pageName);
  expect(undone.tsx).not.toContain('Hello from the agent');
  expect(undone.css).not.toMatch(/\.root \{[^}]*display: flex/);

  // A restore point was taken before the first edit.
  await window.locator('[data-section="history"]').click();
  await expect(window.getByText('Before Scamp Agent')).toBeVisible();
});

test('Undo AI changes puts the canvas and files back in one click', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await waitForSaved(window);
  const before = await readPageFiles(project.dir, project.pageName);

  await window.locator('[data-section="agent"]').click();
  await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
  await window.getByRole('button', { name: 'Connect' }).click();
  await window.getByLabel('Message the agent').fill('Add a red note');
  await window.getByLabel('Message the agent').press('Enter');
  await expect(window.getByTestId('agent-reply')).toHaveAttribute('data-status', 'done');
  await expect(pageRoot(window).getByText('Hello from the agent')).toBeVisible();
  await waitForSaved(window);

  // Asks first, and says what it will put back.
  await window.getByRole('button', { name: 'Undo AI changes' }).click();
  await expect(window.getByTestId('agent-undo-confirm')).toContainText('before its first edit');
  await window.getByRole('button', { name: 'Undo changes' }).click();

  await expect(window.getByTestId('agent-note')).toHaveText('Undid every change the agent made in this conversation.');
  await expect(pageRoot(window).getByText('Hello from the agent')).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Undo AI changes' })).toHaveCount(0);
  const after = await readPageFiles(project.dir, project.pageName);
  expect(after.tsx).toBe(before.tsx);
  expect(after.css).toBe(before.css);
});

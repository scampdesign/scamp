import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { test, expect } from '../fixtures/app';
import { readPageFiles } from '../fixtures/assertions';
import { createPageFromSidebar, openPagesSection } from '../fixtures/components';
import { pageRoot, pageSidebarItem } from '../fixtures/selectors';

/**
 * The Scamp Agent editing a view that isn't open: the edit reaches that
 * view's files, the open page is left alone, and opening the view shows it.
 * see docs/notes/agent-whole-project.md
 */

const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-agent-other-view-${process.pid}.json`);
writeFileSync(
  SCRIPT,
  JSON.stringify([
    {
      content: [
        { type: 'tool_use', name: 'scamp_set_styles', input: { view: 'About', element: 'root', set: 'display: flex; flex-direction: column' } },
        {
          type: 'tool_use',
          name: 'scamp_add_element',
          input: { view: 'About', parent: 'root', name: 'note', text: 'Written from Home', css: 'color: #ff0000' },
        },
      ],
    },
    { content: [{ type: 'text', text: 'Added a note to About.' }] },
  ])
);

test.use({
  projectOptions: { format: 'scamp' },
  appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept', SCAMP_E2E_AGENT_SCRIPT: SCRIPT },
});

test('edits a view that isn’t open, and the view shows it when opened', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await createPageFromSidebar(window, 'about');
  await expect(pageSidebarItem(window, 'about')).toBeVisible();
  await pageSidebarItem(window, 'home').click();

  await window.locator('[data-section="agent"]').click();
  await window.getByTestId('agent-connect').getByLabel('Claude API key').fill('sk-ant-e2e');
  await window.getByRole('button', { name: 'Connect' }).click();
  await window.getByLabel('Message the agent').fill('Add a red note to the About page');
  await window.getByLabel('Message the agent').press('Enter');

  const reply = window.getByTestId('agent-reply');
  await expect(reply).toHaveAttribute('data-status', 'done');
  await expect(reply.getByTestId('agent-tool').nth(1)).toHaveText(/^About: Added <p> note_[0-9a-f]{4} to root$/);

  // Home, which is open, is untouched…
  await expect(pageRoot(window).getByText('Written from Home')).toHaveCount(0);
  const home = await readPageFiles(project.dir, 'home');
  expect(home.tsx).not.toContain('Written from Home');

  // …and About's files hold the edit.
  const about = await readPageFiles(project.dir, 'about');
  expect(about.tsx).toContain('Written from Home');
  expect(about.css).toMatch(/\.note_[0-9a-f]{4} \{[^}]*color: #ff0000/);

  // Opening About loads the edited files, not the version from before.
  await openPagesSection(window);
  await pageSidebarItem(window, 'about').click();
  const note = pageRoot(window).getByText('Written from Home');
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS('color', 'rgb(255, 0, 0)');
});

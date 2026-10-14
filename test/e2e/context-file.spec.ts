import { promises as fs } from 'fs';
import { join } from 'path';

import { test, expect } from './fixtures/app';
import {
  clickInFrame,
  dragInFrame,
  selectTool,
} from './fixtures/canvas';
import { pageRoot } from './fixtures/selectors';

/**
 * The live agent-context file, end to end. The unit tests cover what the
 * markdown says; this is the only level that proves the store subscription
 * is actually wired and the file lands on disk.
 * see docs/archive/2026-08-05-live-context-file-plan.md
 */

test.use({ projectOptions: { format: 'nextjs' } });

const contextPath = (dir: string): string => join(dir, '.scamp', 'context.md');

const readContext = async (dir: string): Promise<string> => {
  try {
    return await fs.readFile(contextPath(dir), 'utf-8');
  } catch {
    return '';
  }
};

test.describe('live context file', () => {
  test('exists for the open page before anything is selected', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await expect
      .poll(async () => readContext(project.dir), { timeout: 5000 })
      .toContain('# Scamp Active Context');
    const content = await readContext(project.dir);
    expect(content).toContain('## Active page');
    expect(content).toContain('Page: home');
    expect(content).toContain('None selected.');
  });

  test('records project-relative paths, not absolute ones', async ({
    window,
    project,
  }) => {
    // The file gets quoted back by agents; an absolute path would leak the
    // user's home directory.
    await expect(pageRoot(window)).toBeVisible();
    await expect
      .poll(async () => readContext(project.dir), { timeout: 5000 })
      .toContain('File: app/page.tsx');
    expect(await readContext(project.dir)).not.toContain(project.dir);
  });

  test('names the selected element after it is drawn and selected', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 260, y: 200 });

    // Drawing selects the new rect, so the file should name its class.
    await expect
      .poll(async () => readContext(project.dir), { timeout: 5000 })
      .toMatch(/Class:\s+\.rect_[0-9a-f]{4}/);

    const content = await readContext(project.dir);
    expect(content).toContain('## Current styles');
    expect(content).toContain('Tag:     div');
    expect(content).not.toContain('None selected.');
  });

  test('follows the selection when it moves to another element', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 200, y: 160 });
    await expect
      .poll(async () => readContext(project.dir), { timeout: 5000 })
      .toMatch(/Class:\s+\.rect_[0-9a-f]{4}/);

    // Clicking bare canvas selects the page ROOT — it carries a
    // `data-element-id`, so the hit-test finds it rather than falling
    // through to "nothing". Selection only empties on load.
    await selectTool(window, 'v');
    await clickInFrame(window, { x: 420, y: 320 });

    await expect
      .poll(async () => readContext(project.dir), { timeout: 5000 })
      .toContain('Class:   .root');
  });
});

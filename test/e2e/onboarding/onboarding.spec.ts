import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect, stubOpenDialog } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
import { dragInFrame, selectTool } from '../fixtures/canvas';

/**
 * The tutorial: offered once, on the first-run screen, right after the
 * projects folder is picked; skippable; restartable from Settings.
 * see docs/plans/onboarding-plan.md
 */

type Onboarding = { offered: boolean; hidden: boolean; completed: string[] };

const onboardingSettings = (window: Page): Promise<Onboarding> =>
  window.evaluate(async () => {
    const scamp = (globalThis as unknown as { scamp: { getSettings: () => Promise<{ onboarding: Onboarding }> } }).scamp;
    return (await scamp.getSettings()).onboarding;
  });

/** Leave the fixture's project for the first-run screen, and pick `folder` there. */
const pickFirstFolder = async (app: ElectronApplication, window: Page, folder: string): Promise<void> => {
  await expect(pageRoot(window)).toBeVisible();
  await window.getByRole('button', { name: '← Projects' }).click();
  await stubOpenDialog(app, folder);
  await window.getByRole('button', { name: 'Choose Folder' }).click();
};

const learnRailButton = (window: Page) => window.getByTestId('sidebar-rail').locator('[data-section="learn"]');

test.describe('onboarding', () => {
  let parent: string;

  test.beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-tutorial-'));
  });

  test.afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  test('a project opened before the tutorial was ever offered shows no Learn section', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await expect(learnRailButton(window)).toHaveCount(0);
  });

  test('taking the tutorial opens its project on the checklist, and drawing completes the first lesson', async ({
    app,
    window,
  }) => {
    await pickFirstFolder(app, window, parent);
    await window.getByTestId('tutorial-offer').getByRole('button', { name: 'Take the tutorial' }).click();

    const panel = window.getByTestId('learn-panel');
    await expect(panel).toBeVisible();
    await expect(window.getByTestId('learn-progress')).toHaveText('0 of 5');
    const home = await fs.readFile(path.join(parent, 'scamp-tutorial', 'views', 'Home', 'Home.tsx'), 'utf-8');
    expect(home).toContain('Welcome to your tutorial');

    // The lesson points at the tool it asks for, until it's picked.
    await expect(window.getByTestId('tutorial-spotlight')).toBeVisible();
    await selectTool(window, 'r');
    await expect(window.getByTestId('tutorial-spotlight')).toHaveCount(0);
    await dragInFrame(window, { x: 200, y: 600 }, { x: 260, y: 660 });

    const draw = panel.locator('[data-lesson="draw"]');
    await expect(draw).toHaveAttribute('data-done', 'true');
    await expect(window.getByTestId('learn-progress')).toHaveText('1 of 5');
    await expect.poll(async () => (await onboardingSettings(window)).completed).toEqual(['draw']);

    // A done lesson collapses, and opens again to be reread.
    await expect(draw.getByText('to draw a rectangle')).toHaveCount(0);
    await draw.getByRole('button', { name: /Draw, and it’s code/ }).click();
    await expect(draw.getByText('to draw a rectangle')).toBeVisible();

    // Leaving Learn offers the way back.
    await window.getByTestId('sidebar-rail').locator('[data-section="pages"]').click();
    await expect(panel).toHaveCount(0);
    await window.getByTestId('tutorial-return').click();
    await expect(window.getByTestId('learn-panel')).toBeVisible();
  });

  test('skipping hides the tutorial, and Settings starts it again in a fresh project', async ({ app, window }) => {
    await pickFirstFolder(app, window, parent);
    await window.getByTestId('tutorial-offer').getByRole('button', { name: 'Skip' }).click();
    await expect(window.getByTestId('tutorial-offer')).toHaveCount(0);
    expect(await onboardingSettings(window)).toEqual({ offered: true, hidden: true, completed: [] });

    // A taken name gets the next free one rather than an error.
    await fs.mkdir(path.join(parent, 'scamp-tutorial'));
    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByTestId('settings-tutorial').getByRole('button', { name: 'Start the tutorial' }).click();

    await expect(window.getByTestId('learn-panel')).toBeVisible();
    await expect(learnRailButton(window)).toHaveCount(1);
    expect(
      await fs.readFile(path.join(parent, 'scamp-tutorial-2', 'views', 'Home', 'Home.tsx'), 'utf-8')
    ).toContain('Welcome to your tutorial');
    expect(await onboardingSettings(window)).toEqual({ offered: true, hidden: false, completed: [] });
  });

  test('Hide Learn removes the section, and the Settings switch brings it back', async ({ app, window }) => {
    await pickFirstFolder(app, window, parent);
    await window.getByTestId('tutorial-offer').getByRole('button', { name: 'Take the tutorial' }).click();
    await expect(window.getByTestId('learn-panel')).toBeVisible();

    await window.getByRole('button', { name: 'Hide Learn' }).click();
    await expect(learnRailButton(window)).toHaveCount(0);
    await expect(window.getByTestId('learn-panel')).toHaveCount(0);

    await window.getByRole('button', { name: '← Projects' }).click();
    await window.getByRole('button', { name: 'Settings' }).click();
    const tutorial = window.getByTestId('settings-tutorial');
    await expect(tutorial.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
    await tutorial.getByRole('button', { name: 'Show' }).click();
    await expect.poll(async () => (await onboardingSettings(window)).hidden).toBe(false);
  });
});

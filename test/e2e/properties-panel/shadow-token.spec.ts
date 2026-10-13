import { promises as fs } from 'fs';
import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';

/**
 * `box-shadow: var(--shadow-card)` shows in the Shadow section as the
 * token, and can be detached into layers or removed.
 * Item 5 of docs/plans/checks-cleanup-plan.md
 */

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

const CSS = [
  '.root {',
  '  width: 100%;',
  '  min-height: 100vh;',
  '}',
  '',
  '.card_a1b2 {',
  '  width: 200px;',
  '  height: 100px;',
  '  position: relative;',
  '  box-shadow: var(--shadow-card);',
  '}',
  '',
].join('\n');

test.use({ projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } } });

/** Declare the token, and reopen so the theme is read with it. */
const withShadowToken = async (window: Page, themePath: string): Promise<void> => {
  const theme = await fs.readFile(themePath, 'utf-8');
  await fs.writeFile(themePath, theme.replace(':root {', ':root {\n  --shadow-card: 0 4px 8px rgba(0, 0, 0, 0.2);'));
  await window.reload();
  await expect(pageRoot(window)).toBeVisible();
};

const selectCard = async (window: Page): Promise<void> => {
  const box = await window.locator('[data-scamp-id="card_a1b2"]').boundingBox();
  if (box === null) throw new Error('card not on screen');
  await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panelSection(window, 'Shadow')).toBeVisible();
};

test('a token shadow shows as the token, and Detach turns it into editable layers', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await withShadowToken(window, project.themeCssPath);
  await selectCard(window);

  const row = window.getByTestId('shadow-token');
  await expect(row).toContainText('--shadow-card');
  await row.getByRole('button', { name: 'Detach' }).click();
  await expect(row).toHaveCount(0);

  await waitForSaved(window);
  const css = (await readPageFiles(project.dir, 'home')).css;
  expect(css).not.toContain('var(--shadow-card)');
  expect(css).toMatch(/\.card_a1b2 \{[^}]*box-shadow: 0px 4px 8px rgba\(0, 0, 0, 0\.2\);/);
});

test('Remove clears a token shadow', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await selectCard(window);
  await window.getByTestId('shadow-token').getByRole('button', { name: 'Remove' }).click();
  await waitForSaved(window);
  expect((await readPageFiles(project.dir, 'home')).css).not.toContain('box-shadow');
});

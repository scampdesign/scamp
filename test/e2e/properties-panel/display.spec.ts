import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { panelInputByPrefix, panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';

/**
 * Inline, inline-block, contents, list-item, inline-flex and inline-grid
 * are panel values now, not raw CSS the panel couldn't show (item 3 of
 * docs/archive/2026-10-13-checks-cleanup-plan.md); so is an `auto` margin (item 4).
 */

const TSX = [
  "import styles from './home.module.css';",
  '',
  'export default function Home() {',
  '  return (',
  '    <div data-scamp-id="root" className={styles.root}>',
  '      <p data-scamp-id="a1b2" className={styles.text_a1b2}>Label</p>',
  '      <div data-scamp-id="c3d4" className={styles.chip_c3d4}></div>',
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
  '.text_a1b2 {',
  '  position: relative;',
  '}',
  '',
  '.chip_c3d4 {',
  '  width: 120px;',
  '  height: 40px;',
  '  align-items: center;',
  '  position: relative;',
  '  display: inline-flex;',
  '}',
  '',
].join('\n');

test.use({ projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } } });

const select = async (window: Page, id: string): Promise<void> => {
  const box = await window.locator(`[data-scamp-id="${id}"]`).boundingBox();
  if (box === null) throw new Error(`${id} not on screen`);
  await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

/** The Display select in a section: the one offering `inline`. */
const displaySelect = (window: Page, section: string) =>
  panelSection(window, section).locator('select').filter({ has: window.locator('option[value="inline"]') });

test('a text element can be made inline from the panel', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await select(window, 'text_a1b2');
  await expect(displaySelect(window, 'Display')).toHaveValue('block');

  await displaySelect(window, 'Display').selectOption('inline');
  await waitForSaved(window);
  expect((await readPageFiles(project.dir, 'home')).css).toMatch(/\.text_a1b2 \{[^}]*display: inline;/);
});

test('an inline-flex box reads as Flex + Inline, and can be made block', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await select(window, 'chip_c3d4');
  await expect(displaySelect(window, 'Layout')).toHaveValue('inline');
  // It's a flex container, so the flex controls are there.
  await expect(
    panelSection(window, 'Layout').locator('select').filter({ has: window.locator('option[value="space-between"]') })
  ).toHaveCount(1);

  await displaySelect(window, 'Layout').selectOption('block');
  await waitForSaved(window);
  const css = (await readPageFiles(project.dir, 'home')).css;
  expect(css).toMatch(/\.chip_c3d4 \{[^}]*display: flex;/);
  expect(css).not.toContain('inline-flex');
});

test('a margin side can be auto, typed into the margin field', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await select(window, 'chip_c3d4');
  const margin = panelInputByPrefix(window, 'Spacing', 'Margin');
  await margin.fill('0 auto');
  await margin.press('Enter');
  await waitForSaved(window);
  expect((await readPageFiles(project.dir, 'home')).css).toMatch(/\.chip_c3d4 \{[^}]*margin: 0px auto;/);
  await expect(margin).toHaveValue('0px auto');

  // Padding stays numeric: `auto` isn't a padding value.
  const padding = panelInputByPrefix(window, 'Spacing', 'Padding');
  await padding.fill('auto');
  await padding.press('Enter');
  await expect(padding).toHaveValue('0px');
});

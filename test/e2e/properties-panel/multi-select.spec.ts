import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { switchBreakpoint } from '../fixtures/breakpoints';
import { commitInput, panelInputByPrefix, panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';

/**
 * With several elements selected, a panel change reaches each one it
 * fits, as one undo step. see docs/plans/multi-select-edit-plan.md
 */

const TSX = [
  "import styles from './home.module.css';",
  '',
  'export default function Home() {',
  '  return (',
  '    <div data-scamp-id="root" className={styles.root}>',
  '      <div data-scamp-id="a1b2" className={styles.card_a1b2}></div>',
  '      <div data-scamp-id="c3d4" className={styles.tile_c3d4}></div>',
  '      <p data-scamp-id="e5f6" className={styles.label_e5f6}>Label</p>',
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
  '  position: absolute;',
  '  left: 40px;',
  '  top: 40px;',
  '  width: 120px;',
  '  height: 80px;',
  '}',
  '',
  '.tile_c3d4 {',
  '  position: absolute;',
  '  left: 200px;',
  '  top: 40px;',
  '  width: 120px;',
  '  height: 80px;',
  '}',
  '',
  '.label_e5f6 {',
  '  position: absolute;',
  '  left: 40px;',
  '  top: 200px;',
  '}',
  '',
].join('\n');

test.use({ projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } } });

const click = async (window: Page, id: string, shift = false): Promise<void> => {
  const box = await window.locator(`[data-scamp-id="${id}"]`).boundingBox();
  if (box === null) throw new Error(`${id} not on screen`);
  if (shift) await window.keyboard.down('Shift');
  await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  if (shift) await window.keyboard.up('Shift');
};

const block = (css: string, className: string): string => css.match(new RegExp(`\\.${className} \\{[^}]*\\}`))?.[0] ?? '';

const setBackground = async (window: Page, value: string): Promise<void> => {
  const colorText = panelSection(window, 'Background').locator('input[type="text"]').first();
  await colorText.click();
  await colorText.fill(value);
  await colorText.press('Enter');
};

test('a background change reaches both rectangles, and one undo takes it back', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await click(window, 'card_a1b2');
  await click(window, 'tile_c3d4', true);
  await expect(window.getByTestId('multi-select-note')).toContainText('2 elements selected');

  await setBackground(window, '#ff6600');
  await waitForSaved(window);
  let { css } = await readPageFiles(project.dir, 'home');
  expect(block(css, 'card_a1b2')).toMatch(/background: #ff6600/);
  expect(block(css, 'tile_c3d4')).toMatch(/background: #ff6600/);

  await window.keyboard.press('ControlOrMeta+z');
  await waitForSaved(window);
  ({ css } = await readPageFiles(project.dir, 'home'));
  expect(css).not.toContain('#ff6600');
});

test('a font size reaches the text element and not the rectangle beside it', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await click(window, 'card_a1b2');
  await click(window, 'label_e5f6', true);

  await commitInput(panelInputByPrefix(window, 'Typography', 'Sz'), '24');
  await waitForSaved(window);
  const { css } = await readPageFiles(project.dir, 'home');
  expect(block(css, 'label_e5f6')).toMatch(/font-size: 24px/);
  expect(block(css, 'card_a1b2')).not.toMatch(/font-size/);
});

test('at a breakpoint, each selected element gets its own override', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await click(window, 'card_a1b2');
  await click(window, 'tile_c3d4', true);
  await switchBreakpoint(window, 'tablet', 'Tablet');

  await commitInput(panelInputByPrefix(window, 'Spacing', 'Padding'), '12');
  await waitForSaved(window);
  const { css } = await readPageFiles(project.dir, 'home');
  const tablet = css.slice(css.indexOf('@media (max-width: 768px)'));
  expect(tablet).toMatch(/\.card_a1b2 \{[^}]*padding: 12px/);
  expect(tablet).toMatch(/\.tile_c3d4 \{[^}]*padding: 12px/);
  expect(block(css, 'card_a1b2')).not.toMatch(/padding/);
});

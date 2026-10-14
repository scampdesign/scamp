import { test, expect } from '../fixtures/app';
import { layersRowByClass } from '../fixtures/layers';
import { panelSection } from '../fixtures/panel';
import { canvasElement, pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

/**
 * Row and cell styling is set once on the table and written as one
 * derived rule per setting, not onto every row or cell.
 * see docs/archive/2026-10-05-tables-plan.md
 */

const TSX = [
  "import styles from './home.module.css';",
  '',
  'export default function Home() {',
  '  return (',
  '    <div data-scamp-id="root" className={styles.root}>',
  '      <table data-scamp-id="t1a1" className={styles.rect_t1a1}>',
  '        <tbody data-scamp-id="t2a2" className={styles.rect_t2a2}>',
  '          <tr data-scamp-id="t3a3" className={styles.rect_t3a3}>',
  '            <td data-scamp-id="t4a4" className={styles.text_t4a4}>Smith</td>',
  '            <td data-scamp-id="t5a5" className={styles.text_t5a5}>Active</td>',
  '          </tr>',
  '          <tr data-scamp-id="t6a6" className={styles.rect_t6a6}>',
  '            <td data-scamp-id="t7a7" className={styles.text_t7a7}>Jones</td>',
  '            <td data-scamp-id="t8a8" className={styles.text_t8a8}>Away</td>',
  '          </tr>',
  '        </tbody>',
  '      </table>',
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
  '.rect_t1a1 {',
  '  width: 400px;',
  '  display: grid;',
  '  grid-template-columns: 1fr 1fr;',
  '}',
  '',
].join('\n');

test.describe('properties panel: table rows and cells', () => {
  test.use({
    projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } },
  });

  test('stripes and dividers are written once, on the table', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await layersRowByClass(window, 'rect_t1a1').click();

    const section = panelSection(window, 'Rows and cells');
    await expect(section).toBeVisible();
    await section.locator('select').first().selectOption('solid');
    await section.getByRole('radio', { name: 'On' }).first().click();
    await waitForSaved(window);

    const { css } = await readPageFiles(project.dir, project.pageName);
    expect(css).toContain(':where(.rect_t1a1) :where(tr) {\n  border-bottom: 1px solid #e0e0e0;');
    expect(css).toContain('> :where(tr:nth-child(even)),');
    expect(css).toContain('background-color: #f5f5f5;');
    // Nothing landed on a row.
    expect(css).not.toMatch(/\.rect_t3a3 \{[^}]*border/);
    expect(css).not.toMatch(/\.rect_t6a6 \{[^}]*background/);

    // And the canvas shows it: the second row is striped, the first not.
    const second = canvasElement(window, 'rect_t6a6');
    await expect(second).toHaveCSS('background-color', 'rgb(245, 245, 245)');
    await expect(canvasElement(window, 'rect_t3a3')).toHaveCSS(
      'border-bottom-width',
      '1px'
    );

    // Switching stripes off takes the rule off disk too. Left behind,
    // the next parse would read the stripe straight back in.
    await section.getByRole('radio', { name: 'Off' }).first().click();
    await waitForSaved(window);
    const after = await readPageFiles(project.dir, project.pageName);
    expect(after.css).not.toContain('nth-child');
    expect(after.css).toContain('border-bottom: 1px solid #e0e0e0;');
  });

  test('is not offered on an element that is not a table', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    // Selecting the table unfolds its layers, rows included.
    await layersRowByClass(window, 'rect_t1a1').click();
    await expect(panelSection(window, 'Rows and cells')).toBeVisible();
    await layersRowByClass(window, 'rect_t3a3').click();
    // Prove the row is selected, or the absence below proves nothing.
    await expect(canvasElement(window, 'rect_t3a3')).toHaveClass(/selected/);
    await expect(panelSection(window, 'Rows and cells')).toHaveCount(0);
  });
});

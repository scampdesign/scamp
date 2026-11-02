import { test, expect } from '../fixtures/app';
import { waitForSaved } from '../fixtures/assertions';
import { drawAndSelectRect } from '../fixtures/panel';
import { canvasElement, pageRoot } from '../fixtures/selectors';

/**
 * A selected element is outlined on the element itself, on today's canvas
 * and on the iframe canvas experiment (`SCAMP_E2E_IFRAME=1`) alike.
 */
test.describe('canvas: selection outline', () => {
  test('outlines the selected element, each of a multi-select, and none once deselected', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    const first = canvasElement(window, await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 160, y: 120 }));
    const second = canvasElement(window, await drawAndSelectRect(window, { x: 220, y: 40 }, { x: 340, y: 120 }));

    await expect(second).toHaveCSS('outline-style', 'solid');
    await expect(second).toHaveCSS('outline-width', '2px');
    await expect(first).toHaveCSS('outline-style', 'none');

    const box = await first.boundingBox();
    if (box === null) throw new Error('first rect not on screen');
    await window.keyboard.down('Shift');
    await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await window.keyboard.up('Shift');
    await expect(first).toHaveCSS('outline-style', 'solid');
    await expect(second).toHaveCSS('outline-style', 'solid');

    // Empty page: the root takes the selection, and the rects lose theirs.
    const right = await second.boundingBox();
    if (right === null) throw new Error('second rect not on screen');
    await window.mouse.click(right.x + right.width + 100, right.y + right.height / 2);
    await expect(first).toHaveCSS('outline-style', 'none');
    await expect(second).toHaveCSS('outline-style', 'none');
  });
});

const TEXT_TSX = [
  "import styles from './home.module.css';",
  '',
  'export default function Home() {',
  '  return (',
  '    <div data-scamp-id="root" className={styles.root}>',
  '      <p data-scamp-id="e5f6" className={styles.label_e5f6}>Edit me</p>',
  '    </div>',
  '  );',
  '}',
  '',
].join('\n');

const TEXT_CSS = [
  '.root {',
  '  width: 100%;',
  '  min-height: 100vh;',
  '  position: relative;',
  '}',
  '',
  '.label_e5f6 {',
  '  position: absolute;',
  '  left: 40px;',
  '  top: 40px;',
  '  font-size: 32px;',
  '}',
  '',
].join('\n');

test.describe('canvas: text-editing outline', () => {
  test.use({ projectOptions: { format: 'nextjs', pageContent: { home: { tsx: TEXT_TSX, css: TEXT_CSS } } } });

  test('a text being edited has a dashed outline', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    const label = canvasElement(window, 'label_e5f6');
    const box = await label.boundingBox();
    if (box === null) throw new Error('label not on screen');
    await window.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(label).toHaveAttribute('contenteditable', 'true');
    await expect(label).toHaveCSS('outline-style', 'dashed');
  });

  test('undo after a text edit puts the text back', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    const label = canvasElement(window, 'label_e5f6');
    const box = await label.boundingBox();
    if (box === null) throw new Error('label not on screen');
    await window.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(label).toHaveAttribute('contenteditable', 'true');
    await window.keyboard.type('Changed');
    // Escape commits and leaves focus where the edit was: inside the
    // iframe, on the iframe canvas, whose keys never reached the app.
    await window.keyboard.press('Escape');
    await expect(label).toHaveText('Changed');
    await waitForSaved(window);
    await window.keyboard.press('ControlOrMeta+z');
    await expect(label).toHaveText('Edit me');
  });
});

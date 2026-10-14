import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { pageRoot } from '../fixtures/selectors';
/**
 * A side handle sizes one axis: narrowing a text box that hugs its
 * height leaves the height hugging, so the text wraps and the box grows.
 * see docs/archive/2026-10-14-text-resize-height-plan.md
 */
const TSX = [
    "import styles from './home.module.css';",
    '',
    'export default function Home() {',
    '  return (',
    '    <div data-scamp-id="root" className={styles.root}>',
    '      <p data-scamp-id="e5f6" className={styles.label_e5f6}>A heading that wraps</p>',
    '      <p data-scamp-id="a7b8" className={styles.caption_a7b8}>A caption with a set height</p>',
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
    '.label_e5f6 {',
    '  position: absolute;',
    '  left: 40px;',
    '  top: 40px;',
    '  width: fit-content;',
    '  height: fit-content;',
    '  font-size: 40px;',
    '}',
    '',
    '.caption_a7b8 {',
    '  position: absolute;',
    '  left: 40px;',
    '  top: 240px;',
    '  width: fit-content;',
    '  height: 80px;',
    '  font-size: 20px;',
    '}',
    '',
].join('\n');
test.use({ projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } } });
const center = async (window, selector) => {
    const box = await window.locator(selector).first().boundingBox();
    if (box === null)
        throw new Error(`${selector} not on screen`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
/** Select an element, then drag one of its handles by (dx, dy) screen px. */
const dragHandle = async (window, id, handle, dx, dy) => {
    const el = await center(window, `[data-scamp-id="${id}"]`);
    await window.mouse.click(el.x, el.y);
    const h = await center(window, `[data-handle="${handle}"]`);
    await window.mouse.move(h.x, h.y);
    await window.mouse.down();
    await window.mouse.move(h.x + dx, h.y + dy, { steps: 6 });
    await window.mouse.up();
    await waitForSaved(window);
};
const block = (css, className) => css.match(new RegExp(`\\.${className} \\{[^}]*\\}`))?.[0] ?? '';
/** Canvas px per screen px, from the frame's scale. */
const scaleOf = async (window) => window.locator('[data-testid="canvas-frame"]').evaluate((frame) => frame.offsetWidth > 0 ? frame.getBoundingClientRect().width / frame.offsetWidth : 1);
test('narrowing a text box that hugs its height keeps it hugging', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const label = window.locator('[data-scamp-id="label_e5f6"]');
    const before = await label.evaluate((n) => ({ w: n.offsetWidth, h: n.offsetHeight }));
    const scale = await scaleOf(window);
    await dragHandle(window, 'label_e5f6', 'e', -60, 0);
    const css = block((await readPageFiles(project.dir, 'home')).css, 'label_e5f6');
    const width = Number(css.match(/width: (\d+)px;/)?.[1]);
    // Starts from the width on screen, not a stored fallback.
    expect(Math.abs(width - (before.w - 60 / scale))).toBeLessThanOrEqual(2);
    expect(css).toContain('height: fit-content;');
    // The text wrapped, so the box grew.
    const after = await label.evaluate((n) => n.offsetHeight);
    expect(after).toBeGreaterThan(before.h);
});
test('a set height stays when the width changes', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await dragHandle(window, 'caption_a7b8', 'e', -40, 0);
    const css = block((await readPageFiles(project.dir, 'home')).css, 'caption_a7b8');
    expect(css).toMatch(/width: \d+px;/);
    expect(css).toContain('height: 80px;');
});
test('a corner fixes both axes', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await dragHandle(window, 'label_e5f6', 'se', -40, 20);
    const css = block((await readPageFiles(project.dir, 'home')).css, 'label_e5f6');
    expect(css).toMatch(/width: \d+px;/);
    expect(css).toMatch(/height: \d+px;/);
    expect(css).not.toContain('fit-content');
});

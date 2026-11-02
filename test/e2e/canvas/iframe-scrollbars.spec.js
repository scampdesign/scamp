import { test, expect } from '../fixtures/app';
import { IFRAME_CANVAS, canvasElement, pageRoot } from '../fixtures/selectors';
/**
 * The iframe canvas experiment draws no scrollbars of its own, even when the
 * page's content runs past the canvas's edge: today's canvas is a div, which
 * never scrolls either.
 */
const TSX = [
    "import styles from './home.module.css';",
    '',
    'export default function Home() {',
    '  return (',
    '    <div data-scamp-id="root" className={styles.root}>',
    '      <div data-scamp-id="c3d4" className={styles.wide_c3d4} />',
    '    </div>',
    '  );',
    '}',
    '',
].join('\n');
const CSS = [
    '.root {',
    '  width: 100%;',
    '  min-height: 100vh;',
    '  position: relative;',
    '}',
    '',
    '.wide_c3d4 {',
    '  position: absolute;',
    '  left: 1300px;',
    '  top: 40px;',
    '  width: 400px;',
    '  height: 100px;',
    '  background: #c33;',
    '}',
    '',
].join('\n');
test.use({ projectOptions: { format: 'nextjs', pageContent: { home: { tsx: TSX, css: CSS } } } });
test.describe('canvas: iframe scrollbars', () => {
    test.skip(!IFRAME_CANVAS, 'only the iframe canvas has a document of its own');
    test('content past the canvas edge adds no scrollbar to the iframe', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(canvasElement(window, 'wide_c3d4')).toBeVisible();
        // A scrollbar takes its width out of the document's client box.
        const gutters = await window.evaluate(() => {
            const iframe = document.querySelector('[data-testid="iframe-canvas"] iframe');
            const root = iframe?.contentDocument?.documentElement;
            if (!iframe || !root)
                return null;
            return { x: iframe.clientWidth - root.clientWidth, y: iframe.clientHeight - root.clientHeight };
        });
        expect(gutters).toEqual({ x: 0, y: 0 });
    });
    test('content past the canvas edge shows, and the page still lays out at the canvas width', async ({ window }) => {
        await expect(canvasElement(window, 'wide_c3d4')).toBeVisible();
        const widths = await window.evaluate(() => {
            const iframe = document.querySelector('[data-testid="iframe-canvas"] iframe');
            const frame = document.querySelector('[data-testid="canvas-frame"]');
            const root = iframe?.contentDocument?.querySelector('[data-element-id="root"]');
            if (!iframe || !frame || !root)
                return null;
            return { frame: frame.offsetWidth, iframe: iframe.offsetWidth, root: root.offsetWidth };
        });
        if (widths === null)
            throw new Error('canvas not found');
        // The rect ends at 1300 + 400 = 1700, past the 1440 canvas.
        expect(widths.iframe).toBe(1700);
        expect(widths.root).toBe(widths.frame);
    });
});

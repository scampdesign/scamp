import { promises as fs } from 'fs';
import * as path from 'path';
import { test, expect, stubSaveDialog } from '../fixtures/app';
import { panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
/**
 * Exporting an element positioned on the page draws it from the image's
 * top-left, with its own padding and type, not shifted by its page
 * offset. see docs/notes/export-element-position.md
 */
const TSX = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="a1b2" className={styles.card_a1b2}>
        <p data-scamp-id="c3d4" className={styles.title_c3d4}>Hello</p>
      </div>
    </div>
  );
}
`;
const CSS = `.root {
  width: 100%;
  min-height: 100vh;
}

.card_a1b2 {
  position: absolute;
  left: 40px;
  top: 40px;
  display: flex;
  flex-direction: column;
  padding: 40px;
  background: #00ff00;
}

.title_c3d4 {
  font-size: 48px;
  font-weight: 700;
  color: #ff0000;
}
`;
test.use({ projectOptions: { format: 'legacy', pageContent: { home: { tsx: TSX, css: CSS } } } });
/** Decode a PNG in the page and read pixels at the given points. */
const pixelsOf = (window, png, points) => window.evaluate(async ([b64, pts]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null)
        throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const px = pts.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    });
    return { width: img.width, height: img.height, px };
}, [png.toString('base64'), points]);
test('an absolutely positioned element exports with its padding and type in place', async ({ window, app, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const card = window.locator('[data-scamp-id="card_a1b2"]');
    const size = await card.evaluate((n) => ({ w: n.offsetWidth, h: n.offsetHeight }));
    const box = await card.boundingBox();
    if (box === null)
        throw new Error('card not on screen');
    // Select it through its padding, not its text.
    await window.mouse.click(box.x + 5, box.y + 5);
    const out = path.join(project.dir, 'card.png');
    await stubSaveDialog(app, out);
    await panelSection(window, 'Export').getByRole('button', { name: /Export card_a1b2/ }).click();
    await expect.poll(async () => fs.stat(out).then((s) => s.size > 0, () => false), { timeout: 15_000 }).toBe(true);
    // The default scale is 2x.
    const scale = 2;
    const { width, height, px } = await pixelsOf(window, await fs.readFile(out), [
        [10 * scale, 10 * scale], // inside the top-left padding
        [(size.w - 10) * scale, (size.h - 10) * scale], // inside the bottom-right padding
    ]);
    expect(width).toBe(size.w * scale);
    expect(height).toBe(size.h * scale);
    for (const [r, g, b] of px)
        expect([r, g, b]).toEqual([0, 255, 0]);
    // The heading is red, bold, 48px: red pixels fill a band of the card's
    // middle rather than a 14px default line.
    const redRows = await window.evaluate(async ([b64, w, h]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx === null)
            throw new Error('no 2d context');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        let first = -1;
        let last = -1;
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const i = (y * w + x) * 4;
                if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 0) < 80 && (data[i + 2] ?? 0) < 80) {
                    if (first === -1)
                        first = y;
                    last = y;
                    break;
                }
            }
        }
        return { first, last };
    }, [(await fs.readFile(out)).toString('base64'), width, height]);
    expect(redRows.first).toBeGreaterThanOrEqual(40 * scale - 2);
    expect(redRows.last - redRows.first).toBeGreaterThan(25 * scale);
});

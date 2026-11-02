import { test, expect } from '../fixtures/app';
import { dragComponentToCanvas, openPagesSection } from '../fixtures/components';
import { measureFrame, frameToClient, selectTool } from '../fixtures/canvas';
import { canvasElement, pageRoot } from '../fixtures/selectors';
/**
 * Dropping a component from the sidebar nests it inside whatever container
 * is under the cursor. It used to land at the page root no matter where the
 * cursor was. The DOM parent is the assertion that matters — the unit tests
 * cover which container `resolveComponentDrop` picks, but only a real render
 * proves the instance is actually mounted inside it.
 * see docs/notes/components-data-model.md
 */
const CARD_TSX = `import styles from './Card.module.css';

type CardProps = {
  className?: string;
};

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} />
  );
}
`;
const CARD_CSS = `.root {
  width: 60px;
  height: 30px;
  background: #cccccc;
}
`;
// Every target sits inside a small band at the canvas's top-left, because
// the drop point has to be a real on-screen coordinate. The drag helper
// dispatches at `document.elementFromPoint`, which returns null off-screen —
// and the canvas frame is NOT fit-scaled down here, so it runs well past the
// right edge of the window and under the properties panel. Roughly
// x < 500, y < 400 (logical) is reliably visible.
//
// `rect_row`'s children are TEXT, not rectangles. That matters:
// `resolveDropContainer` returns the deepest RECTANGLE under the cursor, so
// a rectangle child would (correctly) swallow the drop itself. Text is a
// leaf, so the walk continues out to the row — which is the flow container
// whose insert index we want to exercise.
const PAGE_TSX = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_box" className={styles.rect_box} />
      <div data-scamp-id="rect_row" className={styles.rect_row}>
        <p data-scamp-id="text_one" className={styles.text_one}>One</p>
        <p data-scamp-id="text_two" className={styles.text_two}>Two</p>
      </div>
    </div>
  );
}
`;
const PAGE_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  background: #ffffff;
  position: relative;
}

.rect_box {
  position: absolute;
  left: 40px;
  top: 40px;
  width: 200px;
  height: 120px;
  background: #eeeeee;
}

.rect_row {
  position: absolute;
  left: 40px;
  top: 200px;
  width: 400px;
  height: 120px;
  display: flex;
  flex-direction: row;
  background: #f6f6f6;
}

.text_one {
  width: 200px;
  height: 120px;
}

.text_two {
  width: 200px;
  height: 120px;
}
`;
test.use({
    projectOptions: {
        format: 'nextjs',
        components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS }],
        pageContent: { home: { tsx: PAGE_TSX, css: PAGE_CSS } },
    },
});
/**
 * The `data-scamp-id` of the nearest ancestor of the dropped instance that
 * is itself a canvas element. That's the instance's real parent as rendered,
 * which is what the drop is supposed to control.
 */
const instanceParentScampId = async (window) => window.evaluate(() => {
    // The iframe canvas experiment draws the page inside an iframe.
    const drawn = document.querySelector('[data-testid="iframe-canvas"] iframe')?.contentDocument ?? document;
    const instance = drawn.querySelector('[data-scamp-instance-id]');
    if (!instance)
        return null;
    const parent = instance.parentElement?.closest('[data-element-id]');
    return parent?.getAttribute('data-scamp-id') ?? null;
});
test.describe('components: drop into the container under the cursor', () => {
    test('drops into an absolutely-positioned box rather than the page root', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(canvasElement(window, 'rect_box')).toBeVisible();
        await selectTool(window, 'v');
        const metrics = await measureFrame(window);
        // Middle of rect_box (40,40 → 240,160).
        const drop = frameToClient(metrics, { x: 140, y: 100 });
        await dragComponentToCanvas(window, 'Card', drop.x, drop.y);
        await openPagesSection(window);
        await expect
            .poll(async () => instanceParentScampId(window))
            .toBe('rect_box');
    });
    test('drops into a flex row and lands before the child it was dropped on', async ({ window, }) => {
        await expect(canvasElement(window, 'rect_row')).toBeVisible();
        await selectTool(window, 'v');
        const metrics = await measureFrame(window);
        // Left quarter of text_one (spans 40..240, centre 140), so the gap line
        // — and the insert index — resolve to BEFORE it, not after.
        const drop = frameToClient(metrics, { x: 90, y: 260 });
        await dragComponentToCanvas(window, 'Card', drop.x, drop.y);
        await openPagesSection(window);
        await expect.poll(async () => instanceParentScampId(window)).toBe('rect_row');
        // Ordering is the whole point of the insert index: appending would put
        // the instance last, so this is what distinguishes the two.
        const firstChildIsInstance = await window.evaluate(() => {
            const drawn = document.querySelector('[data-testid="iframe-canvas"] iframe')?.contentDocument ?? document;
            const row = drawn.querySelector('[data-scamp-id="rect_row"]');
            const first = row?.firstElementChild;
            return first?.hasAttribute('data-scamp-instance-id') ?? false;
        });
        expect(firstChildIsInstance).toBe(true);
    });
    test('still falls back to the page root when dropped on empty canvas', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await selectTool(window, 'v');
        const metrics = await measureFrame(window);
        // Right of rect_box (ends at x 240) and above rect_row (starts at y 200).
        const drop = frameToClient(metrics, { x: 350, y: 100 });
        await dragComponentToCanvas(window, 'Card', drop.x, drop.y);
        await openPagesSection(window);
        await expect.poll(async () => instanceParentScampId(window)).toBe('root');
    });
});

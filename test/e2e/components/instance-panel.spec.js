import { test, expect } from '../fixtures/app';
import { dragComponentToCanvas, openPagesSection } from '../fixtures/components';
import { measureFrame, frameToClient, selectTool } from '../fixtures/canvas';
import { canvasElement, canvasLocator, pageRoot } from '../fixtures/selectors';
/**
 * A page owns exactly one thing about a component instance: its size. The
 * properties panel has to reflect that — showing Background or Border would
 * offer edits the generator has nowhere to write, so they'd silently vanish
 * on the next reload. The Element section takes the component's name, and is
 * where instance-level component controls will go.
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
  width: 120px;
  height: 60px;
  background: #cccccc;
}
`;
const PAGE_TSX = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_plain" className={styles.rect_plain} />
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

.rect_plain {
  position: absolute;
  left: 260px;
  top: 40px;
  width: 200px;
  height: 160px;
  background: #eeeeee;
}
`;
test.use({
    projectOptions: {
        format: 'nextjs',
        components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS }],
        pageContent: { home: { tsx: PAGE_TSX, css: PAGE_CSS } },
    },
});
const panel = (page) => page.locator('[data-testid="properties-panel"]');
/**
 * A section in the properties panel, by its title. `data-panel-section`
 * is set on both the collapsible and static branches of `Section`, so it
 * holds regardless of how a given section chooses to render its heading.
 */
const panelSection = (page, title) => panel(page).locator(`[data-panel-section="${title}"]`);
/** Drop a Card on empty canvas; it auto-selects on insert. */
const placeAndSelectCard = async (page) => {
    await selectTool(page, 'v');
    const metrics = await measureFrame(page);
    // Clear of rect_plain, and inside the on-screen band — the canvas frame
    // runs past the window's right edge, so far-right coordinates are not
    // hit-testable. see drop-into-container.spec.ts
    const drop = frameToClient(metrics, { x: 100, y: 300 });
    await dragComponentToCanvas(page, 'Card', drop.x, drop.y);
    await openPagesSection(page);
    await expect(canvasLocator(page, '[data-scamp-instance-id]:not([data-scamp-prop])')).toHaveCount(1);
};
test.describe('components: properties panel for an instance', () => {
    test('titles the Element section with the component name', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await placeAndSelectCard(window);
        await expect(panelSection(window, 'Card')).toBeVisible();
        // The generic "Element" heading belongs to every other element type;
        // an instance's identity is the component it points at.
        await expect(panelSection(window, 'Element')).toHaveCount(0);
    });
    test('shows Size and hides the sections a page cannot write', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await placeAndSelectCard(window);
        await expect(panelSection(window, 'Size')).toBeVisible();
        for (const hidden of ['Background', 'Border', 'Layout', 'Spacing']) {
            await expect(panelSection(window, hidden)).toHaveCount(0);
        }
    });
    test('still shows the full section set for a plain rectangle', async ({ window, }) => {
        // Guard: the gating is instance-only. Without this, hiding every
        // section everywhere would pass the test above.
        await expect(canvasElement(window, 'rect_plain')).toBeVisible();
        await selectTool(window, 'v');
        const metrics = await measureFrame(window);
        const hit = frameToClient(metrics, { x: 360, y: 120 });
        await window.mouse.click(hit.x, hit.y);
        await expect(panelSection(window, 'Element')).toBeVisible();
        await expect(panelSection(window, 'Size')).toBeVisible();
        await expect(panelSection(window, 'Background')).toBeVisible();
        await expect(panelSection(window, 'Border')).toBeVisible();
    });
});

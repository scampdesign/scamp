import { test, expect } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { clickContextMenuItem, createComponentFromSidebar, dragComponentToCanvas, openElementContextMenu, } from '../fixtures/components';
import { frameToClient, measureFrame, selectTool } from '../fixtures/canvas';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
// Backlog-6 story 4: component slots. Covers defining a slot in the
// component editor (→ `{children}` + `React.ReactNode` in the component
// TSX) and filling it on a page (content nests as the instance's JSX
// children). see docs/archive/2026-07-16-component-slots-plan.md
test.describe('components: defining a slot', () => {
    test.use({ projectOptions: { format: 'nextjs' } });
    test('"Make slot" turns a rect into a {children} slot in the component TSX', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await createComponentFromSidebar(window, 'Card');
        // A childless rectangle inside the component editor is eligible.
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 220 });
        await waitForSaved(window);
        // Right-click it and choose "Make slot" (select tool first so the
        // right-click hit-tests the element instead of starting a draw).
        await selectTool(window, 'v');
        const metrics = await measureFrame(window);
        const center = frameToClient(metrics, { x: 180, y: 160 });
        await openElementContextMenu(window, center.x, center.y);
        await clickContextMenuItem(window, 'Make slot');
        await waitForSaved(window);
        const { tsx } = await project.readComponent('Card');
        expect(tsx).toContain('children?: React.ReactNode');
        expect(tsx).toMatch(/>\s*\{children\}\s*</);
    });
});
test.describe('components: filling a slot on a page', () => {
    const CARD_TSX = `import styles from './Card.module.css';

type CardProps = {
  children?: React.ReactNode;
};

export default function Card({ children }: CardProps) {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_slot" className={styles.rect_slot}>{children}</div>
    </div>
  );
}
`;
    const CARD_CSS = `.root {
  display: flex;
  flex-direction: column;
  width: 300px;
  padding: 20px;
  background-color: #ffffff;
}

.rect_slot {
  width: 260px;
  height: 160px;
  background-color: #eeeeee;
}
`;
    test.use({
        projectOptions: {
            format: 'nextjs',
            components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS }],
        },
    });
    test('drawing into a slot drop zone nests the element as instance children', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Place a Card instance on the home page.
        await selectTool(window, 'v');
        const metrics = await measureFrame(window);
        const drop = frameToClient(metrics, { x: 220, y: 220 });
        await dragComponentToCanvas(window, 'Card', drop.x, drop.y);
        // The instance renders its slot as a drop zone.
        const slot = window.locator('[data-scamp-slot]').first();
        await expect(slot).toBeVisible();
        const box = await slot.boundingBox();
        if (!box)
            throw new Error('slot drop zone has no bounding box');
        // Draw a rectangle inside the slot box — the create path routes it
        // into the instance as slot content.
        await selectTool(window, 'r');
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await window.mouse.move(cx - 18, cy - 18);
        await window.mouse.down();
        await window.mouse.move(cx + 18, cy + 18, { steps: 10 });
        await window.mouse.up();
        await waitForSaved(window);
        const { tsx } = await project.readPage('home');
        // The instance tag now wraps children (no longer self-closing).
        expect(tsx).toMatch(/<Card[^>]*data-scamp-instance-id="inst_[a-z0-9_]+"[^>]*>/);
        expect(tsx).toContain('</Card>');
        expect(tsx).not.toMatch(/<Card[^>]*\/>/);
    });
});

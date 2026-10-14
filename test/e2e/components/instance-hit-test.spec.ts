import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { dragComponentToCanvas } from '../fixtures/components';
import { frameToClient, measureFrame, selectTool } from '../fixtures/canvas';
import { waitForSaved } from '../fixtures/assertions';
import { pageRoot } from '../fixtures/selectors';

/**
 * A click anywhere a component instance draws selects the instance, even
 * when its wrapper box is 0 × 0 (the component's content doesn't give it
 * a size), so it can be dragged and double-clicked.
 * see docs/archive/2026-10-14-instance-hit-test-plan.md
 */

const CARD_TSX = `import styles from './Card.module.css';

export default function Card() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_a" className={styles.rect_a} />
    </div>
  );
}
`;
const CARD_CSS = `.root {
  width: 200px;
  height: 120px;
  background: #f0f0f0;
}

.rect_a {
  width: 200px;
  height: 120px;
  background: #cccccc;
}
`;

const SLOT_TSX = `import styles from './Slotted.module.css';

type SlottedProps = {
  children?: React.ReactNode;
};

export default function Slotted({ children }: SlottedProps) {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_slot" className={styles.rect_slot}>{children}</div>
    </div>
  );
}
`;
const SLOT_CSS = `.root {
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
    components: [
      { name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS },
      { name: 'Slotted', tsxContent: SLOT_TSX, cssContent: SLOT_CSS },
    ],
  },
});

const overlay = (window: Page): Locator => window.locator('[data-testid="selection-overlay"]');

type Box = { x: number; y: number; width: number; height: number };

const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('no bounding box');
  return box;
};

/** Place `Card`, then click empty canvas so nothing of it is selected. */
const placeCard = async (window: Page): Promise<Box> => {
  await expect(pageRoot(window)).toBeVisible();
  await selectTool(window, 'v');
  const metrics = await measureFrame(window);
  const drop = frameToClient(metrics, { x: 100, y: 100 });
  await dragComponentToCanvas(window, 'Card', drop.x, drop.y);
  await waitForSaved(window);
  const card = await boxOf(overlay(window));
  // The wrapper has no size of its own; that's the case this covers.
  const wrapper = await boxOf(window.locator('[data-scamp-instance-id]').first());
  expect(wrapper.width * wrapper.height).toBe(0);
  const empty = frameToClient(metrics, { x: 40, y: 420 });
  await window.mouse.click(empty.x, empty.y);
  await expect.poll(async () => (await boxOf(overlay(window))).width).toBeGreaterThan(card.width * 2);
  return card;
};

test('a click on the middle of an instance selects it', async ({ window }) => {
  const card = await placeCard(window);
  await window.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await expect.poll(async () => Math.round((await boxOf(overlay(window))).width)).toBe(Math.round(card.width));
});

test('a press and drag on an instance moves it', async ({ window }) => {
  const card = await placeCard(window);
  const start = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
  await window.mouse.move(start.x, start.y);
  await window.mouse.down();
  await window.mouse.move(start.x + 80, start.y + 40, { steps: 8 });
  await window.mouse.up();
  await waitForSaved(window);
  const moved = await boxOf(overlay(window));
  expect(Math.round(moved.width)).toBe(Math.round(card.width));
  expect(Math.abs(moved.x - (card.x + 80))).toBeLessThanOrEqual(2);
  expect(Math.abs(moved.y - (card.y + 40))).toBeLessThanOrEqual(2);
});

test('a double-click on an instance opens its component', async ({ window }) => {
  const card = await placeCard(window);
  await window.mouse.dblclick(card.x + card.width / 2, card.y + card.height / 2);
  await expect(window.getByRole('navigation', { name: 'Component editor breadcrumb' })).toBeVisible();
});

test('page content in a slot still selects itself, not the instance', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await selectTool(window, 'v');
  const metrics = await measureFrame(window);
  const drop = frameToClient(metrics, { x: 220, y: 220 });
  await dragComponentToCanvas(window, 'Slotted', drop.x, drop.y);
  const slot = await boxOf(window.locator('[data-scamp-slot]').first());

  // Draw a 36px rectangle into the slot.
  await selectTool(window, 'r');
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  await window.mouse.move(cx - 18, cy - 18);
  await window.mouse.down();
  await window.mouse.move(cx + 18, cy + 18, { steps: 10 });
  await window.mouse.up();
  await waitForSaved(window);

  await selectTool(window, 'v');
  const empty = frameToClient(metrics, { x: 40, y: 420 });
  await window.mouse.click(empty.x, empty.y);
  // Click the slot content where it renders, inside the slot box.
  const content = await boxOf(window.locator('[data-scamp-slot] [data-element-id]').first());
  await window.mouse.click(content.x + content.width / 2, content.y + content.height / 2);
  await expect.poll(async () => Math.round((await boxOf(overlay(window))).width)).toBe(Math.round(content.width));
});

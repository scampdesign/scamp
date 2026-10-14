import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from '../fixtures/app';
import type { Page } from '@playwright/test';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import {
  createComponentFromSidebar,
  dragComponentToCanvas,
  openComponentsSection,
} from '../fixtures/components';
import { selectTool, measureFrame, frameToClient } from '../fixtures/canvas';
import {
  canvasElementsByPrefix,
  componentSidebarItem,
  pageRoot,
} from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

// Backlog: the component editor's artboard should match the source element on
// creation, expose resize handles, and hug its content on a handle
// double-click. see docs/archive/2026-07-17-component-canvas-sizing-plan.md

test.use({ projectOptions: { format: 'nextjs' } });

type ConfigShape = {
  canvasWidth?: number;
  componentCanvas?: Record<string, { width: number; height: number }>;
};

const readConfig = async (dir: string): Promise<ConfigShape> =>
  JSON.parse(
    await readFile(path.join(dir, 'scamp.config.json'), 'utf8')
  ) as ConfigShape;

/** Right-click an element at a frame-local point and convert it via the menu. */
const convertToComponent = async (
  window: Page,
  centerFrame: { x: number; y: number },
  name: string
): Promise<void> => {
  await selectTool(window, 'v');
  const metrics = await measureFrame(window);
  const target = frameToClient(metrics, centerFrame);
  await window.mouse.click(target.x, target.y, { button: 'right' });
  await window.getByRole('menuitem', { name: /Create component/i }).click();
  const input = window.getByPlaceholder('ComponentName');
  await input.fill(name);
  await input.press('Enter');
  await openComponentsSection(window);
  await expect(componentSidebarItem(window, name)).toBeVisible();
};

test.describe('components: canvas sizing', () => {
  test('component canvas matches a converted fixed-size element', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 360, y: 260 });
    const size = await canvasElementsByPrefix(window, 'rect_')
      .first()
      .evaluate((n) => {
        const el = n as HTMLElement;
        return { w: el.offsetWidth, h: el.offsetHeight };
      });
    await waitForSaved(window);

    await convertToComponent(window, { x: 230, y: 180 }, 'Card');

    await expect
      .poll(async () => (await readConfig(project.dir)).componentCanvas?.['Card'])
      .toEqual({ width: size.w, height: size.h });
  });

  test('a stretched element yields a full-width component canvas, not the default', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 300, y: 220 });
    // Width → Fill: the element now fills the page width.
    await panelSection(window, 'Size')
      .getByRole('button', { name: 'Width type' })
      .click();
    await window.getByRole('option', { name: 'Fill' }).click();
    await waitForSaved(window);

    const stretchedWidth = await canvasElementsByPrefix(window, 'rect_')
      .first()
      .evaluate((n) => (n as HTMLElement).offsetWidth);
    // Sanity: the stretched element is wider than the 480 default canvas.
    expect(stretchedWidth).toBeGreaterThan(480);

    await convertToComponent(window, { x: 150, y: 160 }, 'Wide');

    await expect
      .poll(
        async () =>
          (await readConfig(project.dir)).componentCanvas?.['Wide']?.width
      )
      .toBe(stretchedWidth);
  });

  test('the component artboard shows resize handles on open', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createComponentFromSidebar(window, 'Box');
    // Handles are present in the component editor without selecting the root.
    await expect(window.locator('[aria-label^="Resize canvas"]')).toHaveCount(4);
  });

  test('double-clicking a handle fits the artboard to its content', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createComponentFromSidebar(window, 'Box'); // 480×320 default canvas
    // Draw a small element well inside the default canvas.
    await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 180, y: 140 });
    await waitForSaved(window);

    // Tight content bounds, measured scale-free (offsetLeft/Top) exactly like
    // the app's hug. The scaffold root has no padding, so the hugged canvas
    // should equal these — no leftover gap (regression: a bounding-rect/scale
    // measure left ~2px below the content at fractional zoom).
    const content = await window.evaluate(() => {
      const frame = document.querySelector('[data-testid="canvas-frame"]');
      if (!frame) return { right: -1, bottom: -1 };
      let right = 0;
      let bottom = 0;
      for (const node of frame.querySelectorAll('[data-element-id]')) {
        const el = node as HTMLElement;
        if (el.dataset['elementId'] === 'root') continue;
        let left = 0;
        let top = 0;
        let cur: HTMLElement | null = el;
        while (cur && cur !== frame) {
          left += cur.offsetLeft;
          top += cur.offsetTop;
          cur = cur.offsetParent as HTMLElement | null;
        }
        right = Math.max(right, left + el.offsetWidth);
        bottom = Math.max(bottom, top + el.offsetHeight);
      }
      return { right, bottom };
    });

    // Scoped to the canvas frame: a second handle exists outside it, and
    // an unscoped locator is a strict-mode violation the moment both are
    // mounted — which under full-suite load, they are.
    await window
      .getByTestId('canvas-frame')
      .getByLabel('Resize canvas (bottom-right)')
      .dblclick();

    // The stored canvas shrinks below the 480×320 default toward the content.
    await expect
      .poll(
        async () =>
          (await readConfig(project.dir)).componentCanvas?.['Box']?.width ?? 480
      )
      .toBeLessThan(480);
    const box = (await readConfig(project.dir)).componentCanvas?.['Box'];
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThan(480);
    expect(box!.height).toBeLessThan(320);
    // Snug fit: the hugged canvas matches the content bounds (no 2px gap).
    expect(Math.abs(box!.width - content.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.height - content.bottom)).toBeLessThanOrEqual(1);
  });
});

test.describe('components: a stretch-root component fills the page', () => {
  const BAR_TSX = `import styles from './Bar.module.css';

export default function Bar() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_bar" className={styles.text_bar}>Bar</p>
    </div>
  );
}
`;
  const BAR_CSS = `.root {
  width: 100%;
  min-height: 40px;
  background-color: #cccccc;
}

.text_bar {
  color: #111111;
}
`;

  test.use({
    projectOptions: {
      format: 'nextjs',
      components: [{ name: 'Bar', tsxContent: BAR_TSX, cssContent: BAR_CSS }],
    },
  });

  test("a stretch-root instance's component fills the page width, not shrink-to-content", async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'v');
    const metrics = await measureFrame(window);
    const drop = frameToClient(metrics, { x: 0, y: 100 });
    await dragComponentToCanvas(window, 'Bar', drop.x, drop.y);

    // The component's own root (rendered inside the instance) resolves its
    // width:100% against the page, so it fills the page-root width — rather
    // than collapsing to shrink-to-content (0) as it did before. The instance
    // wrapper itself is structurally 0-sized (content is absolutely
    // positioned), so we measure the rendered component root, not the wrapper.
    await expect
      .poll(async () =>
        window.evaluate(() => {
          // Scope the page root to the canvas frame — the layers-panel rows
          // also carry data-element-id, so a bare query hits the sidebar row.
          const page = document.querySelector(
            '[data-testid="canvas-frame"] [data-element-id="root"]'
          );
          const innerRoot = document.querySelector(
            '[data-scamp-instance-id] [data-scamp-id="root"]'
          );
          if (!page || !innerRoot) return null;
          const p = (page as HTMLElement).offsetWidth;
          const r = (innerRoot as HTMLElement).offsetWidth;
          return p > 0 && r === p;
        })
      )
      .toBe(true);
  });
});

test.describe('components: hugging a fixed-height padded root', () => {
  const HEADER_TSX = `import styles from './Header.module.css';

export default function Header() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_logo" className={styles.text_logo}>logo</p>
    </div>
  );
}
`;
  const HEADER_CSS = `.root {
  width: 100%;
  height: 60px;
  display: flex;
  align-items: center;
  padding: 20px;
  background: #e5e5e5;
}

.text_logo {
  width: fit-content;
  height: fit-content;
  font-size: 20px;
  color: #222222;
}
`;

  test.use({
    projectOptions: {
      format: 'nextjs',
      components: [
        { name: 'Header', tsxContent: HEADER_TSX, cssContent: HEADER_CSS },
      ],
    },
  });

  test('hug fits the fixed 60px root box, not content-plus-padding', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    // Open the seeded component in the editor.
    await openComponentsSection(window);
    await componentSidebarItem(window, 'Header').dblclick();
    const handle = window
      .getByTestId('canvas-frame')
      .getByLabel('Resize canvas (bottom-right)');
    await handle.waitFor();
    await handle.dblclick();

    // The fixed 60px root height is respected exactly — text line-height that
    // overflows the 20px-padded content box must NOT push the canvas past the
    // root's own edge (was a 2-3px gap below the component).
    await expect
      .poll(
        async () =>
          (await readConfig(project.dir)).componentCanvas?.['Header']?.height
      )
      .toBe(60);
  });
});

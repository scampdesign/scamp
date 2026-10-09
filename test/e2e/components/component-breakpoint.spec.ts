import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { waitForSaved } from '../fixtures/assertions';
import { switchBreakpoint } from '../fixtures/breakpoints';
import { openComponentsSection } from '../fixtures/components';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';
import { canvasFrame, componentSidebarItem, pageRoot } from '../fixtures/selectors';

/**
 * The component editor has its own breakpoint. It opens at Desktop
 * whatever the page was last set to, picking one applies the component's
 * rules for that screen size without resizing its canvas, edits land in
 * that breakpoint's @media block, and the page gets its own breakpoint
 * back on the way out.
 */

const NAV_TSX = `import styles from './Nav.module.css';

type NavProps = {
  className?: string;
};

export default function Nav({ className }: NavProps) {
  return (
    <nav data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <button data-scamp-id="item_0002" className={styles.item_0002} type="button">
        <span data-scamp-id="label_0003" className={styles.label_0003}>Dashboard</span>
      </button>
    </nav>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const NAV_CSS = `.root {
  width: 232px;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.item_0002 {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
}

.label_0003 {
  font-size: 14px;
}

@media (max-width: 768px) {
  .label_0003 {
    position: relative;
    left: 23px;
  }
}
`;

const HOME_TSX = `import styles from './Home.module.css';
import Nav from '@/components/Nav/Nav';

type HomeProps = {
  className?: string;
};

export default function Home({ className }: HomeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <Nav data-scamp-instance-id="inst_n1v1" />
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const HOME_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}
`;

test.use({
  projectOptions: {
    format: 'scamp',
    components: [{ name: 'Nav', tsxContent: NAV_TSX, cssContent: NAV_CSS }],
    pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } },
  },
});

const sizeButton = (page: Page): Locator => page.getByTestId('canvas-size-button');

/** The label's left edge inside its button, zoom removed. */
const labelOffset = async (frame: Locator): Promise<number> => {
  const item = frame.locator('[data-scamp-id="item_0002"]');
  return item.evaluate((el) => {
    const label = el.querySelector('[data-scamp-id="label_0003"]');
    if (label === null) throw new Error('no label');
    const scale = el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth;
    return Math.round((label.getBoundingClientRect().left - el.getBoundingClientRect().left) / scale);
  });
};

test('the component editor has its own breakpoint, and the page gets its back', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  // The page left at Tablet.
  await switchBreakpoint(window, 'tablet', 'Tablet');

  await openComponentsSection(window);
  await componentSidebarItem(window, 'Nav').click();
  const frame = canvasFrame(window);
  await expect(frame.getByText('Dashboard')).toBeVisible();

  // It opens at Desktop, not at the page's Tablet.
  await expect(sizeButton(window)).toHaveAttribute('data-active-breakpoint', 'desktop');
  await expect(sizeButton(window)).toHaveText(/^Desktop · \d+ × \d+/);
  const atDesktop = await labelOffset(frame);
  const frameWidth = (await frame.boundingBox())?.width;

  // Tablet applies the component's tablet rule, and the canvas keeps its size.
  await sizeButton(window).click();
  await window.getByTestId('canvas-size-popover').getByRole('button', { name: /^Tablet\b/ }).click();
  await expect(sizeButton(window)).toHaveAttribute('data-active-breakpoint', 'tablet');
  // Esc closes the popover and stays in the editor.
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('canvas-size-popover')).toHaveCount(0);
  await expect(frame.getByText('Dashboard')).toBeVisible();
  await expect.poll(() => labelOffset(frame)).toBe(atDesktop + 23);
  expect((await frame.boundingBox())?.width).toBe(frameWidth);

  // An edit at Tablet lands in the component's tablet block.
  const item = frame.locator('[data-scamp-id="item_0002"]');
  const box = await item.boundingBox();
  if (box === null) throw new Error('item not on screen');
  await window.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  await commitInput(panelInputByPrefix(window, 'Spacing', 'Padding'), '6');
  await waitForSaved(window);
  const css = await readFile(path.join(project.dir, 'components', 'Nav', 'Nav.module.css'), 'utf-8');
  const tablet = css.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/);
  expect(tablet?.[1]).toMatch(/\.item_0002 \{[^}]*padding: 6px;/);
  expect(css.match(/^\.item_0002 \{([^}]*)\}/m)?.[1]).not.toContain('padding');

  // Back on the page, its own breakpoint comes back with its canvas width.
  // Out of the padding field first: Esc in a field is the field's own.
  await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await window.keyboard.press('Escape');
  await expect(pageRoot(window).locator('[data-scamp-instance-id]').first()).toBeVisible();
  await expect(sizeButton(window)).toHaveAttribute('data-active-breakpoint', 'tablet');
});

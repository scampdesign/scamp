import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { canvasFrame, componentSidebarItem, pageRoot } from '../fixtures/selectors';

/**
 * The component editor draws a component the way an instance of it draws
 * on a page. Both cases came from an imported React sidebar: its tablet
 * rules applied in the editor (the frame is the component's 232px, not a
 * viewport), and its nested logo name vanished from every instance.
 */

const NAV_TSX = `import styles from './Nav.module.css';

type NavProps = {
  className?: string;
};

export default function Nav({ className }: NavProps) {
  return (
    <nav data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <span data-scamp-id="brand_0001" className={styles.brand_0001}>
        <span>Resova iQ</span>
      </span>
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
  gap: 8px;
  padding: 16px;
}

.brand_0001 {
  font-size: 20px;
  font-weight: 700;
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
    position: absolute;
    left: 23px;
    top: 18px;
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

/** Where `child` sits inside `parent`, in the element's own px (zoom removed). */
const offsetIn = async (page: Page, parent: Locator, child: Locator): Promise<{ x: number; y: number }> => {
  const [p, c, scale] = await Promise.all([
    parent.boundingBox(),
    child.boundingBox(),
    parent.evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth),
  ]);
  if (p === null || c === null) throw new Error('not on screen');
  void page;
  return { x: Math.round((c.x - p.x) / scale), y: Math.round((c.y - p.y) / scale) };
};

test('the component editor lays a component out as its instance does', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();

  // On the page: the nested name shows, and the label sits in its row.
  const instance = pageRoot(window).locator('[data-scamp-instance-id]').first();
  await expect(instance.getByText('Resova iQ')).toBeVisible();
  const onPage = await offsetIn(
    window,
    instance.locator('[data-scamp-id="item_0002"]'),
    instance.locator('[data-scamp-id="label_0003"]')
  );

  await openComponentsSection(window);
  await componentSidebarItem(window, 'Nav').click();
  const editor = canvasFrame(window);
  await expect(editor.getByText('Resova iQ')).toBeVisible();
  // The tablet rule doesn't apply at Desktop, however narrow the component's own frame.
  const inEditor = await offsetIn(
    window,
    editor.locator('[data-scamp-id="item_0002"]'),
    editor.locator('[data-scamp-id="label_0003"]')
  );
  expect(inEditor).toEqual(onPage);
});

import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { canvasFrame, pageRoot } from '../fixtures/selectors';

/**
 * Double-clicking a component instance on the canvas opens that
 * component's editor, and the way back is the view it was opened from.
 */

// Written the way Scamp writes a component, so opening it rewrites nothing.
const CARD_TSX = `import styles from './Card.module.css';

type CardProps = {
  className?: string;
};

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <p data-scamp-id="text_aaaa" className={styles.text_aaaa}>Inside the card</p>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const CARD_CSS = `.root {
  width: 200px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  background: #f0f0f0;
  position: relative;
}

.text_aaaa {
  font-size: 16px;
}
`;

const HOME_TSX = `import styles from './Home.module.css';
import Card from '@/components/Card/Card';

type HomeProps = {
  className?: string;
};

export default function Home({ className }: HomeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <Card data-scamp-instance-id="inst_c1d2" />
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

/** The canvas's interaction layer sits over every element: double-click where it is. */
const dblclickAt = async (page: Page, target: Locator): Promise<void> => {
  const box = await target.boundingBox();
  if (box === null) throw new Error('target not on screen');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
};

test.use({
  projectOptions: {
    format: 'scamp',
    components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS }],
    pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } },
  },
});

test('double-clicking an instance opens its component, and the breadcrumb and Esc come back', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  const words = pageRoot(window).getByText('Inside the card');
  await expect(words).toBeVisible();
  const breadcrumb = window.getByRole('navigation', { name: 'Component editor breadcrumb' });

  // On the component's own words, which aren't a page element.
  await dblclickAt(window, words);
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByRole('button', { name: 'Card' })).toBeVisible();

  // Back to the view it was opened from, through the breadcrumb.
  await breadcrumb.getByRole('button', { name: 'Home' }).click();
  await expect(breadcrumb).toHaveCount(0);
  await expect(canvasFrame(window).getByText('Inside the card')).toBeVisible();

  // And again, back with Esc.
  await dblclickAt(window, pageRoot(window).getByText('Inside the card'));
  await expect(breadcrumb).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(breadcrumb).toHaveCount(0);
  await expect(canvasFrame(window).getByText('Inside the card')).toBeVisible();
});

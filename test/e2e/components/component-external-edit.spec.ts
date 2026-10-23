import { promises as fs } from 'fs';
import * as path from 'path';

import { test, expect } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { canvasFrame, componentSidebarItem, pageRoot } from '../fixtures/selectors';

/**
 * An agent edits a component that isn't open. The page drawing it, and
 * the component when it's opened next, both show the edit without the
 * project being reopened.
 */

const CARD_TSX = `import styles from './Card.module.css';

type CardProps = {
  className?: string;
};

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <span data-scamp-id="title_0001" className={styles.title_0001}>Hello</span>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const cardCss = (background: string): string => `.root {
  width: 200px;
  height: 100px;
  background: ${background};
}

.title_0001 {
  font-size: 14px;
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
      <Card data-scamp-instance-id="inst_c0c1" />
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
    components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: cardCss('rgb(255, 0, 0)') }],
    pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } },
  },
});

test('an outside edit to a component that is not open reaches the page and the editor', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  const cardRoot = pageRoot(window).locator('[data-scamp-instance-id]').first().getByText('Hello').locator('..');
  await expect(cardRoot).toHaveCSS('background-color', 'rgb(255, 0, 0)');

  await fs.writeFile(path.join(project.dir, 'components', 'Card', 'Card.module.css'), cardCss('rgb(0, 0, 255)'), 'utf-8');
  await expect(cardRoot).toHaveCSS('background-color', 'rgb(0, 0, 255)');

  await openComponentsSection(window);
  await componentSidebarItem(window, 'Card').click();
  await expect(canvasFrame(window).getByText('Hello').locator('..')).toHaveCSS('background-color', 'rgb(0, 0, 255)');
});

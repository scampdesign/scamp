import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';

/**
 * A component placed inside another component draws on the page as
 * itself, styled by its own rules, not as a "Nested Badge" placeholder.
 */

const BADGE_TSX = `import styles from './Badge.module.css';

type BadgeProps = {
  className?: string;
};

export default function Badge({ className }: BadgeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <span data-scamp-id="label_0001" className={styles.label_0001}>New</span>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const BADGE_CSS = `.root {
  width: 48px;
  height: 20px;
  background: rgb(220, 38, 38);
}

.label_0001 {
  font-size: 12px;
}
`;

const CARD_TSX = `import styles from './Card.module.css';
import Badge from '@/components/Badge/Badge';

type CardProps = {
  className?: string;
};

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <Badge data-scamp-instance-id="inst_b0b1" />
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const CARD_CSS = `.root {
  width: 200px;
  height: 100px;
  padding: 8px;
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
    components: [
      { name: 'Badge', tsxContent: BADGE_TSX, cssContent: BADGE_CSS },
      { name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS },
    ],
    pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } },
  },
});

test('a component inside a component draws on the page with its own styles', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  const card = pageRoot(window).locator('[data-scamp-instance-id]').first();

  await expect(card.getByText('New')).toBeVisible();
  await expect(card.getByText('Nested Badge')).toHaveCount(0);
  const badgeRoot = card.getByText('New').locator('..');
  await expect(badgeRoot).toHaveCSS('background-color', 'rgb(220, 38, 38)');
  await expect(badgeRoot).toHaveCSS('width', '48px');
});

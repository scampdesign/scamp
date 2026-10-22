import { test, expect } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { componentSidebarItem, pageRoot } from '../fixtures/selectors';

/**
 * A root that follows its frame's width, with a child hanging past its
 * right edge. Sizing the frame to reach that child grew the root, which
 * pushed the child further, until React gave up with error #185 as the
 * first variant was added.
 */

const BADGE_TSX = `import styles from './Badge.module.css';

type BadgeProps = {
  className?: string;
};

export default function Badge({ className }: BadgeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <div data-scamp-id="dot_0001" className={styles.dot_0001} />
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const BADGE_CSS = `.root {
  width: calc(100% + 0px);
  height: 40px;
}

.dot_0001 {
  position: absolute;
  top: 0;
  right: -10px;
  width: 20px;
  height: 20px;
}
`;

test.use({
  projectOptions: {
    format: 'scamp',
    components: [{ name: 'Badge', tsxContent: BADGE_TSX, cssContent: BADGE_CSS }],
  },
});

test('adding a variant to a root that follows its frame settles', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await openComponentsSection(window);
  await componentSidebarItem(window, 'Badge').click();

  await window.getByTitle('Select component root').click();
  await window.getByTestId('variants-section').getByRole('button', { name: 'Add variant' }).click();

  await expect(window.getByTestId('variant-set').locator('[data-variant-cell]')).toHaveCount(2);
});

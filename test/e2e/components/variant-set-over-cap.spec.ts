import { test, expect } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { componentSidebarItem, pageRoot } from '../fixtures/selectors';

/**
 * A component edited outside Scamp with more combinations than the cap
 * (3 × 3 × 3 × 3 = 81). Drawing every one froze the renderer; past the
 * cap the set draws the default, each value, and each styled combination.
 */

const TILE_TSX = `import styles from './Tile.module.css';

type TileProps = {
  tone?: "a" | "b" | "c";
  size?: "s" | "m" | "l";
  mode?: "x" | "y" | "z";
  edge?: "p" | "q" | "r";
  className?: string;
};

export default function Tile({ tone = "a", size = "s", mode = "x", edge = "p", className }: TileProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} data-tone={tone} data-size={size} data-mode={mode} data-edge={edge}>
      <div data-scamp-id="dot_0001" className={styles.dot_0001} />
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const TILE_CSS = `.root {
  width: 40px;
  height: 40px;
}

.dot_0001 {
  width: 10px;
  height: 10px;
}

.root[data-tone="b"][data-size="m"] {
  opacity: 0.5;
}
`;

test.use({
  projectOptions: {
    format: 'scamp',
    components: [{ name: 'Tile', tsxContent: TILE_TSX, cssContent: TILE_CSS }],
  },
});

test('a set past the cap draws its authored frames and adds a picked combination', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await openComponentsSection(window);
  await componentSidebarItem(window, 'Tile').click();

  const set = window.getByTestId('variant-set');
  await expect(window.getByTestId('variant-set-notice')).toContainText('81 combinations');
  // The default, 2 values × 4 axes, and the one styled combination.
  await expect(set.locator('[data-variant-cell]')).toHaveCount(10);
  await expect(set.locator('[data-variant-cell="tone=b&size=m"]')).toBeVisible();

  await window.getByTitle('Select component root').click();
  const section = window.getByTestId('variants-section');
  await section.getByRole('radiogroup', { name: 'mode value' }).getByRole('radio', { name: 'z' }).click();
  await section.getByRole('radiogroup', { name: 'edge value' }).getByRole('radio', { name: 'q' }).click();

  const picked = set.locator('[data-variant-cell="mode=z&edge=q"]');
  await expect(picked).toHaveAttribute('data-variant-live', 'true');
  await expect(set.locator('[data-variant-cell]')).toHaveCount(11);
});

import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';

/**
 * Paint written on the <svg> tag itself — `stroke="currentColor"`, as
 * Lucide, Tabler and agents write icons — reaches the SVG section. It used
 * to show "No editable colours".
 */

const HOME_TSX = `import styles from './Home.module.css';

type HomeProps = {
  className?: string;
};

export default function Home({ className }: HomeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <svg data-scamp-id="ica_a001" className={styles.ica_a001} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" /></svg>
      <svg data-scamp-id="icb_b002" className={styles.icb_b002} viewBox="0 0 24 24" fill="none" stroke="#333333" strokeWidth="2"><path d="M4 4h16v16H4z" /></svg>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

const HOME_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  gap: 40px;
  padding: 40px;
  color: #008000;
  position: relative;
}

.ica_a001 {
  width: 48px;
  height: 48px;
}

.icb_b002 {
  width: 48px;
  height: 48px;
}
`;

test.use({ projectOptions: { format: 'scamp', pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } } } });

const selectIcon = async (page: Page, cls: string): Promise<Locator> => {
  const svg = pageRoot(page).locator(`[data-scamp-id="${cls}"]`).first();
  const box = await svg.boundingBox();
  if (box === null) throw new Error(`${cls} not on screen`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panelSection(page, 'SVG')).toBeVisible();
  return svg;
};

/** The text field of the SVG section's row with this label. */
const colorField = (page: Page, label: string): Locator =>
  panelSection(page, 'SVG')
    .locator('div', { has: page.getByText(label, { exact: true }) })
    .locator('input[type="text"]')
    .last();

test('an icon with stroke="currentColor" on its tag shows the color it inherits, and recolors', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  const svg = await selectIcon(window, 'ica_a001');

  const section = panelSection(window, 'SVG');
  await expect(section).not.toContainText('No editable colours');
  // Unset, it shows the green it inherits from the root, and says so.
  await expect(colorField(window, 'Current color')).toHaveValue(/008000/i);
  await expect(section.getByTestId('svg-color-inherited')).toBeVisible();

  await colorField(window, 'Current color').fill('#ff0000');
  await colorField(window, 'Current color').press('Enter');
  await expect.poll(() => svg.locator('path').first().evaluate((p) => getComputedStyle(p).stroke)).toBe('rgb(255, 0, 0)');
  await expect(section.getByTestId('svg-color-inherited')).toHaveCount(0);

  await waitForSaved(window);
  const { css, tsx } = await readPageFiles(project.dir, 'home');
  expect(css).toMatch(/\.ica_a001 \{[^}]*color: #ff0000;/);
  // The icon's own markup is left as the icon set wrote it.
  expect(tsx).toContain('stroke="currentColor"');
});

test('an icon with a color on its tag gets a swatch that rewrites the attribute', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  const svg = await selectIcon(window, 'icb_b002');

  await expect(colorField(window, 'Stroke')).toHaveValue(/333333/i);
  await colorField(window, 'Stroke').fill('#0000ff');
  await colorField(window, 'Stroke').press('Enter');
  await expect.poll(() => svg.locator('path').first().evaluate((p) => getComputedStyle(p).stroke)).toBe('rgb(0, 0, 255)');

  await waitForSaved(window);
  const { tsx } = await readPageFiles(project.dir, 'home');
  expect(tsx).toMatch(/data-scamp-id="icb_b002"[^>]*stroke="#0000ff"/);
});

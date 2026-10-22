import { test, expect } from '../fixtures/app';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { createComponentFromSidebar, openComponentsSection } from '../fixtures/components';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
import type { Locator, Page } from '@playwright/test';

test.use({ projectOptions: { format: 'nextjs' } });

/**
 * Designing component variants as a set, Figma's way: every combination
 * is a frame, any frame is edited in place, and the Variants section in
 * the panel holds the properties. see docs/plans/component-variants-plan.md
 */

const setOpacity = async (window: Page, percent: string): Promise<void> => {
  const input = panelSection(window, 'Visibility').locator('input').first();
  await input.click({ clickCount: 3 });
  await input.fill(percent);
  await input.press('Enter');
};

/** A frame of the variant set, by its key ('' for the default look). */
const cell = (window: Page, key: string): Locator => window.locator(`[data-variant-cell="${key}"]`);

/** The interaction layer takes the click, so click where the element is. */
const clickOn = async (window: Page, target: Locator): Promise<void> => {
  const box = await target.boundingBox();
  if (box === null) throw new Error('nothing to click');
  await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const variants = (window: Page): Locator => window.getByTestId('variants-section');

/** Select the component itself, Figma's set: its root, through the breadcrumb. */
const selectComponent = async (window: Page): Promise<void> => {
  await window.getByTitle('Select component root').click();
};

const addOutlineVariant = async (window: Page): Promise<void> => {
  await selectComponent(window);
  await variants(window).getByRole('button', { name: 'Add variant' }).click();
  const rename = variants(window).getByRole('textbox', { name: 'Value name' });
  await rename.fill('outline');
  await rename.press('Enter');
  await expect(cell(window, 'variant=outline')).toHaveAttribute('data-variant-live', 'true');
};

test.describe('components: variants', () => {
  test('an edit in a frame lands in that value only, and clicking another frame edits it in place', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createComponentFromSidebar(window, 'Card');
    const className = await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 160, y: 120 });
    await waitForSaved(window);

    await addOutlineVariant(window);
    await clickOn(window, cell(window, 'variant=outline').locator(`[data-scamp-id="${className}"]`));
    await setOpacity(window, '50');
    await waitForSaved(window);

    const { tsx, css } = await project.readComponent('Card');
    expect(tsx).toContain('variant?: "default" | "outline";');
    expect(css).toMatch(new RegExp(`\\.root\\[data-variant="outline"\\] \\.${className}\\s*\\{[^}]*opacity:\\s*0\\.5`, 's'));
    expect(css).not.toMatch(new RegExp(`^\\.${className}\\s*\\{[^}]*opacity`, 'm'));

    // Both frames are drawn side by side, each in its own look.
    const inDefault = cell(window, '').locator(`[data-scamp-id="${className}"]`);
    await expect(cell(window, 'variant=outline').locator(`[data-scamp-id="${className}"]`)).toHaveCSS('opacity', '0.5');
    await expect(inDefault).toHaveCSS('opacity', '1');

    // One click on the default frame's rectangle makes it live and selects it.
    await clickOn(window, inDefault);
    await expect(cell(window, '')).toHaveAttribute('data-variant-live', 'true');
    await expect(cell(window, 'variant=outline')).toHaveAttribute('data-variant-live', 'false');
    await expect(panelSection(window, 'Visibility')).toBeVisible();
  });

  test('removing a value removes its rules from the file', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createComponentFromSidebar(window, 'Card');
    const className = await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 160, y: 120 });
    await waitForSaved(window);

    await addOutlineVariant(window);
    await clickOn(window, cell(window, 'variant=outline').locator(`[data-scamp-id="${className}"]`));
    await setOpacity(window, '50');
    await waitForSaved(window);
    expect((await project.readComponent('Card')).css).toContain('[data-variant="outline"]');

    await selectComponent(window);
    await variants(window).getByRole('button', { name: 'Remove outline' }).click();
    await variants(window).getByRole('group', { name: 'Confirm removal' }).getByRole('button', { name: 'Remove' }).click();
    await waitForSaved(window);

    const { tsx, css } = await project.readComponent('Card');
    expect(css).not.toContain('data-variant');
    expect(tsx).toContain('variant?: "default";');
  });

  test('a frame that combines two values writes a rule for that combination', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openComponentsSection(window);
    await window.getByRole('group', { name: 'Add a starter component' }).getByRole('button', { name: 'Button', exact: true }).click();
    // Three variants by three sizes: every combination is a frame.
    await expect(window.locator('[data-variant-cell]')).toHaveCount(9);

    await clickOn(window, cell(window, 'variant=outline&size=small').locator('[data-scamp-id="label_b7e1"]'));
    await setOpacity(window, '50');
    await waitForSaved(window);

    const { css } = await project.readComponent('Button');
    expect(css).toMatch(/\.root\[data-variant="outline"\]\[data-size="small"\] \.label_b7e1\s*\{[^}]*opacity:\s*0\.5/s);
  });

  test('making a value the default moves it to the front and into the base rules', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openComponentsSection(window);
    await window.getByRole('group', { name: 'Add a starter component' }).getByRole('button', { name: 'Button', exact: true }).click();
    await selectComponent(window);

    await variants(window).getByTestId('variant-axis-variant').getByRole('radio', { name: 'outline' }).click();
    await variants(window).getByRole('button', { name: 'Make outline the default' }).click();
    await waitForSaved(window);

    const { tsx, css } = await project.readComponent('Button');
    expect(tsx).toContain('variant?: "outline" | "default" | "secondary";');
    expect(tsx).toContain('variant = "outline"');
    expect(css).toContain('.root[data-variant="default"]');
    expect(css).not.toContain('[data-variant="outline"]');
  });

  test('a starter is added under a free name', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openComponentsSection(window);
    const starters = window.getByRole('group', { name: 'Add a starter component' });
    await starters.getByRole('button', { name: 'Button', exact: true }).click();
    await expect(window.getByTestId('variant-set')).toBeVisible();
    await starters.getByRole('button', { name: 'Button', exact: true }).click();
    await expect(window.getByRole('navigation', { name: 'Component editor breadcrumb' })).toContainText('Button2');
    expect((await project.readComponent('Button2')).tsx).toContain('export default function Button2(');
  });

  test('the Variants section scrolls with the rest of the panel', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createComponentFromSidebar(window, 'Card');
    await addOutlineVariant(window);

    const scrollsWithSize = await variants(window).evaluate((section) => {
      let node = section.parentElement;
      while (node !== null && getComputedStyle(node).overflowY !== 'auto') node = node.parentElement;
      return node?.textContent?.includes('Size') ?? false;
    });
    expect(scrollsWithSize).toBe(true);
  });
});

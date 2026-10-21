import { test, expect } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
import type { Locator, Page } from '@playwright/test';

/**
 * Variant interactions: a component changes its own variant on hover or
 * click, written as CSS or as the framework's attributes. They're tried
 * in the Preview window (`/_components/<Name>`), not on the canvas. see docs/plans/component-variants-plan.md, phase 7
 */

const addStarter = async (window: Page, name: string): Promise<void> => {
  await openComponentsSection(window);
  await window.getByRole('group', { name: 'Add a starter component' }).getByRole('button', { name, exact: true }).click();
  await expect(window.getByRole('navigation', { name: 'Component editor breadcrumb' })).toContainText(name);
  await window.getByTitle('Select component root').click();
};

const interactions = (window: Page): Locator => window.getByTestId('variant-interactions');
const panel = (window: Page): Locator => window.getByRole('dialog', { name: 'New interaction' });

/** The frame being edited, which a new interaction starts from: its value's chip. */
const editFrame = async (window: Page, value: string): Promise<void> => {
  await window.getByTestId('variants-section').getByRole('radio', { name: value, exact: true }).click();
};

/** Open the panel from the header's +, pick a trigger, (an element,) and the value to change to, then Add. Its lists are in that order. */
const addInteraction = async (
  window: Page,
  picks: { trigger: string; on?: string; to: string }
): Promise<void> => {
  await interactions(window).getByRole('button', { name: 'Add interaction' }).click();
  const selects = panel(window).locator('select');
  await selects.first().selectOption({ label: picks.trigger });
  if (picks.on !== undefined) await selects.nth(1).selectOption({ label: picks.on });
  await selects.last().selectOption({ label: picks.to });
  await panel(window).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(panel(window)).toBeHidden();
};

test.describe('components: variant interactions', () => {
  test.describe('in a Next.js project', () => {
    test.use({ projectOptions: { format: 'nextjs' } });

    test('a hover interaction from the edited frame writes a second selector, shown as one line', async ({ window, project }) => {
      await expect(pageRoot(window)).toBeVisible();
      await addStarter(window, 'Button');
      // Only CSS triggers outside the framework.
      await interactions(window).getByRole('button', { name: 'Add interaction' }).click();
      const triggers = await panel(window).locator('select').first().locator('option').allTextContents();
      expect(triggers).toEqual(['While hovering', 'While pressing', 'While focused']);
      // Escape would also leave the component editor; + closes the panel too.
      await interactions(window).getByRole('button', { name: 'Add interaction' }).click();
      await expect(panel(window)).toBeHidden();

      await addInteraction(window, { trigger: 'While hovering', to: 'variant: outline' });
      await waitForSaved(window);
      const { css } = await project.readComponent('Button');
      expect(css).toContain('.root[data-variant="outline"],\n.root[data-variant="default"]:hover {');
      const row = interactions(window).getByRole('listitem');
      await expect(row).toHaveText('While hovering · default → outline');
      // One line, however narrow the panel.
      const box = await row.boundingBox();
      expect(box?.height ?? 0).toBeLessThan(30);
    });
  });

  test.describe('in a Scamp framework project', () => {
    test.use({ projectOptions: { format: 'scamp' } });

    test('a click opens a menu and a click outside closes it, as attributes the framework reads', async ({ window, project }) => {
      await expect(pageRoot(window)).toBeVisible();
      await addStarter(window, 'Menu');
      // The starter brings its own; start from none.
      const remove = interactions(window).getByRole('button', { name: /^Remove / });
      while ((await remove.count()) > 0) await remove.first().click();

      await addInteraction(window, { trigger: 'On click', on: 'trigger_e51a', to: 'open' });
      await editFrame(window, 'open');
      await addInteraction(window, { trigger: 'On click', on: 'trigger_e51a', to: 'closed' });
      await addInteraction(window, { trigger: 'On click outside', to: 'closed' });
      await waitForSaved(window);

      const { tsx } = await project.readComponent('Menu');
      expect(tsx).toContain('data-scamp-click="state:closed=open,open=closed"');
      expect(tsx).toContain('data-scamp-outside="state:open=closed"');
      await expect(interactions(window).getByRole('listitem')).toHaveCount(3);
    });
  });
});

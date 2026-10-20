import { test, expect } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * Variant interactions: a component changes its own variant on hover or
 * click, written as CSS or as the framework's attributes. They're tried
 * in the Preview window (`/_components/<Name>`), not on the canvas. see docs/plans/component-variants-plan.md, phase 7
 */
const addStarter = async (window, name) => {
    await openComponentsSection(window);
    await window.getByRole('group', { name: 'Add a starter component' }).getByRole('button', { name, exact: true }).click();
    await expect(window.getByTestId('component-editor-banner')).toContainText(name);
    await window.getByTitle('Select component root').click();
};
const interactions = (window) => window.getByTestId('variant-interactions');
/** Fill the new-interaction form: its lists in order are trigger, (property,) from, to, (element). */
const addInteraction = async (window, picks) => {
    await interactions(window).getByRole('button', { name: '+ Add interaction' }).click();
    const form = interactions(window).getByRole('group', { name: 'New interaction' });
    const selects = form.locator('select');
    for (const [i, label] of picks.entries())
        await selects.nth(i).selectOption({ label });
    await form.getByRole('button', { name: 'Add' }).click();
};
test.describe('components: variant interactions', () => {
    test.describe('in a Next.js project', () => {
        test.use({ projectOptions: { format: 'nextjs' } });
        test('a hover interaction writes a second selector, and Try shows the hover look', async ({ window, project }) => {
            await expect(pageRoot(window)).toBeVisible();
            await addStarter(window, 'Button');
            // Only CSS triggers outside the framework.
            await interactions(window).getByRole('button', { name: '+ Add interaction' }).click();
            const triggers = await interactions(window).locator('select').first().locator('option').allTextContents();
            expect(triggers).toEqual(['While hovering', 'While pressing', 'While focused']);
            await interactions(window).getByRole('button', { name: 'Cancel' }).click();
            await addInteraction(window, ['While hovering', 'variant', 'From default', 'Change to outline']);
            await waitForSaved(window);
            const { css } = await project.readComponent('Button');
            expect(css).toContain('.root[data-variant="outline"],\n.root[data-variant="default"]:hover {');
            await expect(interactions(window)).toContainText('While hovering: variant default → outline');
        });
    });
    test.describe('in a Scamp framework project', () => {
        test.use({ projectOptions: { format: 'scamp' } });
        test('a click opens a menu and a click outside closes it, as attributes the framework reads', async ({ window, project }) => {
            await expect(pageRoot(window)).toBeVisible();
            await addStarter(window, 'Menu');
            await addInteraction(window, ['On click', 'From closed', 'Change to open', 'On trigger_e51a']);
            await addInteraction(window, ['On click', 'From open', 'Change to closed', 'On trigger_e51a']);
            await addInteraction(window, ['On click outside', 'From open', 'Change to closed']);
            await waitForSaved(window);
            const { tsx } = await project.readComponent('Menu');
            expect(tsx).toContain('data-scamp-click="state:closed=open,open=closed"');
            expect(tsx).toContain('data-scamp-outside="state:open=closed"');
        });
    });
});

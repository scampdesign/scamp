import { test, expect } from '../fixtures/app';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { createComponentFromSidebar } from '../fixtures/components';
import { canvasFrame, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
test.use({ projectOptions: { format: 'nextjs' } });
/**
 * Designing component variants: the variant bar above the artboard, the
 * edits routed into the selected value, and the read-only frames beside
 * it. see docs/plans/component-variants-plan.md
 */
const setOpacity = async (window, percent) => {
    const input = panelSection(window, 'Visibility').locator('input').first();
    await input.click({ clickCount: 3 });
    await input.fill(percent);
    await input.press('Enter');
};
const addOutlineVariant = async (window) => {
    const bar = window.getByTestId('variant-bar');
    await bar.getByRole('button', { name: '+ Add variant' }).click();
    const rename = bar.getByRole('textbox', { name: 'Value name' });
    await rename.fill('outline');
    await rename.press('Enter');
    await expect(bar.getByRole('radio', { name: 'outline' })).toHaveAttribute('aria-checked', 'true');
};
test.describe('components: variants', () => {
    test('an edit in a value lands in that value only, and the files carry it', async ({ window, project }) => {
        await expect(pageRoot(window)).toBeVisible();
        await createComponentFromSidebar(window, 'Card');
        const className = await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 160, y: 120 });
        await waitForSaved(window);
        await addOutlineVariant(window);
        await setOpacity(window, '50');
        await waitForSaved(window);
        const { tsx, css } = await project.readComponent('Card');
        expect(tsx).toContain('variant?: "default" | "outline";');
        expect(tsx).toContain('data-variant={variant}');
        expect(css).toMatch(new RegExp(`\\.root\\[data-variant="outline"\\] \\.${className}\\s*\\{[^}]*opacity:\\s*0\\.5`, 's'));
        expect(css).not.toMatch(new RegExp(`^\\.${className}\\s*\\{[^}]*opacity`, 'm'));
        // The live frame draws outline; the base look is drawn read-only beside it.
        const live = canvasFrame(window).locator(`[data-scamp-id="${className}"]`);
        const baseFrame = window.locator('[data-variant-frame="base"]');
        await expect(live).toHaveCSS('opacity', '0.5');
        await expect(baseFrame.locator(`[data-scamp-id="${className}"]`)).toHaveCSS('opacity', '1');
        // Clicking the base frame edits the base, and outline moves beside it.
        await baseFrame.click();
        const bar = window.getByTestId('variant-bar');
        await expect(bar.getByRole('radio', { name: 'default' })).toHaveAttribute('aria-checked', 'true');
        await expect(live).toHaveCSS('opacity', '1');
        await expect(window.locator('[data-variant-frame="variant=outline"]')).toBeVisible();
    });
    test('removing a value removes its rules from the file', async ({ window, project }) => {
        await expect(pageRoot(window)).toBeVisible();
        await createComponentFromSidebar(window, 'Card');
        await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 160, y: 120 });
        await waitForSaved(window);
        await addOutlineVariant(window);
        await setOpacity(window, '50');
        await waitForSaved(window);
        expect((await project.readComponent('Card')).css).toContain('[data-variant="outline"]');
        const bar = window.getByTestId('variant-bar');
        await bar.getByRole('button', { name: 'Remove outline' }).click();
        await bar.getByRole('group', { name: 'Confirm removal' }).getByRole('button', { name: 'Remove' }).click();
        await waitForSaved(window);
        const { tsx, css } = await project.readComponent('Card');
        expect(css).not.toContain('data-variant');
        expect(tsx).toContain('variant?: "default";');
        await expect(bar.getByRole('radio', { name: 'default' })).toHaveAttribute('aria-checked', 'true');
    });
});

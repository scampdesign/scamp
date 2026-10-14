import { test, expect } from '../fixtures/app';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

/**
 * The container-side flex controls added by docs/archive/2026-09-04-flex-controls-plan.md:
 * Wrap, the Reverse toggle, and Align content. Each writes the real CSS
 * property to the page's module.
 */
test.describe('properties panel: flex wrap and reverse', () => {
  const setFlexRow = async (
    window: Parameters<typeof pageRoot>[0]
  ): Promise<string> => {
    await expect(pageRoot(window)).toBeVisible();
    const className = await drawAndSelectRect(
      window,
      { x: 100, y: 100 },
      { x: 300, y: 220 }
    );
    await waitForSaved(window);
    await panelSection(window, 'Layout')
      .getByRole('radio', { name: 'Flex row' })
      .click();
    await waitForSaved(window);
    return className;
  };

  test('Wrap writes flex-wrap and reveals Align content', async ({ window, project }) => {
    const className = await setFlexRow(window);
    const layout = panelSection(window, 'Layout');

    // `exact`: 'Wrap' is also a substring of 'No wrap' and 'Wrap reverse'.
    await layout.getByRole('radio', { name: 'Wrap', exact: true }).click();
    await waitForSaved(window);

    const { css } = await readPageFiles(project.dir, project.pageName);
    expect(css).toMatch(new RegExp(`\\.${className}[^}]*flex-wrap:\\s*wrap`, 's'));
    // Only meaningful with more than one line, so it appears with Wrap.
    // `normal` is align-content's own initial value — no other select in
    // the section offers it.
    await expect(layout.locator('select:has(option[value="normal"])')).toBeVisible();
  });

  test('Reverse writes row-reverse and restores on a second click', async ({ window, project }) => {
    const className = await setFlexRow(window);
    const reverse = panelSection(window, 'Layout').getByRole('button', {
      name: 'Reverse direction',
    });

    await reverse.click();
    await waitForSaved(window);
    let files = await readPageFiles(project.dir, project.pageName);
    expect(files.css).toMatch(
      new RegExp(`\\.${className}[^}]*flex-direction:\\s*row-reverse`, 's')
    );
    await expect(reverse).toHaveAttribute('aria-pressed', 'true');

    await reverse.click();
    await waitForSaved(window);
    files = await readPageFiles(project.dir, project.pageName);
    expect(files.css).not.toMatch(/row-reverse/);
  });
});

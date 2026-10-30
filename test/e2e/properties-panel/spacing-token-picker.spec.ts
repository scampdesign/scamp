import { promises as fs } from 'fs';
import * as path from 'path';

import { test, expect } from '../fixtures/app';
import { commitInput, drawAndSelectRect, panelInputByPrefix, panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

const writeThemeCss = async (
  projectDir: string,
  themeCss: string
): Promise<void> => {
  await fs.writeFile(path.join(projectDir, 'theme.css'), themeCss, 'utf-8');
};

test.describe('properties panel: spacing token picker', () => {
  test('picker icon applies a length token to all four sides of padding', async ({
    window,
    project,
  }) => {
    // Seed theme.css with a spacing token before mounting the panel.
    await writeThemeCss(
      project.dir,
      `:root {\n  --color-text: #111;\n  --space-md: 16px;\n}\n`
    );

    await expect(pageRoot(window)).toBeVisible();
    const className = await drawAndSelectRect(
      window,
      { x: 100, y: 100 },
      { x: 260, y: 200 }
    );
    await waitForSaved(window);

    // Wait for theme tokens to surface — the renderer polls theme.css
    // on project open. A short visible-element wait covers it.
    const paddingInput = panelInputByPrefix(window, 'Spacing', 'Padding');
    await expect(paddingInput).toBeVisible();

    // Open the picker — the icon button is the only "Pick P token"
    // labeled button inside the Spacing section.
    const pickerButton = panelSection(window, 'Spacing').getByRole('button', {
      name: 'Pick Padding token',
    });
    await pickerButton.click();

    // Pick the --space-md token.
    const tokenRow = window.getByRole('option', { name: /--space-md/ });
    await expect(tokenRow).toBeVisible();
    await tokenRow.click();

    await waitForSaved(window);

    // Field shows the var() in the shorthand input.
    await expect(paddingInput).toHaveValue('var(--space-md)');

    // The tooltip names the token and the value it applies.
    await paddingInput.hover();
    await expect(window.getByRole('tooltip')).toContainText('--space-md: 16px');

    // File on disk has the var() value emitted into padding.
    const { css } = await readPageFiles(project.dir, project.pageName);
    expect(css).toMatch(
      new RegExp(`\\.${className}[^}]*padding:\\s*var\\(--space-md\\)`, 's')
    );
  });

  test('typed px value then token swap preserves token form', async ({
    window,
    project,
  }) => {
    await writeThemeCss(
      project.dir,
      `:root {\n  --color-text: #111;\n  --space-sm: 8px;\n  --space-md: 16px;\n}\n`
    );

    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(
      window,
      { x: 100, y: 100 },
      { x: 260, y: 200 }
    );
    await waitForSaved(window);

    // First type a px value via the input.
    const paddingInput = panelInputByPrefix(window, 'Spacing', 'Padding');
    await commitInput(paddingInput, '12');
    await waitForSaved(window);
    await expect(paddingInput).toHaveValue('12px');

    // Then swap to a token via the picker — should replace cleanly.
    const pickerButton = panelSection(window, 'Spacing').getByRole('button', {
      name: 'Pick Padding token',
    });
    await pickerButton.click();
    await window.getByRole('option', { name: /--space-sm/ }).click();
    await waitForSaved(window);
    await expect(paddingInput).toHaveValue('var(--space-sm)');
  });

  test('empty token list shows the Add token button', async ({
    window,
    project,
  }) => {
    // Seed a theme with NO length tokens (the default scaffold now ships
    // a type scale) so the picker surfaces its empty state with an
    // "Add token" action.
    await writeThemeCss(project.dir, `:root {\n  --color-text: #111;\n}\n`);

    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(
      window,
      { x: 100, y: 100 },
      { x: 260, y: 200 }
    );
    await waitForSaved(window);

    const pickerButton = panelSection(window, 'Spacing').getByRole('button', {
      name: 'Pick Padding token',
    });
    await pickerButton.click();
    await expect(window.getByText('No spacing tokens yet.')).toBeVisible();
    await expect(window.getByRole('button', { name: '+ Add token' })).toBeVisible();
  });
});

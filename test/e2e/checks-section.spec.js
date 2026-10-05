import { test, expect } from './fixtures/app';
import { panelSection } from './fixtures/panel';
import { pageRoot } from './fixtures/selectors';
/**
 * The Checks section: what the open view got wrong, where the person who
 * has to fix it can see it.
 *
 * `lintView` had no human-facing surface at all — reachable only through
 * the MCP snapshot, so an agent could ask and a person could not. A
 * reviewed project carried 6,339 undeclared tokens across 60 screens
 * with nothing anywhere saying so, and every colour in it resolved to
 * nothing. see docs/notes/agent-authored-views-review.md
 */
const CLEAN_TSX = [
    "import styles from './home.module.css';",
    '',
    'export default function Home() {',
    '  return (',
    '    <div data-scamp-id="root" className={styles.root}>',
    '      <div data-scamp-id="card_a1b2" className={styles.card_a1b2}></div>',
    '    </div>',
    '  );',
    '}',
    '',
].join('\n');
const cssWith = (background) => [
    '.root {',
    '  width: 100%;',
    '  min-height: 100vh;',
    '}',
    '',
    '.card_a1b2 {',
    '  width: 200px;',
    '  height: 100px;',
    `  background: ${background};`,
    '}',
    '',
].join('\n');
test.describe('a view with an undeclared token', () => {
    // Exactly the shape that made those 60 screens monochrome.
    test.use({
        projectOptions: {
            format: 'legacy',
            pageContent: {
                home: { tsx: CLEAN_TSX, css: cssWith('var(--nowhere-declared)') },
            },
        },
    });
    test('is reported where a person can see it', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Nothing selected: the panel is showing the view, not an element.
        const checks = panelSection(window, 'Checks');
        await expect(checks).toBeVisible();
        await expect(checks).toContainText('Tokens this project never declares');
        await expect(checks).toContainText('--nowhere-declared');
    });
    test('selects the element when a finding is clicked', async ({ window }) => {
        // The finding names a class; clicking it has to take you there, or
        // a list of class names is just another thing to search for.
        await expect(pageRoot(window)).toBeVisible();
        // The hint and the finding row both name the token; the row is the
        // one that is a button.
        await panelSection(window, 'Checks')
            .getByRole('button', { name: /--nowhere-declared/ })
            .first()
            .click();
        // The panel leaves its empty (view-level) mode, which is what
        // "an element is now selected" looks like from outside.
        await expect(window.locator('[data-testid="properties-panel"]')).not.toHaveAttribute('data-panel-mode', 'empty');
        await expect(window.locator('[data-scamp-id="card_a1b2"]')).toHaveClass(/selected/);
    });
});
test.describe('a view with nothing wrong', () => {
    // The control. Without it the tests above pass for a section that is
    // ALWAYS on screen, which would make it chrome nobody reads on the
    // day it finally has something to say.
    test.use({
        projectOptions: {
            format: 'legacy',
            pageContent: { home: { tsx: CLEAN_TSX, css: cssWith('#ff0000') } },
        },
    });
    test('gets no Checks section at all', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(window.locator('[data-testid="properties-panel"]')).toBeVisible();
        await expect(window.locator('[data-testid="checks-section"]')).toHaveCount(0);
    });
});

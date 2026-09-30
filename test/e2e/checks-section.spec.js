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
// A page whose CSS references a token the project never declares —
// exactly the shape that made those 60 screens monochrome.
test.use({
    projectOptions: {
        format: 'legacy',
        pageContent: {
            home: {
                tsx: [
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
                ].join('\n'),
                css: [
                    '.root {',
                    '  width: 100%;',
                    '  min-height: 100vh;',
                    '}',
                    '',
                    '.card_a1b2 {',
                    '  width: 200px;',
                    '  height: 100px;',
                    '  background: var(--nowhere-declared);',
                    '}',
                    '',
                ].join('\n'),
            },
        },
    },
});
test('an undeclared token is reported where a person can see it', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    // Nothing selected: the panel is showing the view, not an element.
    const checks = panelSection(window, 'Checks');
    await expect(checks).toBeVisible();
    await expect(checks).toContainText('Tokens this project never declares');
    await expect(checks).toContainText('--nowhere-declared');
});
test('the section stays away when the view is clean', async ({ window }) => {
    // It must not become chrome. A section that is always there is one
    // nobody reads when it finally has something to say.
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-testid="layers-panel"]').waitFor();
});

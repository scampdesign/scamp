import { test, expect } from '../../fixtures/app';
import { clickContextMenuItem, openComponentContextMenu, openComponentsSection, openPagesSection, } from '../../fixtures/components';
import { componentSidebarItem, pageRoot, saveStatus, } from '../../fixtures/selectors';
import { waitForSaved } from '../../fixtures/assertions';
import { drawAndSelectRect } from '../../fixtures/panel';
const BUTTON_TSX = `import styles from './Button.module.css';

export default function Button() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_a1b2" className={styles.text_a1b2}>Click me</p>
    </div>
  );
}
`;
const HOME_TSX_WITH_BUTTON = `import styles from './page.module.css';
import Button from '@/components/Button/Button';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Button data-scamp-instance-id="inst_b2c3" />
    </div>
  );
}
`;
const HOME_CSS = `.root {
}
`;
test.use({
    projectOptions: {
        format: 'nextjs',
        components: [{ name: 'Button', tsxContent: BUTTON_TSX }],
        pageContent: {
            home: { tsx: HOME_TSX_WITH_BUTTON, css: HOME_CSS },
        },
    },
});
// The icon rail defaults to Pages; these tests read the Components
// sidebar list, so activate that section first.
test.beforeEach(async ({ window }) => {
    await openComponentsSection(window);
});
test.describe('components sidebar — rename component', () => {
    test('renames the folder + flips function/type names + updates page imports', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(componentSidebarItem(window, 'Button')).toBeVisible();
        // Right-click → Rename… → type new name → Enter.
        // Use a name with an explicit boundary so suggestComponentName's
        // chunk-and-capitalise round-trips to PascalCase. Single-word
        // input would lowercase to "Newname" instead of "NewName".
        await openComponentContextMenu(window, 'Button');
        await clickContextMenuItem(window, 'Rename…');
        const input = window.getByPlaceholder('ComponentName');
        await input.fill('primary-button');
        await input.press('Enter');
        // Old name gone from sidebar, new name present.
        await expect(componentSidebarItem(window, 'PrimaryButton')).toBeVisible();
        await expect(componentSidebarItem(window, 'Button')).toBeHidden();
        // Old folder gone, new folder present.
        expect(await project.componentExists('Button')).toBe(false);
        expect(await project.componentExists('PrimaryButton')).toBe(true);
        // Component file's function + type names flipped.
        const { tsx: compTsx } = await project.readComponent('PrimaryButton');
        expect(compTsx).toContain('export default function PrimaryButton(');
        expect(compTsx).toContain("import styles from './PrimaryButton.module.css';");
        expect(compTsx).not.toContain('function Button(');
        // Home page's import + JSX tag flipped.
        const { tsx: homeTsx } = await project.readPage('home');
        expect(homeTsx).toContain("import PrimaryButton from '@/components/PrimaryButton/PrimaryButton';");
        expect(homeTsx).toContain('<PrimaryButton');
        expect(homeTsx).not.toContain("from '@/components/Button/Button'");
        expect(homeTsx).not.toContain('<Button');
    });
    test('keeps edits made to the page since it opened', async ({ window, project }) => {
        // Audit item 18: the page was rewritten from the copy read when the
        // project opened, so a rect drawn since vanished from disk.
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        await drawAndSelectRect(window, { x: 200, y: 200 }, { x: 300, y: 280 });
        await waitForSaved(window);
        expect((await project.readPage('home')).tsx).toMatch(/data-scamp-id="rect_/);
        await openComponentsSection(window);
        await openComponentContextMenu(window, 'Button');
        await clickContextMenuItem(window, 'Rename…');
        const input = window.getByPlaceholder('ComponentName');
        await input.fill('primary-button');
        await input.press('Enter');
        await expect(componentSidebarItem(window, 'PrimaryButton')).toBeVisible();
        const { tsx } = await project.readPage('home');
        expect(tsx).toContain('<PrimaryButton');
        expect(tsx).toMatch(/data-scamp-id="rect_/);
    });
    test('no "Save failed" surfaces during rename (target-swap + pending-write regressions)', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(componentSidebarItem(window, 'Button')).toBeVisible();
        // Open the component so the swap path matters (rename triggers a
        // target swap from component → component-with-new-path).
        await componentSidebarItem(window, 'Button').click();
        await waitForSaved(window);
        await openComponentContextMenu(window, 'Button');
        await clickContextMenuItem(window, 'Rename…');
        const input = window.getByPlaceholder('ComponentName');
        await input.fill('new-name');
        await input.press('Enter');
        // After the rename completes, the indicator must NOT land on error.
        await expect(componentSidebarItem(window, 'NewName')).toBeVisible();
        // Give the save-status indicator a beat to settle to 'saved' or
        // 'unsaved' — never 'error'.
        await expect(saveStatus(window)).not.toHaveAttribute('data-status', 'error', { timeout: 5_000 });
    });
});

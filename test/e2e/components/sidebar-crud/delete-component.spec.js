import { test, expect } from '../../fixtures/app';
import { clickContextMenuItem, confirmDialog, openComponentContextMenu, openComponentsSection, openPagesSection, waitForConfirmDialog, } from '../../fixtures/components';
import { componentSidebarItem, pageRoot, saveStatus, } from '../../fixtures/selectors';
import { waitForSaved } from '../../fixtures/assertions';
import { drawAndSelectRect } from '../../fixtures/panel';
// A page that already imports + uses a Button instance.
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
const BUTTON_TSX = `import styles from './Button.module.css';

export default function Button() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_a1b2" className={styles.text_a1b2}>Click me</p>
    </div>
  );
}
`;
const BUTTON_CSS = `.root {
}

.text_a1b2 {
  font-size: 14px;
}
`;
// First describe block uses a seeded home with Button instance. The
// second uses the default empty scaffold (Button exists but home
// doesn't reference it).
// The icon rail defaults to Pages; these tests read the Components
// sidebar list, so activate that section first.
test.beforeEach(async ({ window }) => {
    await openComponentsSection(window);
});
test.describe('delete: page references the component', () => {
    test.use({
        projectOptions: {
            format: 'nextjs',
            components: [
                { name: 'Button', tsxContent: BUTTON_TSX, cssContent: BUTTON_CSS },
            ],
            pageContent: { home: { tsx: HOME_TSX_WITH_BUTTON, css: HOME_CSS } },
        },
    });
    test('removes the folder AND strips instances from referencing pages', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(componentSidebarItem(window, 'Button')).toBeVisible();
        // Right-click the sidebar row → Delete component… → confirm.
        await openComponentContextMenu(window, 'Button');
        await clickContextMenuItem(window, 'Delete component…');
        await waitForConfirmDialog(window, /Delete component "Button"/);
        await confirmDialog(window, /Delete component/);
        // Sidebar row gone.
        await expect(componentSidebarItem(window, 'Button')).toBeHidden();
        // Folder gone from disk.
        expect(await project.componentExists('Button')).toBe(false);
        // Home page no longer references Button.
        const { tsx: homeTsx } = await project.readPage('home');
        expect(homeTsx).not.toContain('<Button');
        expect(homeTsx).not.toContain("from '@/components/Button/Button'");
        // No "Save failed" indicator surfaces from the multi-file ops.
        await expect(saveStatus(window)).not.toHaveAttribute('data-status', 'error');
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
        await clickContextMenuItem(window, 'Delete component…');
        await waitForConfirmDialog(window, /Delete component "Button"/);
        await confirmDialog(window, /Delete component/);
        await expect(componentSidebarItem(window, 'Button')).toBeHidden();
        const { tsx } = await project.readPage('home');
        expect(tsx).not.toContain('<Button');
        expect(tsx).toMatch(/data-scamp-id="rect_/);
    });
});
test.describe('delete: no page references the component', () => {
    test.use({
        projectOptions: {
            format: 'nextjs',
            components: [
                { name: 'Button', tsxContent: BUTTON_TSX, cssContent: BUTTON_CSS },
            ],
        },
    });
    test('leaves pages without an instance untouched on disk', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await expect(componentSidebarItem(window, 'Button')).toBeVisible();
        // Wait for the open-time format-migration write to land so the
        // "before" snapshot is canonical, not pre-canonicalised scaffold.
        await waitForSaved(window);
        const homeBefore = await project.readPage('home');
        await openComponentContextMenu(window, 'Button');
        await clickContextMenuItem(window, 'Delete component…');
        await waitForConfirmDialog(window, /Delete component "Button"/);
        await confirmDialog(window, /Delete component/);
        expect(await project.componentExists('Button')).toBe(false);
        const homeAfter = await project.readPage('home');
        expect(homeAfter.tsx).toBe(homeBefore.tsx);
        expect(homeAfter.css).toBe(homeBefore.css);
    });
});

import { test, expect } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * Regression for the "design from one page loads into another"
 * bug. Root cause: `writeIfDirty` in `syncBridge.ts` used to read
 * `pageCustomMediaBlocks` / `pageKeyframesBlocks` from the current
 * store at flush time. The page-switch flush fires AFTER `loadPage(B)`
 * has swapped those values, so A's flush would write A's elements
 * paired with B's `@media` blocks into A's CSS file. The next
 * navigation back to A would then trip the write-conflict path and
 * `onWriteConflict` would `reloadElements` against the wrong target,
 * presenting one page's design under another page's breadcrumb.
 *
 * Seeds two pages with distinct custom `@media` blocks (widths that
 * don't match any default breakpoint, so they land in
 * `customMediaBlocks` and round-trip verbatim), edits one, navigates
 * away, and asserts neither file got the other's custom CSS.
 */
const HOME_CSS = `.root {
  width: 100%;
  min-height: 900px;
  background: #fff;
}

@media (max-width: 999px) {
  .marker_home {
    color: red;
  }
}
`;
const ABOUT_CSS = `.root {
  width: 100%;
  min-height: 900px;
  background: #fff;
}

@media (max-width: 888px) {
  .marker_about {
    color: blue;
  }
}
`;
test.use({
    projectOptions: {
        extraPages: ['about'],
        pageContent: {
            home: { css: HOME_CSS },
            about: { css: ABOUT_CSS },
        },
    },
});
/** Click a page name in the sidebar's Pages list. Scoped so we don't
 *  collide with breadcrumb / layers panel buttons that share the text. */
const navigateToPage = async (page, name) => {
    await page
        .getByTestId('pages-list')
        .getByRole('button', { name, exact: true })
        .click();
};
test.describe('sync: per-page custom @media isolation across fast navigation', () => {
    test("the outgoing page's flush uses its own custom CSS, not the incoming page's", async ({ window, project }) => {
        await expect(pageRoot(window)).toBeVisible();
        // The page list is sorted alphabetically, so 'about' is the
        // default initial page. Navigate to home first so the
        // outgoing-page flush we exercise fires home → about, not
        // about → about (no-op).
        await navigateToPage(window, 'home');
        await waitForSaved(window);
        // Canvas edit on home — queues a debounced write.
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
        // Navigate to About IMMEDIATELY — before the 200ms debounce
        // can fire its own flush. The target-change branch in
        // syncBridge runs synchronously after `loadPage(about)`,
        // which is the path that used to read the wrong page's
        // custom CSS out of the store.
        await navigateToPage(window, 'about');
        await waitForSaved(window);
        // Home's CSS still has home's @media block at its own
        // width, NOT about's @media block. (The primary
        // invariant — this is what the fix guarantees.)
        const home = await project.readPage('home');
        expect(home.css).toContain('@media (max-width: 999px)');
        expect(home.css).toContain('.marker_home');
        expect(home.css).not.toContain('@media (max-width: 888px)');
        expect(home.css).not.toContain('.marker_about');
        // About wasn't edited — its file should be untouched and
        // still hold its own custom @media block.
        const about = await project.readPage('about');
        expect(about.css).toContain('@media (max-width: 888px)');
        expect(about.css).toContain('.marker_about');
        expect(about.css).not.toContain('@media (max-width: 999px)');
        expect(about.css).not.toContain('.marker_home');
        // About never got home's rect — the misroute would have
        // landed it here.
        expect(about.css).not.toMatch(/\.rect_[a-z0-9]+\s*\{/);
    });
    test('repeated A → B → A navigation does not clobber either page', async ({ window, project }) => {
        await expect(pageRoot(window)).toBeVisible();
        await navigateToPage(window, 'home');
        await waitForSaved(window);
        // Edit on home, switch to about.
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 200, y: 180 });
        await navigateToPage(window, 'about');
        await waitForSaved(window);
        // Edit on about, switch back to home.
        await drawAndSelectRect(window, { x: 250, y: 250 }, { x: 350, y: 330 });
        await navigateToPage(window, 'home');
        await waitForSaved(window);
        // Edit on home again, switch to about.
        await drawAndSelectRect(window, { x: 400, y: 100 }, { x: 500, y: 180 });
        await navigateToPage(window, 'about');
        await waitForSaved(window);
        // Neither file leaked the other's custom @media.
        const home = await project.readPage('home');
        const about = await project.readPage('about');
        expect(home.css).toContain('@media (max-width: 999px)');
        expect(home.css).not.toContain('@media (max-width: 888px)');
        expect(home.css).not.toContain('.marker_about');
        expect(about.css).toContain('@media (max-width: 888px)');
        expect(about.css).not.toContain('@media (max-width: 999px)');
        expect(about.css).not.toContain('.marker_home');
    });
});

import { test, expect } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * History is per-page: each page maintains its own independent
 * undo stack, and switching pages does NOT clear it. Switching
 * back to a page restores its history exactly where the user left
 * off. This spec confirms both halves of that contract.
 *
 * (This used to be a "clears-on-page-switch" spec — the old
 * zundo-based stack was global and got wiped on every page load.
 * The visual-history panel replaced that with per-page buckets
 * keyed by tsxPath.)
 */
test.describe('history: persists across page switches', () => {
    test("Cmd+Z on a fresh page does not affect the other page's history", async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
        await waitForSaved(window);
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
        // Add a second page and switch to it.
        await window.getByRole('button', { name: 'Add page', exact: true }).click();
        const nameInput = window.getByPlaceholder('page-name');
        await nameInput.fill('about');
        await nameInput.press('Enter');
        // About loads with only a root element — no rects.
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0);
        // Cmd+Z on About — About has no history yet, so this is a
        // no-op. Crucially, it does NOT reach into home's history and
        // restore something from there.
        await window.keyboard.press('ControlOrMeta+z');
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0);
    });
    test('switching back to a page restores its undoable history', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Home: draw a rect (one history entry on home's stack).
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
        await waitForSaved(window);
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
        // Create About and switch to it.
        await window.getByRole('button', { name: 'Add page', exact: true }).click();
        const nameInput = window.getByPlaceholder('page-name');
        await nameInput.fill('about');
        await nameInput.press('Enter');
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0);
        // Switch back to home — the rect is still there.
        await window.getByRole('button', { name: 'home' }).click();
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
        // home's history bucket survived the round-trip — Cmd+Z
        // undoes the draw and the rect disappears.
        await window.keyboard.press('ControlOrMeta+z');
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0);
    });
});

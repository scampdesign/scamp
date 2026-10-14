import { test, expect } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import {
  canvasElementsByPrefix,
  layersRow,
  pageRoot,
} from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

/**
 * The History tab shows a unified timeline: PERSISTENT project snapshots
 * (stored under `.scamp/`) interleaved with the active page's in-memory
 * undo entries for per-edit granularity. The panel has a "Now" marker and
 * a "Save snapshot" action; clicking a snapshot opens a read-only PREVIEW
 * on the canvas (banner with Restore / Exit), while clicking an undo entry
 * jumps the canvas to that point in-session. The Cmd+Z / Cmd+Shift+Z
 * keyboard path is covered by the undo-redo specs. See
 * docs/notes/snapshots.md.
 */
test.describe('history panel — snapshots', () => {
  test('shows the Now marker and a Save snapshot action', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-section="history"]').click();
    await expect(window.getByText('Now', { exact: true })).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Save snapshot' })
    ).toBeVisible();
  });

  test('saving a manual snapshot adds a named entry', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-section="history"]').click();

    await window.getByRole('button', { name: 'Save snapshot' }).click();
    const input = window.getByPlaceholder('Snapshot name (optional)');
    await input.fill('before refactor');
    await input.press('Enter');

    await expect(window.getByText('before refactor')).toBeVisible();
  });

  /** Draw one rect, snapshot it as "one rect", then draw a second. */
  const oneRectSnapshotThenTwo = async (
    window: import('@playwright/test').Page
  ): Promise<void> => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 180, y: 160 });
    await waitForSaved(window);
    await window.locator('[data-section="history"]').click();
    await window.getByRole('button', { name: 'Save snapshot' }).click();
    const input = window.getByPlaceholder('Snapshot name (optional)');
    await input.fill('one rect');
    await input.press('Enter');
    await expect(window.getByText('one rect')).toBeVisible();

    await window.locator('[data-section="pages"]').click();
    await drawAndSelectRect(window, { x: 220, y: 80 }, { x: 320, y: 160 });
    await waitForSaved(window);
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(2);
  };

  test('clicking a snapshot previews it read-only on the canvas', async ({
    window,
  }) => {
    await oneRectSnapshotThenTwo(window);

    // Click the snapshot → enter preview. The banner appears and the
    // canvas shows the snapshot's single rectangle, WITHOUT restoring.
    await window.locator('[data-section="history"]').click();
    await window.getByText('one rect').click();

    const banner = window.getByTestId('snapshot-preview-banner');
    await expect(banner).toBeVisible();
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);

    // Exit discards the preview and returns to the live two-rect state.
    await banner.getByRole('button', { name: 'Exit' }).click();
    await expect(banner).toBeHidden();
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(2);
  });

  test('restoring from the preview banner commits the snapshot', async ({
    window,
  }) => {
    await oneRectSnapshotThenTwo(window);

    // Preview, then Restore from the banner → the rollback persists.
    await window.locator('[data-section="history"]').click();
    await window.getByText('one rect').click();
    const banner = window.getByTestId('snapshot-preview-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Restore' }).click();

    // The project re-reads from disk; the canvas stays at one rect and the
    // banner clears.
    await expect(banner).toBeHidden();
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
  });

  test('clicking "Now" exits the preview', async ({ window }) => {
    await oneRectSnapshotThenTwo(window);

    await window.locator('[data-section="history"]').click();
    await window.getByText('one rect').click();
    const banner = window.getByTestId('snapshot-preview-banner');
    await expect(banner).toBeVisible();

    // "Now" is the way back to the live state while previewing. Exact
    // match — the relative timestamps ("just now") also contain "Now".
    await window.getByRole('button', { name: 'Now', exact: true }).click();
    await expect(banner).toBeHidden();
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(2);
  });

  test('navigating to another page releases a stuck snapshot-preview lock', async ({
    window,
  }) => {
    // Regression: the read-only preview lock keys only on `snapshotPreview`
    // being set. Entering preview and then navigating away (without
    // clicking Exit) used to leak the lock onto the new page — the banner
    // vanished from the user's attention but draw/move/delete silently
    // no-op'd. loadPage now clears the lock. See docs/notes/snapshots.md.
    await oneRectSnapshotThenTwo(window);

    // Enter preview on the snapshot — canvas goes read-only.
    await window.locator('[data-section="history"]').click();
    await window.getByText('one rect').click();
    const banner = window.getByTestId('snapshot-preview-banner');
    await expect(banner).toBeVisible();

    // Switch to a freshly-created page WITHOUT exiting the preview first.
    await window.locator('[data-section="pages"]').click();
    await window.getByRole('button', { name: 'Add page', exact: true }).click();
    const nameInput = window.getByPlaceholder('page-name');
    await nameInput.fill('about');
    await nameInput.press('Enter');

    // The lock must not leak onto About: the banner is gone and the canvas
    // is editable again. Draw + Delete both exercise snapshotPreview guards
    // (useDrawInteraction / the keyboard handler), so their success proves
    // the lock was released.
    await expect(banner).toBeHidden();
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0);

    // Draw on the just-navigated page WITHOUT requiring the rect to paint
    // immediately. On a freshly-created page the new rect can briefly
    // render hidden (and lose its selection) while the page's file
    // re-parses — a reload-timing quirk unrelated to the preview lock. We
    // only need the rect to EXIST: that already proves the draw guard let
    // the edit through, since a leaked lock would block creation and leave
    // the count at 0.
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 100, y: 100 }, { x: 200, y: 180 });
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
    await waitForSaved(window);

    // Select via the layers row (visibility- and lock-independent) and
    // delete. The guarded Delete removing the rect is the proof the lock
    // was released — if it had leaked, Delete would no-op and the count
    // would stay 1. Retry the select+delete as one unit: a late echo
    // reload of the new page's file can drop the selection between the
    // click and the keypress (reloadElements keeps only ids still in the
    // tree), so a single attempt can no-op even with the lock released.
    // See docs/notes/snapshots.md.
    await expect(async () => {
      await layersRow(window, 'Rectangle').click();
      await window.keyboard.press('Delete');
      await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0, {
        timeout: 1_000,
      });
    }).toPass({ timeout: 10_000 });
    await waitForSaved(window);
  });

  test('leaving the page during a preview leaves the live page on disk', async ({
    window,
    project,
  }) => {
    // Regression: the flush that runs on a page switch wrote whatever the
    // canvas held — the preview — over the live page.
    // Audit item 10 in docs/archive/2026-10-12-audit-2026-10-12.md.
    await oneRectSnapshotThenTwo(window);
    const live = (await readPageFiles(project.dir, 'home')).tsx;
    expect(live.match(/data-scamp-id="rect_/g)).toHaveLength(2);

    await window.locator('[data-section="history"]').click();
    await window.getByText('one rect').click();
    await expect(window.getByTestId('snapshot-preview-banner')).toBeVisible();

    await window.locator('[data-section="pages"]').click();
    await window.getByRole('button', { name: 'Add page', exact: true }).click();
    const nameInput = window.getByPlaceholder('page-name');
    await nameInput.fill('about');
    await nameInput.press('Enter');
    await expect(window.getByTestId('snapshot-preview-banner')).toBeHidden();

    // Give a wrong write time to land before reading.
    await window.waitForTimeout(500);
    expect((await readPageFiles(project.dir, 'home')).tsx).toBe(live);
  });

  test('interleaves in-session undo steps; clicking one jumps the canvas', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    // Two rectangles → two "Drew rectangle" undo entries on this page.
    await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 180, y: 160 });
    await waitForSaved(window);
    await drawAndSelectRect(window, { x: 220, y: 80 }, { x: 320, y: 160 });
    await waitForSaved(window);
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(2);

    // The undo entries surface in the timeline alongside the snapshots.
    await window.locator('[data-section="history"]').click();
    const entries = window.getByText('Drew rectangle');
    await expect(entries).toHaveCount(2);

    // The list renders newest-first, so the second entry in DOM order is
    // the older one. Clicking it jumps the canvas back to one rect — an
    // in-session jump, no disk restore.
    await entries.nth(1).click();
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(1);
  });

  test('Cmd+Shift+H toggles the sidebar between Pages and History', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    const pagesIcon = window.locator('[data-section="pages"]');
    const historyIcon = window.locator('[data-section="history"]');

    // Default is the Pages section.
    await expect(pagesIcon).toHaveAttribute('aria-pressed', 'true');
    await expect(historyIcon).toHaveAttribute('aria-pressed', 'false');

    // Shortcut flips to History.
    await window.keyboard.press('ControlOrMeta+Shift+h');
    await expect(historyIcon).toHaveAttribute('aria-pressed', 'true');
    await expect(pagesIcon).toHaveAttribute('aria-pressed', 'false');

    // Shortcut again flips back.
    await window.keyboard.press('ControlOrMeta+Shift+h');
    await expect(pagesIcon).toHaveAttribute('aria-pressed', 'true');
    await expect(historyIcon).toHaveAttribute('aria-pressed', 'false');
  });
});

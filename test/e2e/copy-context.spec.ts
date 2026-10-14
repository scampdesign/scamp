import type { ElectronApplication } from '@playwright/test';

import { test, expect } from './fixtures/app';
import {
  dragInFrame,
  frameToClient,
  measureFrame,
  selectTool,
} from './fixtures/canvas';
import {
  clickContextMenuItem,
  openElementContextMenu,
} from './fixtures/components';
import {
  canvasElementsByPrefix,
  contextMenuItem,
  pageRoot,
} from './fixtures/selectors';

/**
 * Copy context, end to end. The unit tests cover what the string says; this
 * is the only level that proves the right-click item and the shortcut reach
 * the real OS clipboard — and that the panel inputs keep normal copy
 * behaviour.
 *
 * The action lives on the element right-click menu rather than the toolbar:
 * it acts on a specific element, so it belongs with the other per-element
 * actions. see docs/archive/2026-08-06-copy-context-button-plan.md
 */

test.use({ projectOptions: { format: 'nextjs' } });

const COPY_ITEM = 'Copy context for agent';

/**
 * Right-click at a frame-local point.
 *
 * Coordinate-based rather than clicking the element locator: the canvas
 * chrome overlay (`data-canvas-chrome`) sits above the elements and
 * intercepts pointer events, so a locator click never reaches them.
 */
const rightClickInFrame = async (
  window: Parameters<typeof selectTool>[0],
  point: { x: number; y: number }
): Promise<void> => {
  const metrics = await measureFrame(window);
  const client = frameToClient(metrics, point);
  await window.mouse.click(client.x, client.y, { button: 'right' });
};

/**
 * The real clipboard, read from the MAIN process. The renderer's own
 * `readClipboard` only understands svg / image / empty, so it can't see
 * plain text — Electron's `clipboard` module in main can.
 */
const clipboardText = (app: ElectronApplication): Promise<string> =>
  app.evaluate(({ clipboard }) => clipboard.readText());

const seedClipboard = (app: ElectronApplication, text: string): Promise<void> =>
  app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);

test.describe('copy context', () => {
  test('the right-click menu offers the action on an element', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 240, y: 180 });
    await rightClickInFrame(window, { x: 150, y: 120 });
    await expect(contextMenuItem(window, COPY_ITEM)).toBeVisible();
  });

  test('copies the element and its styles when chosen from the menu', async ({
    window,
    app,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 240, y: 180 });
    await seedClipboard(app, 'SENTINEL');

    await rightClickInFrame(window, { x: 150, y: 120 });
    await clickContextMenuItem(window, COPY_ITEM);

    await expect
      .poll(async () => clipboardText(app), { timeout: 3000 })
      .toMatch(/Context: app\/page\.tsx → \.rect_[0-9a-f]{4} \(div/);
    expect(await clipboardText(app)).toContain(
      'Full styles in app/page.module.css.'
    );
  });

  test('copies the element the user right-clicked, not a stale selection', async ({
    window,
    app,
  }) => {
    // Right-click selects before opening the menu, so the copied text and the
    // properties panel always agree — even when another element was selected.
    await expect(pageRoot(window)).toBeVisible();
    const rects = canvasElementsByPrefix(window, 'rect_');
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 160, y: 140 });
    // Wait for each rectangle before drawing the next. A drag that
    // lands before the tool has taken selects instead of draws, and
    // the test then right-clicks empty canvas and copies the ROOT —
    // which reads as "the wrong element" rather than "a draw was
    // lost". It only ever missed under the full suite.
    await expect(rects).toHaveCount(1);
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 220, y: 60 }, { x: 340, y: 160 });
    await expect(rects).toHaveCount(2);

    // Second rectangle is selected; right-click the FIRST one.
    await seedClipboard(app, 'SENTINEL');
    await rightClickInFrame(window, { x: 110, y: 100 });
    await clickContextMenuItem(window, COPY_ITEM);

    await expect
      .poll(async () => clipboardText(app), { timeout: 3000 })
      .toContain('Context:');
    const copied = await clipboardText(app);
    // Position is the reliable discriminator: the first rectangle sits at
    // left 60px, the second at left 220px. (Width isn't fixed on a drawn
    // rect, so a W×H check doesn't identify it.)
    expect(copied).toContain('left 60px');
    expect(copied).not.toContain('left 220px');
  });

  test('the copied string is a single line', async ({ window, app }) => {
    // It gets pasted in front of a prompt; a newline would break the paste.
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 200, y: 160 });
    await rightClickInFrame(window, { x: 130, y: 110 });
    await clickContextMenuItem(window, COPY_ITEM);
    await expect
      .poll(async () => clipboardText(app), { timeout: 3000 })
      .toContain('Context:');
    expect(await clipboardText(app)).not.toContain('\n');
  });

  test('the shortcut still copies page context with nothing selected', async ({
    window,
    app,
  }) => {
    // The menu can only ever describe an element — right-click selects one.
    // The page-level string is now reachable only this way, so it gets its
    // own test rather than losing coverage with the toolbar button.
    await expect(pageRoot(window)).toBeVisible();
    await seedClipboard(app, 'SENTINEL');
    await window.keyboard.press('ControlOrMeta+Shift+KeyC');
    await expect
      .poll(async () => clipboardText(app), { timeout: 3000 })
      .toContain('elements on canvas');
    expect(await clipboardText(app)).toContain('Context: app/page.tsx');
  });

  test('the shortcut copies too', async ({ window, app }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 200, y: 160 });
    await seedClipboard(app, 'SENTINEL');
    await window.keyboard.press('ControlOrMeta+Shift+KeyC');
    await expect
      .poll(async () => clipboardText(app), { timeout: 3000 })
      .toMatch(/\.rect_[0-9a-f]{4}/);
  });

  test('the shortcut leaves the clipboard alone when a field has focus', async ({
    window,
    app,
  }) => {
    // `isEditableTarget` covers every panel input and CodeMirror, whose
    // editor is contentEditable — so the CSS panel keeps normal copy.
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 60, y: 60 }, { x: 200, y: 160 });

    await seedClipboard(app, 'SENTINEL-UNTOUCHED');
    await window
      .locator('[data-testid="properties-panel"] input[type="text"]')
      .first()
      .click();
    await window.keyboard.press('ControlOrMeta+Shift+KeyC');

    // Give the handler a chance to (incorrectly) fire.
    await window.waitForTimeout(600);
    expect(await clipboardText(app)).toBe('SENTINEL-UNTOUCHED');
  });
});

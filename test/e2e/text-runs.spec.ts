import { test, expect } from './fixtures/app';
import { readPageFiles, waitForSaved } from './fixtures/assertions';
import { frameToClient, measureFrame } from './fixtures/canvas';
import { panelSection } from './fixtures/panel';
import { canvasElementsByPrefix, pageRoot } from './fixtures/selectors';

/**
 * Selecting words inside a text element and styling them into a span.
 *
 * Phase 4 of `docs/plans/inline-spans-plan.md`. The store action and the
 * offset mapping are unit-tested; this is the wiring — that a real
 * selection in a real contentEditable reaches the panel, and that what
 * the panel writes lands in the file as a span.
 */

type Win = Parameters<typeof pageRoot>[0];

const clickInFrame = async (window: Win, point: { x: number; y: number }): Promise<void> => {
  const metrics = await measureFrame(window);
  const at = frameToClient(metrics, point);
  await window.mouse.click(at.x, at.y);
};

/** Draw a text element carrying a sentence, and leave edit mode. */
const writeSentence = async (window: Win): Promise<void> => {
  await window.keyboard.press('t');
  await clickInFrame(window, { x: 200, y: 200 });
  await window.keyboard.type('works alongside AI');
  await window.keyboard.press('Escape');
  await waitForSaved(window);
};

test.describe('text runs', () => {
  test('clicking into a styled sentence does not destroy its styling', async ({
    window,
    project,
  }) => {
    // The risky half of Phase 4. A styled sentence is editable in place
    // again, which means `handleEditableBlur` runs on it — and if that
    // commits `textContent` unconditionally, one stray click flattens
    // every run. see docs/plans/inline-spans-plan.md
    await writeSentence(window);
    await expect(canvasElementsByPrefix(window, 'text_')).toHaveCount(1);

    // Style "alongside" through the same store call the panel makes.
    const styled = await window.evaluate(() => {
      const el = document.querySelector('[data-scamp-id^="text_"]');
      return el?.getAttribute('data-element-id') ?? null;
    });
    expect(styled).not.toBeNull();

    const applied = await window.evaluate((id) => {
      const w = window as unknown as {
        __scampCanvasStore?: {
          getState: () => {
            styleTextRange: (...a: unknown[]) => void;
            elements: Record<string, { text?: string; runs?: unknown }>;
          };
        };
      };
      if (!w.__scampCanvasStore) return { hook: false };
      const store = w.__scampCanvasStore.getState();
      const before = store.elements[id as string];
      store.styleTextRange(id, 6, 15, { color: '#0acd95' });
      return {
        hook: true,
        text: before?.text,
        runs: JSON.stringify(w.__scampCanvasStore.getState().elements[id as string]?.runs),
      };
    }, styled);
    expect(applied).toMatchObject({ hook: true });
    await waitForSaved(window);

    // The feature, in the file: a span around exactly the selected
    // words, with its own class, and the spaces either side kept as
    // `{' '}` rather than collapsed away.
    const before = await readPageFiles(project.dir, 'home');
    expect(before.tsx).toMatch(
      /works\{' '\}<span className=\{styles\.\w+__r1\}>alongside<\/span>\{' '\}AI/
    );
    expect(before.css).toMatch(/__r1 \{[^}]*color: #0acd95/);

    // Click into it and straight back out, changing nothing.
    const metrics = await measureFrame(window);
    const at = frameToClient(metrics, { x: 210, y: 205 });
    await window.mouse.dblclick(at.x, at.y);
    await window.waitForTimeout(200);
    await window.keyboard.press('Escape');
    await waitForSaved(window);
    await window.waitForTimeout(500);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).toBe(before.tsx);
    expect(after.css).toBe(before.css);
  });
});

import { test, expect } from './fixtures/app';
import { readPageFiles, waitForSaved } from './fixtures/assertions';
import { frameToClient, measureFrame } from './fixtures/canvas';
import { drawAndSelectRect, panelSection, propertiesPanel } from './fixtures/panel';
import { canvasElementsByPrefix, pageRoot } from './fixtures/selectors';

/**
 * Looking at something must not change it.
 *
 * Every test here asserts one rule: an interaction that only INSPECTS —
 * selecting a layer, opening a panel section, entering and leaving a text
 * edit without typing — leaves the files on disk byte-identical.
 *
 * This is an invariance test, not a comparison test, and it covers the
 * gap the round-trip invariant cannot see. `generateCode` ↔ `parseCode`
 * proves the two pure functions agree; it says nothing about a canvas
 * interaction that rewrites a file it should have left alone. That is the
 * shape of the style-loss class of bug: nobody edited anything, and the
 * file changed anyway.
 *
 * Byte-identical is deliberate. "Semantically equivalent" would pass
 * while a save reordered every declaration, and a reordering save is how
 * a real edit gets buried in a diff nobody can read.
 *
 * Borrowed from BuilderIO/agent-native's slides edit-fidelity harness,
 * whose README makes the case: unit tests have repeatedly missed breaks
 * on this path, because only a real editor rendering real CSS shows what
 * the user sees. see docs/agent-native-review.md
 */

type Win = Parameters<typeof pageRoot>[0];

/**
 * Click at a frame-local point.
 *
 * Coordinate-based, not `locator.click()`: the canvas chrome overlay
 * sits above every element and intercepts pointer events, so a locator
 * click times out waiting for a target it will never reach.
 */
const clickInFrame = async (
  window: Win,
  point: { x: number; y: number }
): Promise<void> => {
  const metrics = await measureFrame(window);
  const at = frameToClient(metrics, point);
  await window.mouse.click(at.x, at.y);
};

/** The rectangle `settledPage` draws, and a point inside it. */
const INSIDE_RECT = { x: 300, y: 270 };
/** Canvas, but outside anything drawn. */
const EMPTY_CANVAS = { x: 800, y: 620 };

/**
 * Draw one rectangle, let it save, and return the files as written.
 *
 * Every test starts from a saved page rather than an empty one: an empty
 * page can pass this whole suite by having nothing to lose.
 */
const settledPage = async (
  window: Win,
  projectDir: string
): Promise<{ tsx: string; css: string }> => {
  await drawAndSelectRect(window, { x: 200, y: 200 }, { x: 420, y: 340 });
  await waitForSaved(window);
  return readPageFiles(projectDir, 'home');
};

/**
 * Give any save the interaction might have triggered time to land.
 *
 * Without this the assertion can win a race it should lose: the file is
 * still the old one simply because nothing has been written YET, and the
 * test passes while the bug it was written for is present.
 */
const settle = async (window: Win): Promise<void> => {
  await waitForSaved(window);
  await window.waitForTimeout(600);
};

test.describe('editing invariance: looking does not change the file', () => {
  test('selecting a layer leaves the files byte-identical', async ({
    window,
    project,
  }) => {
    const before = await settledPage(window, project.dir);

    await clickInFrame(window, INSIDE_RECT);
    await expect(propertiesPanel(window)).toBeVisible();
    await settle(window);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).toBe(before.tsx);
    expect(after.css).toBe(before.css);
  });

  test('selecting, deselecting and reselecting leaves them byte-identical', async ({
    window,
    project,
  }) => {
    // The round trip, because a selection change is where the panel
    // rebuilds its state from the element and hands it back.
    const before = await settledPage(window, project.dir);

    await clickInFrame(window, INSIDE_RECT);
    await window.keyboard.press('Escape');
    await clickInFrame(window, INSIDE_RECT);
    await settle(window);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).toBe(before.tsx);
    expect(after.css).toBe(before.css);
  });

  test('opening a panel section leaves the files byte-identical', async ({
    window,
    project,
  }) => {
    // A section mounts its controls and reads the element's current
    // values into them. Reading must not write.
    const before = await settledPage(window, project.dir);

    await clickInFrame(window, INSIDE_RECT);
    for (const title of ['Layout', 'Spacing', 'Typography']) {
      const section = panelSection(window, title);
      if ((await section.count()) === 0) continue;
      await section.click();
      await window.waitForTimeout(100);
    }
    await settle(window);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).toBe(before.tsx);
    expect(after.css).toBe(before.css);
  });

  test('entering and leaving a text edit without typing leaves them byte-identical', async ({
    window,
    project,
  }) => {
    // The path this whole file exists for. Entering an edit replaces the
    // element's content with an editable surface and putting it back is
    // a serialisation — one that must produce exactly what it replaced.
    await window.keyboard.press('t');
    await clickInFrame(window, { x: 300, y: 500 });
    await window.keyboard.type('Hello');
    await window.keyboard.press('Escape');
    await waitForSaved(window);
    await expect(canvasElementsByPrefix(window, 'text_')).toHaveCount(1);
    const before = await readPageFiles(project.dir, 'home');

    const metrics = await measureFrame(window);
    const at = frameToClient(metrics, { x: 310, y: 505 });
    await window.mouse.dblclick(at.x, at.y);
    await window.waitForTimeout(150);
    await window.keyboard.press('Escape');
    await settle(window);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).toBe(before.tsx);
    expect(after.css).toBe(before.css);
  });

  // The control. Every other test here asserts that something did NOT
  // change, and a suite of those can pass while reading the wrong file,
  // comparing two empty strings, or never reaching the interaction at
  // all. This one proves the assertion has teeth: the same comparison,
  // on a real edit, must fail to hold.
  test('a real edit DOES change the file, so the others mean something', async ({
    window,
    project,
  }) => {
    const before = await settledPage(window, project.dir);
    expect(before.css).toContain('rect_');

    await clickInFrame(window, INSIDE_RECT);
    await drawAndSelectRect(window, { x: 600, y: 200 }, { x: 760, y: 320 });
    await settle(window);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).not.toBe(before.tsx);
    expect(after.css).not.toBe(before.css);
  });

  test('clicking empty canvas to deselect leaves them byte-identical', async ({
    window,
    project,
  }) => {
    // Deselecting is where the panel unmounts and anything it was
    // holding has its last chance to be flushed somewhere.
    const before = await settledPage(window, project.dir);

    await clickInFrame(window, EMPTY_CANVAS);
    await settle(window);

    const after = await readPageFiles(project.dir, 'home');
    expect(after.tsx).toBe(before.tsx);
    expect(after.css).toBe(before.css);
  });
});

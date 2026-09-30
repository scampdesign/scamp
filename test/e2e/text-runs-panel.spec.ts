import { test, expect } from './fixtures/app';
import { readPageFiles, waitForSaved } from './fixtures/assertions';
import { frameToClient, measureFrame } from './fixtures/canvas';
import { panelSection } from './fixtures/panel';
import { canvasElementsByPrefix, pageRoot } from './fixtures/selectors';

/**
 * Selecting words and styling them from the PANEL.
 *
 * Reported: selecting a word and setting bold emboldened the whole
 * element. Clicking a panel control blurs the contentEditable, which
 * ended edit mode, which cleared the selection — so the control fired
 * with no range and fell back to the element.
 *
 * The unit tests cover the store; this covers the path the bug was on,
 * which is the blur between the selection and the control.
 */

type Win = Parameters<typeof pageRoot>[0];

const clickInFrame = async (window: Win, point: { x: number; y: number }): Promise<void> => {
  const metrics = await measureFrame(window);
  const at = frameToClient(metrics, point);
  await window.mouse.click(at.x, at.y);
};

test('styling from the panel applies to the selection, not the element', async ({
  window,
  project,
}) => {
  await window.keyboard.press('t');
  await clickInFrame(window, { x: 200, y: 200 });
  await window.keyboard.type('make this bold');
  await window.keyboard.press('Escape');
  await waitForSaved(window);
  await expect(canvasElementsByPrefix(window, 'text_')).toHaveCount(1);

  // Enter edit mode and select "bold" — offsets 10..14.
  const metrics = await measureFrame(window);
  const at = frameToClient(metrics, { x: 210, y: 205 });
  await window.mouse.dblclick(at.x, at.y);
  await window.evaluate(() => {
    const node = document.querySelector('[data-scamp-id^="text_"]');
    const first = node?.firstChild;
    if (!first) throw new Error('no text node');
    const range = document.createRange();
    range.setStart(first, 10);
    range.setEnd(first, 14);
    // `document`, not `window`: inside `evaluate` the identifier
    // `window` is the Playwright Page from the enclosing scope.
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    node?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  // Now use the real control, which blurs the editable to get focus.
  await expect(panelSection(window, 'Typography')).toBeVisible();
  const weight = window.getByLabel('Font weight', { exact: true });
  await weight.fill('700');
  await weight.press('Enter');
  await waitForSaved(window);

  const { tsx, css } = await readPageFiles(project.dir, 'home');
  // A span around exactly those words…
  expect(tsx).toMatch(/make this\{' '\}<span className=\{styles\.\w+__r1\}>bold<\/span>/);
  expect(css).toMatch(/__r1 \{[^}]*font-weight: 700/);
  // …and the element itself is NOT bold, which was the bug.
  //
  // `\w+` would also match the RUN's class — `.text_116a__r1` — and
  // pass while the bug was present. The element's class is the id
  // alone, with no `__r` suffix.
  expect(css).not.toMatch(/\.text_[0-9a-f]+ \{[^}]*font-weight: 700/);
});

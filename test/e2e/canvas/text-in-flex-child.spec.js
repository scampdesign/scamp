import { test, expect } from '../fixtures/app';
import { clickInFrame, selectTool } from '../fixtures/canvas';
import { drawAndSelectRect } from '../fixtures/panel';
import { canvasElement, canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
// A new project's home page: a centred flex column.
const HOME_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 40px;
  align-items: center;
  justify-content: center;
  position: relative;
}
`;
test.use({ projectOptions: { format: 'nextjs', pageContent: { home: { css: HOME_CSS } } } });
/**
 * A box drawn into a flex container is placed by the container, so the
 * point it was drawn at is not a position. It used to be kept anyway,
 * and the first text placed inside the box turned it into `left` / `top`
 * offsets (the box needs a positioning context for its absolute child),
 * so the box jumped by its own drawing coordinates.
 */
test('placing text inside a box drawn into a flex root keeps the box where it is', async ({ window, project, }) => {
    await expect(pageRoot(window)).toBeVisible();
    const box = await drawAndSelectRect(window, { x: 400, y: 400 }, { x: 1000, y: 530 });
    await waitForSaved(window);
    const boxNode = canvasElement(window, box);
    const before = await boxNode.boundingBox();
    await selectTool(window, 't');
    await clickInFrame(window, { x: 700, y: 470 });
    await window.keyboard.press('Escape');
    await waitForSaved(window);
    const after = await boxNode.boundingBox();
    expect(after?.x).toBe(before?.x);
    expect(after?.y).toBe(before?.y);
    const text = canvasElementsByPrefix(window, 'text_').first();
    await expect(text).toBeVisible();
    const textBox = await text.boundingBox();
    expect(textBox && after && textBox.x >= after.x && textBox.x < after.x + after.width).toBe(true);
    expect(textBox && after && textBox.y >= after.y && textBox.y < after.y + after.height).toBe(true);
    const css = await project.readCss();
    const boxBlock = css.slice(css.indexOf(`.${box} {`), css.indexOf('}', css.indexOf(`.${box} {`)));
    // The positioning context comes with zero offsets, never the drawn point.
    expect(boxBlock).toContain('position: relative;');
    expect(boxBlock).toContain('left: 0px;');
    expect(boxBlock).toContain('top: 0px;');
});

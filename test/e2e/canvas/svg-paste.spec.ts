import { test, expect } from '../fixtures/app';
import {
  canvasElementsByPrefix,
  canvasFrame,
  pageRoot,
  tokenSwatch,
} from '../fixtures/selectors';
import { clickInFrame } from '../fixtures/canvas';
import { layersRowByClass } from '../fixtures/layers';
import { panelSection } from '../fixtures/panel';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

/**
 * Paste an SVG copied as markup (Cmd/Ctrl+V) → inline editable <svg>
 * element. Drives the real OS clipboard via the Electron main process.
 * see docs/plans/svg-improvements-plan.md
 */
test.describe('canvas: paste SVG from clipboard', () => {
  test('pastes copied SVG markup as an inline svg element', async ({
    window,
    app,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff0000"/></svg>'
      );
    });

    // Neutral focus, then paste.
    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    await expect(canvasElementsByPrefix(window, 'img_')).toHaveCount(1);
    const { tsx } = await readPageFiles(project.dir, project.pageName);
    expect(tsx).toContain('<svg');
    expect(tsx).toContain('<circle');
  });

  test('pastes a shape as a real, valid-JSX svg child (renders on the canvas)', async ({
    window,
    app,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#ff0000"/></svg>'
      );
    });

    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    // The shape's own fill is KEPT in the source; element-level Fill/Stroke
    // recolour it on top via the CSS cascade (CSS `fill` beats the
    // presentation attribute — see the "setting Fill" test below). The
    // source stays valid JSX — no inline `style` strings (which crash
    // Next.js) and no `var()` (which an SVG attribute won't resolve).
    const { tsx } = await readPageFiles(project.dir, project.pageName);
    expect(tsx).toContain('<rect');
    expect(tsx).toContain('fill="#ff0000"');
    expect(tsx).not.toContain('var(');
    expect(tsx).not.toContain('style=');

    // The canvas renders a real <svg> (not the legacy <div> placeholder), so
    // the shape is in the SVG namespace and actually lays out / paints.
    const node = canvasElementsByPrefix(window, 'img_').first();
    await expect(node).toHaveJSProperty('tagName', 'svg');
    const box = await node
      .locator('rect')
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
  });

  test('is labeled "SVG" in the layers tree and is click-selectable on the canvas', async ({
    window,
    app,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#ff0000"/></svg>'
      );
    });

    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    const svg = canvasElementsByPrefix(window, 'img_').first();
    const cls = await svg.getAttribute('data-scamp-id');
    if (!cls) throw new Error('no svg element created');

    // The layers row reads "SVG" (not "Image"/"Rectangle").
    await expect(
      layersRowByClass(window, cls).getByText('SVG', { exact: true })
    ).toBeVisible();

    // Deselect by clicking empty canvas (clears the selection toolbar that
    // floats over the small icon and drops the SVG panel), then click the
    // svg's coordinates → it selects and the SVG section reappears. The
    // click drives the interaction chrome overlay's coordinate hit-testing
    // (the code path under test). Regression: an inline <svg> is an
    // SVGElement, so hit-testing that filtered on `instanceof HTMLElement`
    // skipped it and its shapes, leaving it unselectable from the canvas.
    // The svg pastes at frame (20,20) at 100×100 → its center is (70,70).
    await clickInFrame(window, { x: 400, y: 400 });
    await expect(panelSection(window, 'SVG')).toHaveCount(0);
    await clickInFrame(window, { x: 70, y: 70 });
    await expect(panelSection(window, 'SVG')).toBeVisible();

    // An icon's own color and stroke lead the color controls, above the
    // box's Background and Border.
    const svgTop = (await panelSection(window, 'SVG').boundingBox())?.y ?? Infinity;
    const backgroundTop = (await panelSection(window, 'Background').boundingBox())?.y ?? -Infinity;
    expect(svgTop).toBeLessThan(backgroundTop);
  });

  test('setting Fill in the SVG section recolors the shape', async ({
    window,
    app,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#ff0000"/></svg>'
      );
    });

    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');

    // The pasted svg is selected → the SVG section shows. Set Fill to blue.
    const fillInput = panelSection(window, 'SVG')
      .locator('input[type="text"]')
      .first();
    await fillInput.fill('#0000ff');
    await fillInput.press('Enter');

    const rect = canvasElementsByPrefix(window, 'img_')
      .first()
      .locator('rect')
      .first();
    await expect
      .poll(async () => rect.evaluate((el) => getComputedStyle(el).fill))
      .toBe('rgb(0, 0, 255)');
  });

  test('an outline icon: invisible box dropped, strokes recolor via Stroke', async ({
    window,
    app,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    // Lucide/Tabler shape: a transparent bounding box (fill="none"
    // stroke="none") plus a stroked path, with a concrete stroke on the
    // root (hoisted to the element's Stroke).
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#111111" stroke-width="2"><path d="M0 0h24v24H0z" fill="none" stroke="none"/><path d="M4 6h16"/></svg>'
      );
    });

    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    // The fully-transparent bounding box is dropped on import (so an
    // element-level colour can never paint it as a solid square); the
    // stroked path remains. Source stays valid JSX (no var/style).
    const { tsx } = await readPageFiles(project.dir, project.pageName);
    expect(tsx).not.toContain('M0 0h24v24H0z');
    expect(tsx).toContain('M4 6h16');
    expect(tsx).not.toContain('var(');
    expect(tsx).not.toContain('style=');

    // Set Stroke to blue → the stroked path recolours via the CSS cascade.
    // fill="none" isn't a concrete colour, so Stroke is the only swatch.
    const strokeInput = panelSection(window, 'SVG')
      .locator('input[type="text"]')
      .first();
    await strokeInput.fill('#0000ff');
    await strokeInput.press('Enter');

    const strokePath = canvasElementsByPrefix(window, 'img_')
      .first()
      .locator('path')
      .first();
    await expect
      .poll(async () => strokePath.evaluate((el) => getComputedStyle(el).stroke))
      .toBe('rgb(0, 0, 255)');
  });

  test('recolors via a theme TOKEN (resolved on the canvas)', async ({
    window,
    app,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#111111" stroke-width="2"><path d="M4 6h16"/></svg>'
      );
    });

    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');

    // Open the Stroke colour picker (the only concrete swatch), Tokens tab,
    // pick --color-primary (#3b82f6).
    await panelSection(window, 'SVG')
      .getByRole('button', { name: 'Pick color' })
      .first()
      .click();
    await window.getByRole('button', { name: 'Tokens', exact: true }).click();
    await tokenSwatch(window, '--color-primary').click();

    // The token resolves to its value on the canvas (elementToStyle reads
    // the same themeTokens), and the path inherits it.
    const path = canvasElementsByPrefix(window, 'img_')
      .first()
      .locator('path')
      .first();
    await expect
      .poll(async () => path.evaluate((el) => getComputedStyle(el).stroke))
      .toBe('rgb(59, 130, 246)');
  });

  test('sanitizes <script> out of pasted svg', async ({
    window,
    app,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText(
        '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>'
      );
    });

    await canvasFrame(window).click({ position: { x: 4, y: 4 } });
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    const { tsx } = await readPageFiles(project.dir, project.pageName);
    expect(tsx).toContain('<rect');
    expect(tsx.toLowerCase()).not.toContain('<script');
  });
});

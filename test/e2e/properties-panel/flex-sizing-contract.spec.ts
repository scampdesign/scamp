import { test, expect } from '../fixtures/app';
import { clickInFrame, dragInFrame, selectTool } from '../fixtures/canvas';
import { panelSection } from '../fixtures/panel';
import { canvasElement, canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

/**
 * The flex sizing contract, end to end, on RENDERED geometry.
 *
 * Every CSS-level assertion in this area passed through every bug this
 * week — a stylesheet can read perfectly while the canvas shows
 * something else. So these measure boxes.
 *
 * see docs/archive/2026-09-04-flex-sizing-contract-plan.md
 */

const HOME_TSX = `import styles from './page.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="shell_a001" className={styles.shell_a001}>
        <div data-scamp-id="side_a002" className={styles.side_a002}></div>
        <div data-scamp-id="main_a003" className={styles.main_a003}></div>
      </div>
      <div data-scamp-id="hug_a004" className={styles.hug_a004}>
        <div data-scamp-id="hug_kid_a005" className={styles.hug_kid_a005}></div>
      </div>
    </div>
  );
}
`;

// The reported layout: a flex row with an INDEFINITE height (min-height
// only, like a real page root), a fixed-width sidebar, and a main panel.
// Plus a hug-width row to check that an oversized draw grows it.
const HOME_CSS = `.root {
}

.shell_a001 {
  position: absolute;
  left: 0px;
  top: 0px;
  width: 900px;
  min-height: 400px;
  display: flex;
  gap: 0px;
  background-color: rgb(240, 240, 240);
}

.side_a002 {
  width: 287px;
  height: 120px;
  background-color: rgb(200, 200, 220);
  flex-shrink: 0;
}

.main_a003 {
  width: 200px;
  height: 300px;
  background-color: rgb(220, 220, 200);
}

.hug_a004 {
  position: absolute;
  left: 0px;
  top: 450px;
  width: fit-content;
  height: 150px;
  display: flex;
  align-items: flex-start;
  background-color: rgb(230, 240, 230);
}

/* A hug parent with no children measures 0 wide — there would be
   nothing to start a drag inside. The parent pins it to the top
   (align-items: flex-start) so the band below stays free: starting a
   drag ON a child nests inside that child instead. */
.hug_kid_a005 {
  width: 100px;
  height: 100px;
  background-color: rgb(180, 210, 180);
}
`;

test.use({
  projectOptions: {
    format: 'nextjs',
    pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } },
  },
});

const pickType = async (
  window: Parameters<typeof pageRoot>[0],
  axis: 'Width' | 'Height',
  option: string
): Promise<void> => {
  await panelSection(window, 'Size')
    .getByRole('button', { name: `${axis} type` })
    .click();
  await window.getByRole('option', { name: option }).click();
};

/** Logical (zoom-normalised) box of a canvas element. */
const box = async (
  window: Parameters<typeof pageRoot>[0],
  className: string
): Promise<{ w: number; h: number }> =>
  canvasElement(window, className).evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    let node: HTMLElement | null = el as HTMLElement;
    while (node && node.getAttribute('data-testid') !== 'canvas-frame') {
      node = node.parentElement;
    }
    const scale =
      node && node.offsetWidth > 0
        ? node.getBoundingClientRect().width / node.offsetWidth
        : 1;
    return { w: Math.round(r.width / scale), h: Math.round(r.height / scale) };
  });

test.describe('flex sizing contract', () => {
  test('a fixed sidebar holds its width when main fills the rest', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'v');
    await clickInFrame(window, { x: 350, y: 60 }); // main spans 287..487
    await pickType(window, 'Width', 'Fill');
    await waitForSaved(window);

    // The sidebar holds 287 because its guard is IN THE FILE — which is
    // also why the browser agrees. Measured without one: 218.
    const side = await box(window, 'side_a002');
    const main = await box(window, 'main_a003');
    expect(side.w).toBe(287);
    expect(main.w).toBe(900 - 287);

    // And the Fill child must never carry a guard: a basis of 100% that
    // cannot shrink overflows the container by the sibling's width.
    const css = await project.readCss();
    expect(css).toMatch(/\.side_a002[^}]*flex-shrink:\s*0/s);
    expect(css).not.toMatch(/\.main_a003[^}]*flex-shrink/s);
  });

  test('fill height stays visible against an indefinite parent', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'v');
    await clickInFrame(window, { x: 100, y: 60 }); // sidebar
    await pickType(window, 'Height', 'Fill');
    await waitForSaved(window);

    // height: 100% against a min-height-only parent computes to 0 — the
    // disappearing sidebar. align-self: stretch fills either way.
    const side = await box(window, 'side_a002');
    const shell = await box(window, 'shell_a001');
    expect(side.h).toBe(shell.h);
    expect(side.h).toBeGreaterThan(100);

    const css = await project.readCss();
    expect(css).toMatch(/\.side_a002[^}]*align-self:\s*stretch/s);
    expect(css).not.toMatch(/\.side_a002[^}]*height:\s*100%/s);
  });

  test('a box drawn larger than a hug parent grows it instead of shrinking', async ({
    window,
  }) => {
    // Rule 1 + 4: the draw is no longer clamped to the parent, and a
    // fit-content parent grows around it exactly as a browser would.
    await expect(pageRoot(window)).toBeVisible();
    const shellBefore = await box(window, 'hug_a004');

    await selectTool(window, 'r');
    // Starts inside the 100px-wide hug parent and runs well past it.
    await dragInFrame(window, { x: 20, y: 560 }, { x: 420, y: 595 });
    await waitForSaved(window);

    const drawn = await canvasElementsByPrefix(window, 'rect_')
      .first()
      .evaluate((el) => Math.round((el as HTMLElement).offsetWidth));
    expect(drawn).toBe(400);
    const shellAfter = await box(window, 'hug_a004');
    expect(shellAfter.w).toBeGreaterThan(shellBefore.w);
  });
});

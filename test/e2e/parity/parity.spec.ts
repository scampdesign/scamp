import { test, expect } from '../fixtures/app';
import { canvasLocator, pageRoot } from '../fixtures/selectors';
import { PARITY_FIXTURES, type ParityFixture } from './fixtures';
import {
  compareGeometry,
  comparePixels,
  describeDivergences,
  launchTruthBrowser,
  measure,
  compareComputed,
  computedInBrowser,
  describeComputed,
  hideCanvasChrome,
  measureComputed,
  measureInBrowser,
  screenshotInBrowser,
} from './harness';

/**
 * The canvas and the preview must lay out identically. This renders each
 * fixture both ways from the same source files and compares the geometry
 * of every element.
 *
 * Fixtures carrying `knownGap` are asserted to FAIL — they record a
 * divergence we know about and haven't fixed, so the suite stays green
 * while telling us the moment one is closed.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */

/** Layout differences below this are sub-pixel noise, not divergence. */
const TOLERANCE_PX = 1;

/**
 * Share of pixels allowed to differ before a paint comparison fails.
 * Antialiasing along a radius or a shadow's falloff will always disagree
 * slightly between two renderers; a missing gradient or a wrong colour
 * moves far more than this.
 */
const MAX_DIFFERING_FRACTION = 0.02;

const runParityCheck = async (
  fixture: ParityFixture,
  window: Parameters<typeof measure>[0],
  themeCss: string
): Promise<void> => {
  await expect(pageRoot(window)).toBeVisible();

  const canvas = await measure(window);
  // Lay the browser out at the same width the canvas root actually got;
  // a different width is a different valid layout, not a divergence.
  const rootWidth = canvas['root']?.w;
  expect(rootWidth, 'canvas root has a measurable width').toBeGreaterThan(0);

  const browser = await launchTruthBrowser();
  try {
    const truth = await measureInBrowser(
      browser,
      {
        html: fixture.html,
        // Component rules join the page's, the way CSS Modules deliver them
        // to the browser — under names that can't collide.
        css: `${fixture.css}\n${fixture.truthCss ?? ''}`,
        themeCss,
      },
      { width: Math.round(rootWidth ?? 0), height: 900 }
    );
    const divergences = compareGeometry(canvas, truth, TOLERANCE_PX);
    expect(
      divergences,
      divergences.length === 0
        ? ''
        : `canvas and browser disagree for "${fixture.name}":\n${describeDivergences(divergences)}\n\n${fixture.why}`
    ).toEqual([]);

    if (fixture.computed !== undefined) {
      const props = fixture.computed;
      const mine = await measureComputed(window, props);
      const theirs = await computedInBrowser(
        browser,
        { html: fixture.html, css: `${fixture.css}\n${fixture.truthCss ?? ''}`, themeCss },
        { width: Math.round(rootWidth ?? 0), height: 900 },
        props
      );
      const diffs = compareComputed(mine, theirs);
      expect(
        diffs,
        diffs.length === 0
          ? ''
          : `canvas and browser compute different values for "${fixture.name}":\n${describeComputed(diffs)}`
      ).toEqual([]);
    }

    if (fixture.pixels === true) {
      // The canvas root, not the frame: the frame carries canvas-only
      // affordances (the min-height floor) the browser has no counterpart
      // for, and the root is the thing both sides genuinely share.
      await hideCanvasChrome(window);
      const shot = await screenshotInBrowser(
        browser,
        {
          html: fixture.html,
          css: `${fixture.css}\n${fixture.truthCss ?? ''}`,
          themeCss,
        },
        { width: Math.round(rootWidth ?? 0), height: 900 }
      );
      const canvasPng = await canvasLocator(window, '[data-scamp-id="root"]').first().screenshot();
      const diff = await comparePixels(shot.page, canvasPng, shot.png);
      await shot.page.close();
      expect(
        diff.differingFraction,
        `canvas and browser paint differently for "${fixture.name}": ` +
          `${(diff.differingFraction * 100).toFixed(1)}% of pixels differ ` +
          `(worst channel delta ${diff.maxChannelDelta}).\n\n${fixture.why}`
      ).toBeLessThanOrEqual(MAX_DIFFERING_FRACTION);
    }
  } finally {
    await browser.close();
  }
};

/**
 * The TSX and the HTML are written by hand and must stay in step. Comparing
 * the element names they carry catches a fixture edited on one side only,
 * which would otherwise look like a canvas divergence.
 */
const elementNames = (source: string, attribute: string): string[] =>
  [...source.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))]
    .map((m) => m[1] ?? '')
    .sort();

test.describe('parity fixtures are internally consistent', () => {
  for (const fixture of PARITY_FIXTURES) {
    test(`${fixture.name}: tsx and html describe the same elements`, () => {
      // A fixture with components can't be compared this way: the TSX names
      // the instance, the HTML names the elements it expands into. Their
      // `data-scamp-id`s are compared instead.
      if (fixture.components) {
        expect(elementNames(fixture.html, 'data-scamp-id').length).toBeGreaterThan(
          0
        );
        return;
      }
      expect(elementNames(fixture.html, 'class')).toEqual(
        elementNames(fixture.tsx, 'data-scamp-id')
      );
    });
  }
});

for (const fixture of PARITY_FIXTURES) {
  test.describe(`parity: ${fixture.name}`, () => {
    test.use({
      projectOptions: {
        ...(fixture.components
          ? {
              format: 'nextjs' as const,
              components: fixture.components.map((c) => ({
                name: c.name,
                tsxContent: c.tsx,
                cssContent: c.css,
              })),
            }
          : {}),
        pageContent: { home: { tsx: fixture.tsx, css: fixture.css } },
      },
    });

    test(`canvas matches the browser${fixture.knownGap ? ' (known gap)' : ''}`, async ({
      window,
      project,
    }) => {
      if (fixture.knownGap !== undefined) {
        // Documented divergence. `test.fail()` asserts it still fails, so
        // this flips to a failure when the gap closes and needs removing.
        test.fail(true, fixture.knownGap);
      }
      await runParityCheck(fixture, window, await project.readTheme());
    });
  });
}

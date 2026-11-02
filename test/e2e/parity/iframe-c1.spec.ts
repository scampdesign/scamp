import type { Frame, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { IFRAME_CANVAS, pageRoot } from '../fixtures/selectors';
import { PARITY_FIXTURES, type ParityFixture } from './fixtures';
import {
  compareComputed,
  compareGeometry,
  computedInBrowser,
  describeComputed,
  describeDivergences,
  launchTruthBrowser,
  measure,
  measureInBrowser,
  type ComputedStyles,
  type Geometry,
} from './harness';

/**
 * Experiment (option C1): every parity fixture drawn as the HTML export in
 * a same-origin iframe, measured against the browser oracle. Throwaway, on
 * the experiment branch only. see docs/plans/canvas-rendering-options.md
 */

const TOLERANCE_PX = 1;

const page = (body: string): string => `import styles from './home.module.css';

export default function Home() {
  return (
${body}
  );
}
`;

/** Fails on today's canvas: `vh` there is the app window's height, not the artboard's. */
const VIEWPORT_UNITS: ParityFixture = {
  name: 'viewport-height-units',
  why: 'A `vh` height follows the viewport. On the canvas the viewport is the Electron window; in an iframe it is the artboard.',
  tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="half_v001" className={styles.half_v001} />
    </div>`),
  html: `    <div class="root">
      <div class="half_v001"></div>
    </div>`,
  css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.half_v001 {
  width: 200px;
  height: 50vh;
  position: absolute;
  left: 0px;
  top: 0px;
  background: #333333;
}
`,
};

const FIXTURES: ReadonlyArray<ParityFixture> = [...PARITY_FIXTURES, VIEWPORT_UNITS];

/** `inst_a024__root` is the oracle's `inst_a024/root`. */
const KEY_SCRIPT = `
  const keyOf = (el) => {
    const first = el.classList[0];
    if (!first) return null;
    const parts = first.split('__');
    return parts.length > 1 ? parts[parts.length - 2] + '/' + parts[parts.length - 1] : first;
  };`;

const MEASURE_IFRAME = `(() => {${KEY_SCRIPT}
  const nodes = Array.from(document.querySelectorAll('[class]'));
  const root = nodes.find((el) => keyOf(el) === 'root');
  if (!root) return null;
  const rootRect = root.getBoundingClientRect();
  const out = {};
  for (const el of nodes) {
    const key = keyOf(el);
    if (!key || out[key] || !/^[a-z][a-z0-9_]*([/][a-z][a-z0-9_]*)?$/i.test(key)) continue;
    const r = el.getBoundingClientRect();
    out[key] = { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
  }
  return out;
})()`;

const COMPUTED_IFRAME = (props: ReadonlyArray<string>): string => `(() => {${KEY_SCRIPT}
  const props = ${JSON.stringify(props)};
  const out = {};
  for (const el of document.querySelectorAll('[class]')) {
    const key = keyOf(el);
    if (!key || out[key] || !/^[a-z][a-z0-9_]*$/i.test(key)) continue;
    const cs = getComputedStyle(el);
    const entry = {};
    for (const p of props) entry[p] = cs.getPropertyValue(p).trim();
    out[key] = entry;
  }
  return out;
})()`;

const iframeCanvas = async (window: Page): Promise<Frame> => {
  await window.evaluate(() =>
    (globalThis as unknown as { __scampIframeCanvas: { set: (on: boolean) => void } }).__scampIframeCanvas.set(true)
  );
  const handle = await window.locator('[data-testid="iframe-canvas"] iframe').elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error('no iframe canvas');
  await expect.poll(() => frame.evaluate(() => document.querySelector('.root') !== null)).toBe(true);
  return frame;
};

/**
 * The browser renders the page's CSS as saved, which is what the preview
 * loads. The app may rewrite a seeded file when it opens it (a page becomes
 * a view, and its root loses `min-height: 100vh`), and the canvas must match
 * the file the preview runs, not the fixture as written.
 */
const truthFor = async (
  fixture: ParityFixture,
  savedCss: string,
  themeCss: string,
  width: number
): Promise<{ geometry: Geometry; computed: ComputedStyles | null }> => {
  const browser = await launchTruthBrowser();
  try {
    const css = fixture.components ? fixture.css : savedCss;
    const source = { html: fixture.html, css: `${css}\n${fixture.truthCss ?? ''}`, themeCss };
    const viewport = { width, height: 900 };
    return {
      geometry: await measureInBrowser(browser, source, viewport),
      computed: fixture.computed ? await computedInBrowser(browser, source, viewport, fixture.computed) : null,
    };
  } finally {
    await browser.close();
  }
};

for (const fixture of FIXTURES) {
  test.describe(`iframe C1: ${fixture.name}`, () => {
    test.use({
      projectOptions: {
        ...(fixture.components
          ? {
              format: 'nextjs' as const,
              components: fixture.components.map((c) => ({ name: c.name, tsxContent: c.tsx, cssContent: c.css })),
            }
          : {}),
        pageContent: { home: { tsx: fixture.tsx, css: fixture.css } },
      },
    });

    test('the iframe canvas matches the browser', async ({ window, project }) => {
      await expect(pageRoot(window)).toBeVisible();
      const today = await measure(window);
      const frame = await iframeCanvas(window);
      const mine = (await frame.evaluate(MEASURE_IFRAME)) as Geometry | null;
      if (mine === null) throw new Error('no root in the iframe');
      const width = Math.round(mine['root']?.w ?? 0);
      const saved = await project.readPage('home');
      const truth = await truthFor(fixture, saved.css, await project.readTheme(), width);

      const todayDiffs = compareGeometry(today, truth.geometry, TOLERANCE_PX);
      test.info().annotations.push({
        type: 'today',
        description: todayDiffs.length === 0 ? 'today matches' : describeDivergences(todayDiffs),
      });

      const diffs = compareGeometry(mine, truth.geometry, TOLERANCE_PX);
      expect(diffs, describeDivergences(diffs)).toEqual([]);
      if (fixture.computed && truth.computed) {
        const computed = (await frame.evaluate(COMPUTED_IFRAME(fixture.computed))) as ComputedStyles;
        const cdiffs = compareComputed(computed, truth.computed);
        expect(cdiffs, describeComputed(cdiffs)).toEqual([]);
      }
      // With SCAMP_E2E_IFRAME=1 the "today" side is the iframe too.
      if (fixture === VIEWPORT_UNITS && !IFRAME_CANVAS) {
        // The point of the fixture: today's canvas gets this wrong.
        expect(todayDiffs.length, 'today’s canvas diverges on vh').toBeGreaterThan(0);
      }
    });
  });
}

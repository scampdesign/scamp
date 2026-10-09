import { promises as fs } from 'fs';
import * as path from 'path';

import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
import { PARITY_FIXTURES, type ParityFixture } from './fixtures';
import {
  compareGeometry,
  describeDivergences,
  launchTruthBrowser,
  measure,
  measureUrlInBrowser,
  startFrameworkServer,
  type Geometry,
} from './harness';

/**
 * The canvas against the framework. `parity.spec.ts` compares the canvas
 * with a browser rendering hand-written HTML; this file compares it with
 * what `scamp dev` serves from the same TSX and CSS, written into a
 * Scamp-framework project and rendered at `/_views/<Name>`. A divergence
 * here is either a canvas bug or a framework rendering bug — either way
 * something the preview would show differently from the canvas.
 *
 * A page fixture becomes `views/Home/Home.tsx`. A fixture with one
 * unadorned component instance compares that instance's subtree on the
 * canvas with the component rendered as a view on its own, rebased to the
 * instance's origin; the framework drops the instance marker the canvas
 * keys by, so the page and the instance can't be compared as one
 * document. see docs/notes/framework-preview.md
 */

const TOLERANCE_PX = 1;
const TMP = path.resolve(__dirname, '.tmp');

type Plan =
  | { kind: 'page' }
  | { kind: 'instance'; component: string; instanceId: string }
  | { kind: 'skip'; why: string };

const planFor = (fixture: ParityFixture): Plan => {
  if (fixture.frameworkSkip !== undefined) return { kind: 'skip', why: fixture.frameworkSkip };
  if (!fixture.components) return { kind: 'page' };
  const instances = [...fixture.tsx.matchAll(/<(\w+) data-scamp-instance-id="([^"]+)"([^>]*?)\/?>/g)];
  const only = instances[0];
  if (instances.length !== 1 || only === undefined) {
    return { kind: 'skip', why: 'more than one instance; the framework renders each view alone' };
  }
  if (only[3]?.trim() !== '') {
    return { kind: 'skip', why: 'the instance carries overrides; the view alone renders its defaults' };
  }
  return { kind: 'instance', component: only[1] ?? '', instanceId: only[2] ?? '' };
};

const writeProject = async (
  dir: string,
  fixture: ParityFixture,
  themeCss: string
): Promise<void> => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify(
      {
        name: 'parity',
        private: true,
        type: 'module',
        dependencies: { preact: '^10.29.0', scampjs: '^0.1.0' },
      },
      null,
      2
    ),
    // The Next.js layout the other harness mirrors sets the body margin
    // inline; a framework project's theme owns the body rules instead.
    'design/theme.css': `${themeCss}\nbody {\n  margin: 0;\n  min-height: 100vh;\n}\n`,
    'views/Home/Home.tsx': fixture.tsx,
    'views/Home/home.module.css': fixture.css,
  };
  for (const component of fixture.components ?? []) {
    files[`components/${component.name}/${component.name}.tsx`] = component.tsx;
    files[`components/${component.name}/${component.name}.module.css`] = component.css;
    // A component rendered as a view on its own.
    files[`views/${component.name}/${component.name}.tsx`] = component.tsx;
    files[`views/${component.name}/${component.name}.module.css`] = component.css;
  }
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf-8');
  }
};

/** The instance's subtree as the canvas measured it, relative to its own root. */
const instanceSubtree = (canvas: Geometry, instanceId: string): Geometry => {
  const origin = canvas[`${instanceId}/root`];
  if (origin === undefined) return {};
  const out: Geometry = {};
  for (const [key, box] of Object.entries(canvas)) {
    if (!key.startsWith(`${instanceId}/`)) continue;
    out[key.slice(instanceId.length + 1)] = {
      x: box.x - origin.x,
      y: box.y - origin.y,
      w: box.w,
      h: box.h,
    };
  }
  return out;
};

for (const fixture of PARITY_FIXTURES) {
  const plan = planFor(fixture);
  test.describe(`framework parity: ${fixture.name}`, () => {
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
    test(`canvas matches scamp dev${fixture.knownGap ? ' (known gap)' : ''}`, async ({
      window,
      project,
    }) => {
      test.skip(plan.kind === 'skip', plan.kind === 'skip' ? plan.why : '');
      if (fixture.knownGap !== undefined) {
        test.fail(true, fixture.knownGap);
      }
      await expect(pageRoot(window)).toBeVisible();
      const canvas = await measure(window);
      const rootWidth = canvas['root']?.w;
      expect(rootWidth, 'canvas root has a measurable width').toBeGreaterThan(0);

      const dir = path.join(TMP, `${fixture.name}-${process.pid}`);
      await fs.rm(dir, { recursive: true, force: true });
      await writeProject(dir, fixture, await project.readTheme());
      const server = await startFrameworkServer(dir);
      const browser = await launchTruthBrowser();
      try {
        const mine =
          plan.kind === 'instance' ? instanceSubtree(canvas, plan.instanceId) : canvas;
        const view = plan.kind === 'instance' ? plan.component : 'Home';
        const width =
          plan.kind === 'instance' ? (mine['root']?.w ?? rootWidth ?? 0) : (rootWidth ?? 0);
        expect(Object.keys(mine).length, 'the canvas measured the subtree').toBeGreaterThan(0);
        const theirs = await measureUrlInBrowser(browser, `${server.url}/_views/${view}`, {
          width: Math.round(width),
          height: 900,
        });
        const divergences = compareGeometry(mine, theirs, TOLERANCE_PX);
        expect(
          divergences,
          divergences.length === 0
            ? ''
            : `canvas and scamp dev disagree for "${fixture.name}":\n${describeDivergences(divergences)}\n\n${fixture.why}`
        ).toEqual([]);
      } finally {
        await browser.close();
        await server.close();
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });
}

// Measure a React import, route by route.
//
//   node scripts/react-import-eval.mjs <react-project-dir | http://url> [/route …]
//
// Given a folder, reads it the way the app will (`detect.ts`), starts its
// dev server on a free port, and stops it after. Given a URL, uses the
// server already running there. Routes come from the running app's own
// router (`reactRoutes.ts`); name routes after the target to measure only
// those, with params filled in (`/patients/1001`).
//
// Per route: did it render as itself or redirect, pixel match through the
// shared harness, findings per element, and whether the view survives the
// generateCode → parseCode round trip. And what Phase 3 and 4 will have to
// work with, read from React's fiber tree: the user components that drew
// the page, and the sibling groups one `.map()` call site drew.
//
// Env:
//   TOKENS=1   import with the app's own tokens (Create theme tokens)
//   SRC=dir    the app's folder, for list names, when the target is a URL
//   OUT=dir    screenshots (default .pixels-tmp/react)
//   TOP=n      diff clusters listed per route (default 3)
//
// Results go to .react-eval/results-<time>.json.
// see docs/plans/react-import-plan.md

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

import {
  VIEWPORT,
  bundleOf,
  cleanupHarness,
  compareShots,
  measurePage,
  renderView,
  repoRoot,
} from './lib/pixelHarness.mjs';
import { planProject, startDevServer } from './lib/reactImportPipeline.mjs';

const TOP = Number(process.env.TOP ?? 3);
const OUT = resolve(repoRoot, process.env.OUT ?? '.pixels-tmp/react');
const RESULTS = join(repoRoot, '.react-eval');

const [target, ...routeArgs] = process.argv.slice(2);
if (target === undefined) {
  console.error('usage: node scripts/react-import-eval.mjs <react-project-dir | url> [/route …]');
  process.exit(1);
}

const { readRoutesFn, flattenRoutes, selectedByDefault } = await bundleOf('src/shared/reactRoutes.ts');
const { lintView } = await bundleOf('src/renderer/lib/viewLint.ts');
const { parseCode } = await bundleOf('src/renderer/lib/parseCode.ts');
const { generateCode } = await bundleOf('src/renderer/lib/generateCode.ts');

// ---- what React's tree says about a page ---------------------------------

/**
 * Run in the page. For each element, the JSX call site that created it
 * and the component whose render that was — user code only, by URL.
 * Phase 3 moves this into the capture; here it only counts.
 */
const reactTreeFn = () => {
  const fiberOf = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    return key === undefined ? null : el[key];
  };
  const nameOf = (type) =>
    typeof type === 'function'
      ? type.displayName || type.name || null
      : type && typeof type === 'object'
        ? type.displayName || type.render?.displayName || type.render?.name || type.type?.displayName || type.type?.name || null
        : null;
  // The first stack frame outside React's runtime and node_modules.
  const siteOf = (fiber) => {
    const stack = fiber?._debugStack?.stack;
    if (typeof stack !== 'string') return null;
    for (const line of stack.split('\n').slice(1)) {
      const m = line.match(/\(?(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/);
      if (!m) continue;
      if (m[1].includes('/node_modules/')) continue;
      return `${new URL(m[1]).pathname.replace(/\?.*$/, '')}:${m[2]}:${m[3]}`;
    }
    return null;
  };

  let elements = 0;
  let withFiber = 0;
  let userSited = 0;
  const components = {};
  const groups = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    elements += 1;
    const fiber = fiberOf(el);
    if (fiber === null) continue;
    withFiber += 1;
    const site = siteOf(fiber);
    if (site === null) continue;
    userSited += 1;
    const owner = nameOf(fiber._debugOwner?.type) ?? '(anonymous)';
    components[owner] = (components[owner] ?? 0) + 1;
    // Siblings from one call site: a `.map()` (or a component used twice in a row).
    const parent = el.parentElement;
    if (parent === null) continue;
    const key = `${site}`;
    let byParent = groups.get(parent);
    if (byParent === undefined) groups.set(parent, (byParent = new Map()));
    byParent.set(key, (byParent.get(key) ?? 0) + 1);
  }
  const repeats = [];
  for (const byParent of groups.values()) {
    for (const [site, count] of byParent) if (count >= 2) repeats.push({ site, count });
  }
  return { elements, withFiber, userSited, components, repeats };
};

// ---- the run -----------------------------------------------------------

const isUrl = /^https?:\/\//.test(target);
const server = isUrl
  ? { base: new URL(target).origin, stop: () => {}, project: null }
  : await startDevServer(resolve(target));

const browser = await chromium.launch();
// One context for every route, as the import window keeps one session:
// a sign-in or a finished setup carries from route to route.
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const results = [];
/** What the component pass needs from each measured route. */
const captured = [];

try {
  const first = await context.newPage();
  await first.goto(server.base + '/', { waitUntil: 'networkidle', timeout: 60_000 });
  const raw = await first.evaluate((src) => new Function(`return (${src})`)()(), readRoutesFn.toString());
  await first.close();
  const routes = raw === null ? [] : flattenRoutes(raw);
  console.log(
    raw === null
      ? 'routes: no router found in the page'
      : `routes: ${routes.length} in the app's router, ${routes.filter(selectedByDefault).length} visitable as they stand`
  );

  const chosen = routeArgs.length > 0 ? routeArgs : routes.filter(selectedByDefault).map((r) => r.path);
  if (chosen.length === 0) throw new Error('no routes to measure: name some after the target');

  for (const route of chosen) {
    const page = await context.newPage();
    const row = { route };
    try {
      await page.goto(server.base + route, { waitUntil: 'networkidle', timeout: 60_000 });
      const landed = new URL(page.url()).pathname;
      if (landed !== route) {
        row.redirectedTo = landed;
        console.log(`\n${route}  → redirected to ${landed}, not measured`);
        continue;
      }
      const tree = await page.evaluate((src) => new Function(`return (${src})`)()(), reactTreeFn.toString());
      const m = await measurePage(browser, page, { label: route, outDir: OUT, tokens: process.env.TOKENS === '1' });

      captured.push({ route, row, measured: m });
      const elementCount = Object.keys(m.reduced.elements).length - 1;
      // Linted against the theme the view is rendered with: with the app's
      // tokens, every one it references is declared there.
      const themeTokens = (m.tokenMerge?.theme.tokens ?? []).map((t) => t.name);
      const findings = lintView({ elements: m.reduced.elements, rootId: m.reduced.rootId, themeTokens });
      // The view as the app opens it: written as a component, read back as
      // a view, saved like a page. see scripts/agent-cleanup-eval.mjs
      const opened = parseCode(m.code.tsx, m.code.css, { isComponent: false });
      const once = generateCode({ elements: opened.elements, rootId: opened.rootId, pageName: 'Imported', cssModuleImportName: 'Imported', isComponent: false });
      const reparsed = parseCode(once.tsx, once.css, { isComponent: false });
      const twice = generateCode({ elements: reparsed.elements, rootId: reparsed.rootId, pageName: 'Imported', cssModuleImportName: 'Imported', isComponent: false });

      Object.assign(row, {
        pixels: m.pct,
        heights: { source: m.source.height, imported: m.imported.height },
        elements: elementCount,
        findings: findings.length,
        findingsPerElement: elementCount === 0 ? 0 : findings.length / elementCount,
        findingsByKind: findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {}),
        roundTrip: once.tsx === twice.tsx && once.css === twice.css,
        tokenRefs: (m.code.css.match(/var\(--/g) ?? []).length,
        tokensAdded: m.tokenMerge?.added.length ?? 0,
        tokenConflicts: m.tokenMerge?.conflicts ?? [],
        react: {
          fiberCoverage: tree.elements === 0 ? 0 : tree.withFiber / tree.elements,
          userSited: tree.userSited,
          components: tree.components,
          repeatGroups: tree.repeats.length,
          repeatedElements: tree.repeats.reduce((n, r) => n + r.count, 0),
        },
        clusters: m.clusters.slice(0, TOP).map((c) => ({ pixels: c.pixels, at: `${c.x},${c.y}`, size: `${c.w}x${c.h}`, element: c.element })),
      });

      console.log(`\n${route}`);
      console.log(
        `  ${m.pct.toFixed(2)}% pixels · ${elementCount} elements · ${(row.findingsPerElement).toFixed(2)} findings/element · round trip ${row.roundTrip ? 'ok' : 'BROKEN'}` +
          (m.source.height === m.imported.height ? '' : ` · height ${m.source.height} → ${m.imported.height}`)
      );
      console.log(
        `  react: ${Object.keys(tree.components).length} components, ${tree.repeats.length} repeat groups (${row.react.repeatedElements} elements), fibers on ${(100 * row.react.fiberCoverage).toFixed(0)}% of elements`
      );
      for (const c of row.clusters) console.log(`    ${String(c.pixels).padStart(8)}px  ${c.size.padEnd(11)} at ${c.at.padEnd(11)} ${c.element ?? ''}`);
    } catch (err) {
      row.error = err.message.slice(0, 300);
      console.log(`\n${route}\n  FAILED: ${row.error}`);
    } finally {
      results.push(row);
      await page.close();
    }
  }

  // ---- components across the views (Phase 3) ----------------------------
  if (captured.length > 0) {
    const sourceDir = isUrl ? process.env.SRC : resolve(target);
    const { plan, repeated, components } = await planProject(captured, sourceDir);
    const fontElements = Object.assign({}, ...plan.views.map((v) => v.elements), ...plan.components.map((c) => c.elements));
    // The code itself, for reading when a number looks wrong.
    const codeDir = join(OUT, 'code');
    await mkdir(codeDir, { recursive: true });
    for (const c of components) {
      await writeFile(join(codeDir, `${c.name}.tsx`), c.tsx);
      await writeFile(join(codeDir, `${c.name}.module.css`), c.css);
    }
    for (const [i, { route, row, measured }] of captured.entries()) {
      const codeDir = join(OUT, 'code');
      const view = plan.views[i];
      try {
        const code = generateCode({ elements: view.elements, rootId: view.rootId, pageName: view.name, cssModuleImportName: view.name, isComponent: true });
        await writeFile(join(codeDir, `view-${view.name}.tsx`), code.tsx);
        await writeFile(join(codeDir, `view-${view.name}.module.css`), code.css);
        const { importPng, importedRects } = await renderView(browser, { ...code, components, fontElements, themeCss: measured.themeCss });
        const after = await compareShots({
          sourcePng: measured.sourcePng,
          importPng,
          masks: measured.masks,
          importedRects,
          label: `${route}-components`,
          outDir: OUT,
        });
        row.withComponents = { pixels: after.pct, elements: Object.keys(view.elements).length - 1 };
      } catch (err) {
        row.withComponents = { error: err.message.slice(0, 200) };
      }
    }
    results.repeatPlan = repeated;
    results.componentPlan = {
      components: plan.components.map((c) => ({ name: c.name, instances: c.instances, views: c.views.length, props: c.props, elements: Object.keys(c.elements).length })),
      findings: plan.findings,
    };
  }
} finally {
  await browser.close();
  server.stop();
  await cleanupHarness();
}

// ---- summary ------------------------------------------------------------

const measured = results.filter((r) => typeof r.pixels === 'number');
const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
// A component worth a Scamp component is one more than one page draws.
const routesPerComponent = {};
for (const r of measured) for (const name of Object.keys(r.react.components)) routesPerComponent[name] = (routesPerComponent[name] ?? 0) + 1;
const shared = Object.entries(routesPerComponent)
  .filter(([, n]) => n >= 2)
  .sort((a, b) => b[1] - a[1]);

const summary = {
  target,
  routes: results.length,
  measured: measured.length,
  redirected: results.filter((r) => r.redirectedTo !== undefined).map((r) => `${r.route} → ${r.redirectedTo}`),
  failed: results.filter((r) => r.error !== undefined).map((r) => r.route),
  meanPixels: mean(measured.map((r) => r.pixels)),
  minPixels: measured.length === 0 ? 0 : Math.min(...measured.map((r) => r.pixels)),
  meanFindingsPerElement: mean(measured.map((r) => r.findingsPerElement)),
  roundTripBroken: measured.filter((r) => !r.roundTrip).map((r) => r.route),
  sharedComponents: shared.length,
  repeatGroups: measured.reduce((n, r) => n + r.react.repeatGroups, 0),
  components: results.componentPlan?.components ?? [],
  componentFindings: results.componentPlan?.findings ?? [],
  elementsBefore: measured.reduce((n, r) => n + r.elements, 0),
  elementsAfter:
    measured.reduce((n, r) => n + (r.withComponents?.elements ?? r.elements), 0) +
    (results.componentPlan?.components ?? []).reduce((n, c) => n + c.elements, 0),
  meanPixelsWithComponents: mean(measured.map((r) => r.withComponents?.pixels).filter((p) => typeof p === 'number')),
  repeats: results.repeatPlan ?? null,
  tokenRefs: measured.reduce((n, r) => n + (r.tokenRefs ?? 0), 0),
  tokensPerRoute: mean(measured.map((r) => r.tokensAdded ?? 0)),
};

console.log('\n— summary —');
console.log(`  ${summary.measured} of ${summary.routes} routes measured`);
if (summary.redirected.length > 0) console.log(`  redirected: ${summary.redirected.join(', ')}`);
if (summary.failed.length > 0) console.log(`  failed: ${summary.failed.join(', ')}`);
console.log(`  pixels: mean ${summary.meanPixels.toFixed(2)}%, lowest ${summary.minPixels.toFixed(2)}%`);
console.log(`  findings per element: mean ${summary.meanFindingsPerElement.toFixed(2)}`);
if (process.env.TOKENS === '1') {
  console.log(`  tokens: ${summary.tokenRefs} var() references across the views; ${summary.tokensPerRoute.toFixed(1)} tokens per route`);
}
console.log(`  round trip: ${summary.roundTripBroken.length === 0 ? 'ok on every route' : `BROKEN on ${summary.roundTripBroken.join(', ')}`}`);
console.log(`  components drawn on 2+ routes: ${shared.length}${shared.length > 0 ? ` — ${shared.slice(0, 8).map(([n, c]) => `${n} (${c})`).join(', ')}` : ''}`);
console.log(`  repeat groups (one call site, 2+ siblings): ${summary.repeatGroups}`);
console.log(`\n  components made: ${summary.components.length}`);
for (const c of summary.components.slice(0, 15)) {
  console.log(`    ${c.name.padEnd(24)} ${String(c.instances).padStart(4)} copies in ${c.views} views, ${c.elements} elements${c.props.length > 0 ? `, props ${c.props.join(', ')}` : ''}`);
}
if (summary.components.length > 15) console.log(`    … and ${summary.components.length - 15} more`);
const byKind = summary.componentFindings.reduce((acc, f) => ({ ...acc, [f.kind]: [...(acc[f.kind] ?? []), f] }), {});
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`  ${kind}: ${list.length} — ${list.slice(0, 6).map((f) => `${f.component} (${f.detail.slice(0, 60)})`).join('; ')}`);
}
if (summary.repeats !== null) {
  console.log(
    `  repeats: ${summary.repeats.repeats} lists, ${summary.repeats.rows} rows; ${summary.repeats.skipped} lists kept as copies (rows look different)`
  );
  if (summary.repeats.examples.length > 0) console.log(`    e.g. ${summary.repeats.examples.join('; ')}`);
  console.log(`    kept because rows differ in: ${JSON.stringify(summary.repeats.why)}`);
}
console.log(`  elements in the project: ${summary.elementsBefore} → ${summary.elementsAfter}`);
console.log(`  pixels with components: mean ${summary.meanPixelsWithComponents.toFixed(2)}% (was ${summary.meanPixels.toFixed(2)}%)`);
const worse = measured.filter((r) => typeof r.withComponents?.pixels === 'number' && r.withComponents.pixels < r.pixels - 0.5);
if (worse.length > 0) console.log(`  routes that lost more than half a point: ${worse.map((r) => `${r.route} ${r.pixels.toFixed(1)} → ${r.withComponents.pixels.toFixed(1)}`).join(', ')}`);

await mkdir(RESULTS, { recursive: true });
const file = join(RESULTS, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(file, JSON.stringify({ summary, results }, null, 2), 'utf-8');
console.log(`\nResults: ${file}`);
process.exit(0);

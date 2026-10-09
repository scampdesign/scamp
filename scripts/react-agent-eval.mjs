// Measure the React import's AI pass (the `react-import` skill), view by view.
//
//   node scripts/react-agent-eval.mjs <react-project-dir | url> [/route …]
//     [--provider scripted|anthropic] [--max-usd 5] [--views Patients,Claims]
//
// Imports the routes the way the app does — capture with the app's tokens,
// components, repeats, list names from the source — then runs the skill
// on each view in a headless canvas: a plan turn, then "go ahead". The
// skill reads the app's source through the same `sourceFor` main uses.
//
// What it reports, before → after, per view: show conditions, lists and
// their generic names (`items`, `text2`), pixels against the source page,
// findings per element, the round trip, edits, and cost. The scripted
// provider runs the whole pipeline for nothing; `--provider anthropic`
// spends real money on ANTHROPIC_API_KEY, capped by --max-usd.
//
// Given a URL, SRC=dir names the app's folder, for the source.
// Results go to .react-eval/agent-<time>.json.
// see docs/plans/react-import-plan.md, Phase 6

import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { VIEWPORT, bundleOf, cleanupHarness, compareShots, measurePage, renderView, repoRoot } from './lib/pixelHarness.mjs';
import { planProject, startDevServer } from './lib/reactImportPipeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const [target, ...routeArgs] = positional;
const providerKind = option('provider', 'scripted');
const maxUsd = Number(option('max-usd', '5'));
const viewFilter = option('views', '').split(',').filter((v) => v.length > 0);
const OUT = join(repoRoot, '.pixels-tmp', 'react-agent');

if (target === undefined) {
  console.error('usage: node scripts/react-agent-eval.mjs <react-project-dir | url> [/route …] [--provider anthropic --max-usd 5]');
  process.exit(1);
}
if (providerKind === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  console.error('--provider anthropic needs ANTHROPIC_API_KEY set.');
  process.exit(1);
}
if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
  console.error('--max-usd must be a positive number.');
  process.exit(1);
}

// The app's own agent code, bundled from the TypeScript sources.
const tmpDir = join(repoRoot, '.react-eval', 'bundle');
await mkdir(tmpDir, { recursive: true });
const bundled = await build({
  entryPoints: [join(here, 'agent-eval', 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  write: false,
  alias: { '@shared': join(repoRoot, 'src/shared'), '@lib': join(repoRoot, 'src/renderer/lib') },
});
const entryFile = join(tmpDir, 'entry.mjs');
await writeFile(entryFile, bundled.outputFiles[0].text, 'utf-8');
const app = await import(pathToFileURL(entryFile).href);
const { lintView } = await bundleOf('src/renderer/lib/viewLint.ts');

// Claude Opus 5.5, per million tokens — the same table as agent-cleanup-eval.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
let spent = 0;
let lastCallCost = 0;
const costOf = (u) =>
  ((u.input_tokens ?? 0) * PRICE.input +
    (u.output_tokens ?? 0) * PRICE.output +
    (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
  1_000_000;

const providerFor = (viewName) => {
  if (providerKind === 'scripted') {
    // Read the source, plan, then finish without edits: every measure runs,
    // and after should equal before.
    return app.createScriptedProvider([
      { content: [{ type: 'tool_use', name: 'scamp_get_react_source', input: { target: viewName } }] },
      { content: [{ type: 'text', text: 'Plan: nothing to change in this scripted run. Go ahead?' }] },
      { content: [{ type: 'text', text: 'Done — no changes.' }] },
    ]);
  }
  const inner = app.createAnthropicProvider(process.env.ANTHROPIC_API_KEY);
  return {
    streamTurn: async (request, callbacks) => {
      if (spent + lastCallCost >= maxUsd) throw new Error(`budget of $${maxUsd} reached`);
      const message = await inner.streamTurn(request, callbacks);
      lastCallCost = costOf(message.usage);
      spent += lastCallCost;
      return message;
    },
  };
};

/** Generic names a tidy-up should replace: `items`, `texts2`, `text3`, `value`. */
const GENERIC = /^(items?|texts?\d*|values?\d*|rows?\d*|list\d*|index|[a-z]+?\d+)$/;

const measureTree = (elements, rootId, themeTokens) => {
  const all = Object.values(elements);
  const repeats = all.filter((e) => e.repeat !== undefined);
  const rows = elements[rootId]?.samples ?? {};
  const names = repeats.flatMap((e) => {
    const sample = rows[e.repeat.over];
    const fields = Array.isArray(sample) ? Object.keys(sample[0] ?? {}) : [];
    return [e.repeat.over, ...fields];
  });
  const findings = lintView({ elements, rootId, themeTokens });
  return {
    elements: all.length - 1,
    shows: all.filter((e) => e.showIf !== undefined).length,
    lists: repeats.length,
    genericNames: names.filter((n) => GENERIC.test(n)).length,
    findingsPerElement: all.length <= 1 ? 0 : findings.length / (all.length - 1),
    lists_: repeats.map((e) => e.repeat.over),
  };
};

// ---- import the routes, as the app does --------------------------------

const isUrl = /^https?:\/\//.test(target);
const sourceDir = isUrl ? process.env.SRC : resolve(target);
const server = isUrl ? { base: new URL(target).origin, stop: () => {} } : await startDevServer(resolve(target));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const routes = routeArgs.length > 0 ? routeArgs : ['/patients', '/intake', '/history', '/billing', '/tools/licenses'];
const captured = [];
const results = [];

try {
  for (const route of routes) {
    const page = await context.newPage();
    try {
      await page.goto(server.base + route, { waitUntil: 'networkidle', timeout: 60_000 });
      if (new URL(page.url()).pathname !== route) {
        console.log(`${route}: redirected, skipped`);
        continue;
      }
      const measured = await measurePage(browser, page, { label: route, outDir: OUT, tokens: true });
      captured.push({ route, measured });
    } finally {
      await page.close();
    }
  }
  const { plan, components } = await planProject(captured, sourceDir);

  // The record main keeps: every element's source line, and the app's folder.
  const sitesOf = (elements, react) =>
    Object.fromEntries(Object.entries(react).flatMap(([id, info]) => (info.site !== undefined && id in elements ? [[id, info.site]] : [])));
  const record = {
    version: 1,
    app: { name: 'eval', folder: sourceDir ?? null },
    views: Object.fromEntries(plan.views.map((v) => [v.name, { sites: sitesOf(v.elements, v.react) }])),
    components: Object.fromEntries(plan.components.map((c) => [c.name, { sites: sitesOf(c.elements, c.react) }])),
  };
  const fontElements = Object.assign({}, ...plan.views.map((v) => v.elements), ...plan.components.map((c) => c.elements));
  const componentFiles = Object.fromEntries(components.map((c) => [c.name, { tsx: c.tsx, css: c.css }]));
  const skill = app.reactImportSkill();
  const tools = [...app.agentToolsFrom(app.TOOL_DESCRIPTORS), ...app.WRITE_TOOLS];

  for (const [i, view] of plan.views.entries()) {
    if (viewFilter.length > 0 && !viewFilter.includes(view.name)) continue;
    const { route, measured } = captured[i];
    const themeTokens = (measured.tokenMerge?.theme.tokens ?? []).map((t) => t.name);
    // The view as the app opens it: written as a component, read back as a view.
    const written = app.generateCode({ elements: view.elements, rootId: view.rootId, pageName: view.name, cssModuleImportName: view.name, isComponent: true });
    const opened = app.parseCode(written.tsx, written.css, { isComponent: false });
    const initial = { elements: opened.elements, rootId: opened.rootId, themeCss: measured.themeCss, components: componentFiles };

    const pixelsOf = async (elements, rootId, label) => {
      const code = app.generateCode({ elements, rootId, pageName: view.name, cssModuleImportName: view.name, isComponent: false });
      const { importPng, importedRects } = await renderView(browser, { ...code, components, fontElements, themeCss: measured.themeCss });
      return (await compareShots({ sourcePng: measured.sourcePng, importPng, masks: measured.masks, importedRects, label, outDir: OUT })).pct;
    };
    const before = { ...measureTree(initial.elements, initial.rootId, themeTokens), pixels: await pixelsOf(initial.elements, initial.rootId, `${route}-before`) };

    const canvas = app.createHeadlessCanvas(
      { ...initial, elements: { ...initial.elements } },
      { viewName: view.name, reactSource: (t, element) => app.sourceFor(record, t, element) }
    );
    const provider = providerFor(view.name);
    let history = [];
    let edits = 0;
    const outcomes = [];
    const spentBefore = spent;
    const turns = [
      { text: `Tidy up ${view.name}, which I imported from the React app.`, systemNote: skill.instructions },
      { text: 'Go ahead with the whole plan.' },
    ];
    try {
      for (const turn of turns) {
        const result = await app.runTurn({
          provider,
          system: app.AGENT_SYSTEM_PROMPT,
          tools: skill.tools(tools),
          invoke: async (name, input) =>
            skill.allows(name) ? canvas.invoke(name, input) : { content: [{ type: 'text', text: `${name} is off for this session.` }], isError: true },
          history,
          userContent: `[Scamp: View: ${view.name} · Nothing selected]\n\n${turn.text}`,
          effort: skill.effort,
          signal: new AbortController().signal,
          emit: (event) => {
            if (event.kind === 'tool-end' && event.ok && event.summary !== undefined) edits += 1;
          },
          review: async () => true,
          maxSteps: 40,
          ...(turn.systemNote !== undefined ? { systemNote: turn.systemNote } : {}),
        });
        history = result.history;
        outcomes.push(result.outcome === 'error' ? `error: ${result.message}` : result.outcome);
        if (result.outcome === 'error') break;
      }
    } catch (err) {
      outcomes.push(`stopped: ${err.message}`);
    }
    const state = canvas.state();
    const after = { ...measureTree(state.elements, state.rootId, themeTokens), pixels: await pixelsOf(state.elements, state.rootId, `${route}-after`) };
    const again = app.generateCode({ elements: state.elements, rootId: state.rootId, pageName: view.name, cssModuleImportName: view.name, isComponent: false });
    const reparsed = app.parseCode(again.tsx, again.css, { isComponent: false });
    const third = app.generateCode({ elements: reparsed.elements, rootId: reparsed.rootId, pageName: view.name, cssModuleImportName: view.name, isComponent: false });
    const row = {
      view: view.name,
      route,
      skillVersion: skill.version,
      model: providerKind === 'anthropic' ? app.AGENT_MODEL : 'scripted',
      outcomes,
      edits,
      cost: spent - spentBefore,
      roundTrip: again.tsx === third.tsx && again.css === third.css,
      before,
      after,
    };
    results.push(row);
    await mkdir(join(OUT, 'code'), { recursive: true });
    await writeFile(join(OUT, 'code', `${view.name}.after.tsx`), again.tsx);
    console.log(`\n${view.name} (${route}) — ${outcomes.join(', ')}, ${edits} edits, $${row.cost.toFixed(2)}`);
    console.log(`  show conditions  ${before.shows} → ${after.shows}`);
    console.log(`  generic names    ${before.genericNames} → ${after.genericNames}   (lists: ${after.lists_.join(', ') || 'none'})`);
    console.log(`  pixels           ${before.pixels.toFixed(2)}% → ${after.pixels.toFixed(2)}%`);
    console.log(`  findings/element ${before.findingsPerElement.toFixed(2)} → ${after.findingsPerElement.toFixed(2)} · round trip ${row.roundTrip ? 'ok' : 'BROKEN'}`);
  }
} finally {
  await browser.close();
  server.stop();
  await cleanupHarness();
}

await mkdir(join(repoRoot, '.react-eval'), { recursive: true });
const file = join(repoRoot, '.react-eval', `agent-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(file, JSON.stringify({ provider: providerKind, maxUsd, spent, results }, null, 2), 'utf-8');
console.log(`\nSpent $${spent.toFixed(2)} of $${maxUsd}. Results: ${file}`);
process.exit(0);

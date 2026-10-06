// Measure the Scamp Agent's import cleanup against the page it came from.
//
//   node scripts/agent-cleanup-eval.mjs                      scripted, free — proves the harness
//   node scripts/agent-cleanup-eval.mjs --provider anthropic --max-usd 5
//
// Options: --pages a,b (default: every page in scripts/agent-eval/pages)
//          --modes keep-literal,create-tokens (default: both)
//          --max-usd N  the most the whole run may spend (default 5). Checked
//                       before every model call, so it stops short of the cap.
//
// For each page: capture it in Chromium exactly as the importer does,
// reduce it, then run the cleanup skill on the agent's headless canvas —
// the app's own tools and edits, in Node — and measure before and after:
//
//   findings per element  Scamp's own checks (lintView). Must fall.
//   pixels                the rendered page against the source. Must hold.
//   geometry              surviving elements within 2px of the source. Must hold.
//   round-trip            generate → parse → generate is stable. Must hold.
//   tokens                keep-literal leaves theme.css alone; create-tokens
//                         leaves no undeclared token.
//
// Confirmations are approved automatically and counted. Every run spends
// real money on a real key with --provider anthropic; the scripted
// provider runs the whole pipeline for nothing.
// see docs/plans/builtin-agent-plan.md

import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import sharp from 'sharp';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tmpDir = join(root, '.agent-eval');
const pagesDir = join(here, 'agent-eval', 'pages');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const providerKind = option('provider', 'scripted');
const maxUsd = Number(option('max-usd', '5'));
const modes = option('modes', 'keep-literal,create-tokens').split(',');
const pageFilter = option('pages', '');

if (providerKind === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  console.error('--provider anthropic needs ANTHROPIC_API_KEY set.');
  process.exit(1);
}
if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
  console.error('--max-usd must be a positive number.');
  process.exit(1);
}

await mkdir(tmpDir, { recursive: true });
const bundled = await build({
  entryPoints: [join(here, 'agent-eval', 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  write: false,
  alias: { '@shared': join(root, 'src/shared'), '@lib': join(root, 'src/renderer/lib') },
});
const entryFile = join(tmpDir, 'entry.mjs');
await writeFile(entryFile, bundled.outputFiles[0].text, 'utf-8');
const app = await import(pathToFileURL(entryFile).href);

// Claude Opus 5.5, per million tokens.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
let spent = 0;
// The last call's cost stands in for the next one's, so the run stops
// before a call that would cross the cap, not after it.
let lastCallCost = 0;
const costOf = (u) =>
  (u.inputTokens * PRICE.input +
    u.outputTokens * PRICE.output +
    u.cacheWriteTokens * PRICE.cacheWrite +
    u.cacheReadTokens * PRICE.cacheRead) /
  1_000_000;

class BudgetReached extends Error {}

/** The provider, behind the spending cap. */
const providerFor = () => {
  if (providerKind === 'scripted') {
    // Reads, then a plan, then a no-op finish: every measurement runs,
    // and after should equal before.
    return app.createScriptedProvider([
      { content: [{ type: 'tool_use', name: 'scamp_check_view', input: { name: 'Imported' } }] },
      { content: [{ type: 'text', text: 'Plan: nothing to change in this scripted run. Go ahead?' }] },
      { content: [{ type: 'text', text: 'Done — no changes.' }] },
    ]);
  }
  const inner = app.createAnthropicProvider(process.env.ANTHROPIC_API_KEY);
  return {
    streamTurn: async (request, callbacks) => {
      if (spent + lastCallCost >= maxUsd) throw new BudgetReached(`budget of $${maxUsd} reached`);
      const message = await inner.streamTurn(request, callbacks);
      lastCallCost = costOf({
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      });
      spent += costOf({
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      });
      return message;
    },
  };
};

const VIEWPORT = { width: 1440, height: 900 };
const CHANNEL_TOLERANCE = 8;

const browser = await chromium.launch();

/** The page as the importer captures it, plus a screenshot of the source. */
const capture = async (url) => {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate((src) => new Function(`return (${src})`)()(), app.prepareFn.toString());
  const payload = await page.evaluate(
    ([src, policy]) => new Function(`return (${src})`)()(policy),
    [app.captureFn.toString(), { ...app.capturePolicy(), includeRects: true }]
  );
  const shot = await page.screenshot({ fullPage: true });
  const html = await page.content();
  const css = await page.evaluate(() =>
    Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n')
  );
  await page.close();
  return { payload, shot, html, css };
};

/** Render a model the way Scamp exports it; screenshot and measure it. */
const render = async ({ elements, rootId, themeCss, components }) => {
  const { tsx, css } = app.generateCode({ elements, rootId, pageName: 'Imported', cssModuleImportName: 'Imported', isComponent: true });
  const exported = app.buildHtmlExport({
    projectName: 'eval',
    pages: [{ name: 'imported', tsxContent: tsx, cssContent: css }],
    components: Object.entries(components).map(([name, f]) => ({ name, tsxContent: f.tsx, cssContent: f.css })),
    themeCss,
  });
  const html = exported.files.find((f) => f.path.endsWith('.html'))?.contents ?? '';
  const sheets = exported.files.filter((f) => f.path.endsWith('.css')).map((f) => f.contents).join('\n');
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.setContent(html.replace('</head>', `<style>${sheets}</style></head>`), { waitUntil: 'networkidle' });
  const rects = await page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[class]')) {
      const cls = Array.from(el.classList).find((c) => /_[0-9a-f]{4}$/.test(c));
      if (!cls) continue;
      const b = el.getBoundingClientRect();
      out[cls] = { w: b.width, h: b.height };
    }
    return out;
  });
  const shot = await page.screenshot({ fullPage: true });
  await page.close();
  return { tsx, css, rects, shot };
};

const pixelMatch = async (a, b) => {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const w = Math.min(ma.width, mb.width);
  const h = Math.min(ma.height, mb.height);
  const raw = (png) => sharp(png).extract({ left: 0, top: 0, width: w, height: h }).ensureAlpha().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  let same = 0;
  for (let i = 0; i < ra.length; i += 4) {
    if (
      Math.abs(ra[i] - rb[i]) <= CHANNEL_TOLERANCE &&
      Math.abs(ra[i + 1] - rb[i + 1]) <= CHANNEL_TOLERANCE &&
      Math.abs(ra[i + 2] - rb[i + 2]) <= CHANNEL_TOLERANCE
    ) same += 1;
  }
  // A page that changed height is a mismatch too: count the rows one has
  // and the other doesn't as differing.
  const total = Math.max(ma.width, mb.width) * Math.max(ma.height, mb.height);
  return same / total;
};

const flatten = (node, out = []) => {
  out.push(node);
  node.children.forEach((c) => flatten(c, out));
  return out;
};

/** Every number this eval reports for one state of the page. */
const measure = async (state, source, sourceNodes) => {
  const elementCount = Object.keys(state.elements).length - 1;
  const tokenNames = app.parseThemeFile(state.themeCss).tokens.map((t) => t.name);
  const findings = app.lintView({ elements: state.elements, rootId: state.rootId, themeTokens: tokenNames });
  const rendered = await render(state);
  const reparsed = app.parseCode(rendered.tsx, rendered.css, { isComponent: true });
  const again = app.generateCode({ elements: reparsed.elements, rootId: reparsed.rootId, pageName: 'Imported', cssModuleImportName: 'Imported', isComponent: true });
  const sourceById = new Map(flatten(source.payload.root).map((n) => [n.id, n]));
  let compared = 0;
  let within = 0;
  for (const [id, el] of Object.entries(state.elements)) {
    if (id === state.rootId) continue;
    const src = sourceById.get(sourceNodes[id]);
    const got = rendered.rects[app.classNameFor(el)];
    if (!src?.rect || !got) continue;
    compared += 1;
    if (Math.abs(src.rect.w - got.w) <= 2 && Math.abs(src.rect.h - got.h) <= 2) within += 1;
  }
  return {
    elements: elementCount,
    findings: findings.length,
    findingsPerElement: elementCount === 0 ? 0 : findings.length / elementCount,
    undeclaredTokens: findings.filter((f) => f.kind === 'undeclared-token').length,
    // Which kinds are left is what says what the skill should do next.
    findingsByKind: findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {}),
    // The finding lines themselves, for reading against the source.
    findingDetails: findings.map((f) => `${f.className ?? ''}: ${f.message}`),
    code: { tsx: rendered.tsx, css: rendered.css },
    pixels: await pixelMatch(source.shot, rendered.shot),
    geometry: compared === 0 ? 1 : within / compared,
    geometryCompared: compared,
    roundTrip: again.tsx === rendered.tsx && again.css === rendered.css,
    tokens: tokenNames.length,
  };
};

const pages = (await readdir(pagesDir))
  .filter((f) => f.endsWith('.html'))
  .filter((f) => pageFilter === '' || pageFilter.split(',').includes(f.replace(/\.html$/, '')));

const tools = [
  ...app.agentToolsFrom(app.TOOL_DESCRIPTORS),
  ...[...app.WRITE_TOOLS].sort((a, b) => a.name.localeCompare(b.name)),
];
const results = [];

outer: for (const file of pages) {
  const url = pathToFileURL(join(pagesDir, file)).href;
  const source = await capture(url);
  const reduced = app.reduceCapture(source.payload);
  const initial = { elements: reduced.elements, rootId: reduced.rootId, themeCss: app.DEFAULT_THEME_CSS, components: {} };
  const before = await measure(initial, source, reduced.sourceNodes);

  for (const mode of modes) {
    if (spent + lastCallCost >= maxUsd) {
      console.log(`\nStopping: the $${maxUsd} budget is spent.`);
      break outer;
    }
    const skill = app.importCleanupSkill(mode);
    const canvas = app.createHeadlessCanvas(
      { ...initial, elements: { ...initial.elements } },
      { viewName: 'Imported', importSource: { url, html: source.html, css: source.css } }
    );
    const provider = providerFor();
    let history = [];
    let confirmations = 0;
    let edits = 0;
    const outcomes = [];
    const spentBefore = spent;
    const turns = [
      { text: 'Clean up this imported page.', systemNote: skill.instructions },
      { text: 'Go ahead with the whole plan.' },
    ];
    for (const turn of turns) {
      const result = await app.runTurn({
        provider,
        system: app.AGENT_SYSTEM_PROMPT,
        tools: skill.tools(tools),
        invoke: async (name, input) =>
          skill.allows(name)
            ? canvas.invoke(name, input)
            : { content: [{ type: 'text', text: `${name} is off for this session.` }], isError: true },
        history,
        userContent: `[Scamp: View: Imported · Nothing selected]\n\n${turn.text}`,
        effort: skill.effort,
        signal: new AbortController().signal,
        emit: (event) => {
          if (event.kind === 'tool-end' && event.ok && event.summary !== undefined) edits += 1;
        },
        review: async (calls) => {
          if (app.needsConfirmation(calls, { planApproved: skill.planApproved })) confirmations += 1;
          return true;
        },
        maxSteps: 40,
        ...(turn.systemNote !== undefined ? { systemNote: turn.systemNote } : {}),
      });
      history = result.history;
      outcomes.push(result.outcome === 'error' ? `error: ${result.message}` : result.outcome);
      if (result.outcome === 'error') break;
    }
    const after = await measure(canvas.state(), source, reduced.sourceNodes);
    const row = {
      page: file,
      mode,
      skillVersion: skill.version,
      model: providerKind === 'anthropic' ? app.AGENT_MODEL : 'scripted',
      outcomes,
      edits,
      confirmations,
      components: Object.keys(canvas.state().components),
      themeChanged: canvas.state().themeCss !== initial.themeCss,
      cost: spent - spentBefore,
      before,
      after,
    };
    results.push(row);
    // The cleaned page itself, to read beside the numbers.
    const slug = `${file.replace(/\.html$/, '')}-${mode}`;
    await writeFile(join(tmpDir, `${slug}.after.module.css`), after.code.css, 'utf-8');
    await writeFile(join(tmpDir, `${slug}.after.tsx`), after.code.tsx, 'utf-8');
    const pct = (n) => `${(n * 100).toFixed(1)}%`;
    console.log(`\n${file} · ${mode} · ${outcomes.join(' → ')}`);
    console.log(`  findings/element  ${before.findingsPerElement.toFixed(3)} → ${after.findingsPerElement.toFixed(3)}  (${before.findings} → ${after.findings})`);
    const kinds = [...new Set([...Object.keys(before.findingsByKind), ...Object.keys(after.findingsByKind)])];
    for (const kind of kinds) {
      console.log(`    ${kind.padEnd(22)} ${before.findingsByKind[kind] ?? 0} → ${after.findingsByKind[kind] ?? 0}`);
    }
    console.log(`  pixels            ${pct(before.pixels)} → ${pct(after.pixels)}`);
    console.log(`  geometry          ${pct(before.geometry)} → ${pct(after.geometry)}  (${after.geometryCompared} compared)`);
    console.log(`  round-trip        ${after.roundTrip ? 'ok' : 'BROKEN'}`);
    console.log(
      `  tokens            ${mode === 'keep-literal' ? (row.themeChanged ? 'theme.css CHANGED' : 'theme.css untouched') : `${before.tokens} → ${after.tokens}, ${after.undeclaredTokens} undeclared`}`
    );
    console.log(`  edits ${edits} · confirmations ${confirmations} · components ${row.components.join(', ') || 'none'} · $${row.cost.toFixed(2)}`);
  }
}

await browser.close();
const out = join(tmpDir, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(out, JSON.stringify({ provider: providerKind, maxUsd, spent, results }, null, 2), 'utf-8');
console.log(`\nSpent $${spent.toFixed(2)} of $${maxUsd}. Results: ${out}`);

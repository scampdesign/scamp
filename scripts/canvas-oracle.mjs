// Compare a page against how SCAMP'S CANVAS draws its import.
//
//   npm run build && node scripts/canvas-oracle.mjs https://example.com
//
// The third oracle. `import-fidelity.mjs` and `import-pixels.mjs` both
// render the import through `buildHtmlExport` — a plain document in a
// plain browser. That is not what a user looks at. The canvas is React
// components inside Electron with scoped CSS and theme tokens injected as
// custom properties, and a bug that lives only there is invisible to both.
//
// Three screenshots, two diffs:
//
//   source ↔ export   what the existing harnesses measure
//   source ↔ canvas   what the user actually sees
//   export ↔ canvas   THE CANVAS'S OWN CONTRIBUTION
//
// The third is the point. It holds the importer constant — both sides are
// generated from the same TSX and CSS — so anything it reports is the
// canvas renderer diverging from a browser, and nothing else.
//
// The reference is a real website in a real browser, which no Scamp code
// influences. That makes this a STRONGER oracle than the parity suite,
// whose fixtures are hand-written precisely because an oracle sharing
// code with the thing it checks can agree with it while both are wrong.
// see docs/notes/parity-harness.md
//
// Env:
//   TOP=n     clusters to list (default 10)
//   KEEP=1    leave the generated project on disk and print its path
//
// see docs/agent-native-review.md

import { projectTemplate } from 'scampjs/templates';
import { _electron as electron } from '@playwright/test';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import sharp from 'sharp';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bundleDir = join(root, '.pixels-tmp', 'oracle-bundles');
const outDir = join(root, '.pixels-tmp', 'shots');
const MAIN_ENTRY = join(root, 'out', 'main', 'index.js');

const bundleOf = async (entry) => {
  const out = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    write: false,
    alias: { '@shared': join(root, 'src/shared'), '@lib': join(root, 'src/renderer/lib') },
  });
  await mkdir(bundleDir, { recursive: true });
  const file = join(bundleDir, `${entry.replace(/[^a-z0-9]+/gi, '_')}.mjs`);
  await writeFile(file, out.outputFiles[0].text, 'utf-8');
  return import(pathToFileURL(file).href);
};

const { captureFn, capturePolicy, prepareFn } = await bundleOf('src/shared/captureScript.ts');
const { reduceCapture } = await bundleOf('src/renderer/lib/importReduce.ts');
const { generateCode } = await bundleOf('src/renderer/lib/generateCode.ts');
const { buildHtmlExport } = await bundleOf('src/renderer/lib/htmlExport.ts');
const { DEFAULT_THEME_CSS } = await bundleOf('src/shared/templates/themeCss.ts');
// No token extraction: the import writes literal values, and a harness
// that tokenised would be measuring a pipeline nobody runs.
const { parseThemeFile, serializeThemeFile } = await bundleOf('src/renderer/lib/parseTheme.ts');
const { fontsNeededBy, googleFontsUrlFor, needsResolving } = await bundleOf(
  'src/renderer/lib/importFonts.ts'
);
// The same ozone resolution the e2e fixtures use. Guessing at these args
// produced a window that never rendered a canvas.
// see docs/notes/linux-wayland-ozone.md
const { resolveOzonePlatform } = await bundleOf('src/main/ozone.ts');

/** `canvasWidth` defaults to 1440, so the canvas and the page agree. */
const VIEWPORT = { width: 1440, height: 900 };
const CHANNEL_TOLERANCE = 8;
const CELL = 16;
const CELL_THRESHOLD = 0.06;
const TOP = Number(process.env.TOP ?? 10);

const FREEZE_CSS = `
  *, *::before, *::after {
    animation-play-state: paused !important;
    animation-delay: 0s !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
`;

const AXES = await (async () => {
  try {
    const res = await fetch('https://fonts.google.com/metadata/fonts');
    if (!res.ok) return {};
    const json = JSON.parse((await res.text()).replace(/^[^{]*/, ''));
    const out = {};
    for (const fam of json.familyMetadataList ?? []) {
      if (Array.isArray(fam.axes) && fam.axes.length > 0) {
        out[fam.family] = fam.axes.map((a) => ({ tag: a.tag, min: a.min, max: a.max }));
      }
    }
    return out;
  } catch {
    return {};
  }
})();

const rgbaOf = async (png, w, h) => {
  const { data } = await sharp(png)
    .extract({ left: 0, top: 0, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
};

const diffGrid = (a, b, w, h) => {
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const cellDiff = new Int32Array(cols * rows);
  let differing = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (
        Math.abs(a[i] - b[i]) <= CHANNEL_TOLERANCE &&
        Math.abs(a[i + 1] - b[i + 1]) <= CHANNEL_TOLERANCE &&
        Math.abs(a[i + 2] - b[i + 2]) <= CHANNEL_TOLERANCE
      ) {
        continue;
      }
      differing += 1;
      cellDiff[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] += 1;
    }
  }
  return { differing, cellDiff, cols, rows };
};

const clustersOf = ({ cellDiff, cols, rows }) => {
  const hot = new Uint8Array(cols * rows);
  const perCell = CELL * CELL * CELL_THRESHOLD;
  for (let i = 0; i < cellDiff.length; i += 1) hot[i] = cellDiff[i] >= perCell ? 1 : 0;
  const seen = new Uint8Array(cols * rows);
  const out = [];
  for (let start = 0; start < hot.length; start += 1) {
    if (!hot[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let minC = cols, maxC = 0, minR = rows, maxR = 0, pixels = 0;
    while (stack.length > 0) {
      const at = stack.pop();
      const c = at % cols;
      const r = (at - c) / cols;
      pixels += cellDiff[at];
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (!hot[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    out.push({
      x: minC * CELL, y: minR * CELL,
      w: (maxC - minC + 1) * CELL, h: (maxR - minR + 1) * CELL,
      pixels,
    });
  }
  return out.sort((a, b) => b.pixels - a.pixels);
};

/** Percentage match over the common area, plus ranked clusters. */
const compare = async (aPng, bPng, label, slug) => {
  const [am, bm] = await Promise.all([sharp(aPng).metadata(), sharp(bPng).metadata()]);
  const w = Math.min(am.width, bm.width);
  const h = Math.min(am.height, bm.height);
  const [a, b] = await Promise.all([rgbaOf(aPng, w, h), rgbaOf(bPng, w, h)]);
  const grid = diffGrid(a, b, w, h);
  const pct = (100 * (w * h - grid.differing)) / (w * h);
  const clusters = clustersOf(grid);

  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 4;
    const off =
      Math.abs(a[i] - b[i]) > CHANNEL_TOLERANCE ||
      Math.abs(a[i + 1] - b[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(a[i + 2] - b[i + 2]) > CHANNEL_TOLERANCE;
    out[i] = off ? 255 : b[i] * 0.25 + 190;
    out[i + 1] = off ? 0 : b[i + 1] * 0.25 + 190;
    out[i + 2] = off ? 255 : b[i + 2] * 0.25 + 190;
    out[i + 3] = 255;
  }
  const file = join(outDir, `${slug}.${label}.diff.png`);
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);

  return { pct, clusters, w, h, sizes: `${am.width}x${am.height} vs ${bm.width}x${bm.height}`, file };
};

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/canvas-oracle.mjs <url>');
  process.exit(1);
}
await mkdir(outDir, { recursive: true });
const slug = url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- source
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
await page.addStyleTag({ content: FREEZE_CSS });
await page.evaluate(() => document.fonts?.ready);
await page.evaluate((src) => new Function(`return (${src})`)()(), prepareFn.toString());
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => document.fonts?.ready);
const payload = await page.evaluate(
  ([src, policy]) => new Function(`return (${src})`)()(policy),
  [captureFn.toString(), { ...capturePolicy(), includeRects: true }]
);
const sourcePng = await page.screenshot({ fullPage: true });
await page.close();

// ------------------------------------------------- reduce, token, generate
const reduced = reduceCapture(payload);
const elements = reduced.elements;
const parsedTheme = parseThemeFile(DEFAULT_THEME_CSS);
const fontUrl = googleFontsUrlFor(
  fontsNeededBy(elements).map((n) => n.family).filter(needsResolving),
  AXES
);
const themeCss = serializeThemeFile(
  {
    ...parsedTheme,
    fontImportUrls: fontUrl === null ? parsedTheme.fontImportUrls : [...parsedTheme.fontImportUrls, fontUrl],
  },
  DEFAULT_THEME_CSS
);
const VIEW = 'Home';
const { tsx, css } = generateCode({
  elements,
  rootId: reduced.rootId,
  pageName: VIEW,
  cssModuleImportName: VIEW,
  isComponent: true,
});

// ---------------------------------------------------------------- export
const exported = buildHtmlExport({
  projectName: 'oracle',
  pages: [{ name: 'imported', tsxContent: tsx, cssContent: css }],
  components: [],
  themeCss,
});
const html = exported.files.find((f) => f.path.endsWith('.html'))?.contents;
const sheet = exported.files.find((f) => f.path.endsWith('.css'))?.contents ?? '';
const themeSheet = exported.files.find((f) => f.path === 'theme.css')?.contents ?? '';
const shot = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const fontLink = fontUrl === null ? '' : `<link rel="stylesheet" href="${fontUrl}">`;
await shot.setContent(
  html.replace(
    '</head>',
    `${fontLink}<style>${themeSheet}</style><style>${sheet}</style><style>${FREEZE_CSS}</style></head>`
  ),
  { waitUntil: 'networkidle' }
);
await shot.evaluate(() => document.fonts?.ready);
const exportPng = await shot.screenshot({ fullPage: true });
await shot.close();
await browser.close();

// ---------------------------------------------------------------- canvas
// A real project on disk, opened by a real app. `SCAMP_E2E_OPEN_PROJECT`
// is the same door the e2e suite uses.
const projectDir = await mkdtemp(join(tmpdir(), 'scamp-oracle-'));
// The framework's own templates, exactly as New Project writes them —
// hand-rolling this produced a directory the app would not open as a
// project, and a canvas that never appeared.
for (const [relative, content] of Object.entries(
  projectTemplate({ name: 'oracle', scampjsVersion: '^0.3.0' })
)) {
  await mkdir(dirname(join(projectDir, relative)), { recursive: true });
  await writeFile(join(projectDir, relative), content);
}
// The template's Home view, replaced by the import. `Home` is the name
// it ships, so the route that renders it still resolves.
await writeFile(join(projectDir, 'views', VIEW, `${VIEW}.tsx`), tsx);
await writeFile(join(projectDir, 'views', VIEW, `${VIEW}.module.css`), css);
await writeFile(join(projectDir, 'design', 'theme.css'), themeCss);
// Stand in for an installed framework, or the "scampjs isn't installed"
// banner sits above the canvas and shifts every coordinate.
await mkdir(join(projectDir, 'node_modules', 'scampjs'), { recursive: true });
await writeFile(
  join(projectDir, 'node_modules', 'scampjs', 'package.json'),
  JSON.stringify({ name: 'scampjs', version: '0.3.0', scampjs: { contract: 2 } })
);
await writeFile(join(projectDir, 'scamp.config.json'), JSON.stringify({ canvasWidth: 1440 }, null, 2));

const ozone = resolveOzonePlatform({
  platform: process.platform,
  argv: process.argv,
  override: process.env['SCAMP_OZONE_PLATFORM'],
});
const userDataDir = await mkdtemp(join(tmpdir(), 'scamp-oracle-ud-'));
const app = await electron.launch({
  args: [
    MAIN_ENTRY,
    `--user-data-dir=${userDataDir}`,
    ...(ozone === null ? [] : [`--ozone-platform=${ozone}`]),
  ],
  env: { ...process.env, SCAMP_E2E: '1', SCAMP_E2E_OPEN_PROJECT: projectDir, NODE_ENV: 'test' },
});
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
// The crash-reporting consent prompt covers the whole app on a fresh
// userData dir, so the canvas never appears behind it. The e2e fixtures
// dismiss it for the same reason.
const optOut = win.getByRole('button', { name: /^No thanks$/i });
await optOut
  .waitFor({ state: 'visible', timeout: 5_000 })
  .then(() => optOut.click())
  .catch(() => {});
// Tall enough to hold the WHOLE canvas, not a screenful of it.
//
// Playwright's element screenshot cannot paint what was never on
// screen: at a 1400px window a 5383px canvas came back correct down to
// y=1312 and solid black below — exactly where the viewport ended. The
// DOM was right the whole time (root 5383px tall, correct background),
// so this read as a catastrophic Scamp bug and was entirely the
// harness. Sized after the canvas below, once its height is known.
await win.setViewportSize({ width: 2200, height: 1400 });

const frame = win.locator('[data-testid="canvas-frame"]');
try {
  await frame.waitFor({ state: 'visible', timeout: 60_000 });
} catch (err) {
  // Photograph whatever IS on screen. A timeout on a selector tells you
  // nothing about why; the window usually says so in plain text.
  const shotFile = join(outDir, `${slug}.canvas-FAILED.png`);
  await win.screenshot({ path: shotFile }).catch(() => {});
  console.error(`\n  canvas never appeared. Window: ${shotFile}`);
  console.error(`  project: ${projectDir}`);
  console.error(`  visible text: ${(await win.innerText('body').catch(() => '')).slice(0, 400)}`);
  await app.close().catch(() => {});
  process.exit(1);
}

// 100%, not fit. The label button jumps to 100% from fit mode, and a
// scaled capture would have to be resampled to compare — which blurs
// every edge and inflates the diff for a reason that is not a bug.
await win.locator('button[aria-label*="click for 100%"]').click({ timeout: 10_000 }).catch(() => {});
await win.waitForTimeout(400);

// Hide the editor chrome and the selection outline. `exportCapture.ts`
// does the same for thumbnails; done here in CSS because this captures
// through Playwright rather than through html-to-image.
await win.addStyleTag({
  content: `
    [data-canvas-chrome="true"] { display: none !important; }
    [class*="selected"] { outline: none !important; }
    ${FREEZE_CSS}
  `,
});
await win.evaluate(() => document.fonts?.ready);
await win.waitForTimeout(600);

// Grow the window to the canvas, then re-measure. `+400` covers the
// app chrome above and below the frame.
const canvasHeight = await frame.evaluate((el) => el.getBoundingClientRect().height);
await win.setViewportSize({
  width: 2200,
  height: Math.min(16_000, Math.ceil(canvasHeight) + 400),
});
await win.waitForTimeout(800);
await win.evaluate(() => document.fonts?.ready);

const scale = await frame.evaluate((el) => {
  const box = el.getBoundingClientRect();
  const logical = Number(el.dataset['canvasWidth'] ?? '0');
  return logical > 0 ? box.width / logical : 1;
});
const canvasPng = await frame.screenshot();
await app.close().catch(() => {});

// ---------------------------------------------------------------- report
await writeFile(join(outDir, `${slug}.source.png`), sourcePng);
await writeFile(join(outDir, `${slug}.export.png`), exportPng);
await writeFile(join(outDir, `${slug}.canvas.png`), canvasPng);

const canvasMeta = await sharp(canvasPng).metadata();
console.log(`\n${url}`);
console.log(`  canvas captured at ${canvasMeta.width}x${canvasMeta.height}, zoom ${scale.toFixed(3)}`);
if (Math.abs(scale - 1) > 0.01) {
  console.log('  ::warning:: canvas is NOT at 100% — the comparison below is between different scales');
}

for (const [label, a, b] of [
  ['source-vs-export', sourcePng, exportPng],
  ['source-vs-canvas', sourcePng, canvasPng],
  ['export-vs-canvas', exportPng, canvasPng],
]) {
  const r = await compare(a, b, label, slug);
  console.log(`\n  ${label}: ${r.pct.toFixed(2)}%  (${r.sizes}, compared over ${r.w}x${r.h})`);
  console.log(`    ${r.file}`);
  for (const c of r.clusters.slice(0, TOP)) {
    console.log(
      `      ${String(c.pixels).padStart(8)}px  ${`${c.w}x${c.h}`.padEnd(11)} at ${c.x},${c.y}`
    );
  }
}

if (process.env.KEEP === '1') {
  console.log(`\n  project kept at ${projectDir}`);
} else {
  await rm(projectDir, { recursive: true, force: true });
  await rm(userDataDir, { recursive: true, force: true });
}
await rm(bundleDir, { recursive: true, force: true });

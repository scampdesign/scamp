// Measure how close an import LOOKS to the page it came from.
//
//   node scripts/import-pixels.mjs https://example.com [more urls…]
//
// The sibling of `import-fidelity.mjs`, which compares element boxes.
// Boxes can all be right while colour, weight, shadow, gradient,
// background, border and stacking are wrong — none of which that harness
// can see. This one screenshots the source page and the rendered import
// and compares pixels.
//
// A percentage is not a bug report. What makes this usable is the ranked
// list of diff CLUSTERS with the element under each: "one 900x240 cluster
// over hero_0a3f, and 40 thin ones along every text baseline" says there
// is one layout bug and one font bug. "94.1%" says nothing.
//
// Env:
//   TOP=n      clusters to list (default 12)
//   OUT=dir    where the diff PNGs go (default .pixels-tmp)
//   CELL=n     cluster grid size in px (default 16)
//
// see docs/plans/import-pixel-fidelity-prompt.md
// see docs/notes/parity-harness.md — why the oracle must be set up like
// the real thing, which cost three wrong conclusions before it was written
// down.

import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import sharp from 'sharp';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
// Two different directories on purpose: the bundle cache is deleted on
// exit, and the screenshots are the output. Pointing both at
// `.pixels-tmp` made the cleanup delete every PNG the run had just
// written, which looks exactly like the screenshots never being taken.
const tmpDir = join(root, '.pixels-tmp', 'bundles');
const outDir = resolve(root, process.env.OUT ?? '.pixels-tmp/shots');

// Same bundling approach as import-fidelity.mjs: `node` rather than
// `neutral` because parseCode pulls in postcss, and written to a real
// path because `packages: 'external'` leaves bare specifiers that only
// resolve from inside the project.
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
  await mkdir(tmpDir, { recursive: true });
  const file = join(tmpDir, `${entry.replace(/[^a-z0-9]+/gi, '_')}.mjs`);
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

/**
 * Google's public axis metadata, keyed by family.
 *
 * Needed because Google instances a variable font to whatever axes the
 * URL names: ask for `wght` alone and every other axis freezes at its
 * default. Fetched once per run; a failure degrades to the weights-only
 * URL rather than failing the harness.
 * see docs/notes/import-variable-fonts.md
 */
const fetchAxes = async () => {
  try {
    const res = await fetch('https://fonts.google.com/metadata/fonts');
    if (!res.ok) return {};
    // The response is guarded with an anti-JSON-hijacking prefix.
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
};
const AXES = await fetchAxes();

const VIEWPORT = { width: 1440, height: 900 };
/** Per-channel slack. Antialiasing differs between two renders of the
 *  same glyph; 8/255 absorbs that without hiding a real colour change. */
const CHANNEL_TOLERANCE = 8;
/** A cell counts as different once this fraction of its pixels differ.
 *  Below it, a cell is one stray edge rather than a defect. */
const CELL_THRESHOLD = 0.06;
const CELL = Number(process.env.CELL ?? 16);
const TOP = Number(process.env.TOP ?? 12);

/**
 * Everything that makes two renders of one page differ for reasons no
 * importer fix can address. Applied to BOTH sides.
 */
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

/** Element kinds the importer declares lost. Diffing them is unfair. */
const MASK_SELECTOR = 'canvas, iframe, video, embed, object';

const flatten = (node, out = []) => {
  out.push(node);
  node.children.forEach((c) => flatten(c, out));
  return out;
};

/** Raw RGBA of a PNG, cropped to `w`x`h`. */
const rgbaOf = async (png, w, h) => {
  const { data } = await sharp(png)
    .extract({ left: 0, top: 0, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
};

/**
 * Compare two RGBA buffers.
 *
 * Returns the differing-pixel count and a per-cell grid, which is what
 * the clustering works on — a per-pixel component walk on a 1440x8000
 * image is both slow and answers a question nobody asked.
 */
const diffGrid = (a, b, w, h, masks) => {
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const cellDiff = new Int32Array(cols * rows);
  let differing = 0;
  let masked = 0;

  const inMask = (x, y) =>
    masks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (
        Math.abs(a[i] - b[i]) <= CHANNEL_TOLERANCE &&
        Math.abs(a[i + 1] - b[i + 1]) <= CHANNEL_TOLERANCE &&
        Math.abs(a[i + 2] - b[i + 2]) <= CHANNEL_TOLERANCE &&
        Math.abs(a[i + 3] - b[i + 3]) <= CHANNEL_TOLERANCE
      ) {
        continue;
      }
      // Masked pixels are counted separately and excluded from both the
      // numerator and the denominator, so the score neither rewards nor
      // punishes a region the importer never claimed to carry.
      if (inMask(x, y)) {
        masked += 1;
        continue;
      }
      differing += 1;
      cellDiff[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] += 1;
    }
  }
  return { differing, masked, cellDiff, cols, rows };
};

/** Connected cells above the threshold, as bounding boxes, largest first. */
const clustersOf = ({ cellDiff, cols, rows }) => {
  const hot = new Uint8Array(cols * rows);
  const perCell = CELL * CELL * CELL_THRESHOLD;
  for (let i = 0; i < cellDiff.length; i += 1) hot[i] = cellDiff[i] >= perCell ? 1 : 0;

  const seen = new Uint8Array(cols * rows);
  const out = [];
  for (let start = 0; start < hot.length; start += 1) {
    if (!hot[start] || seen[start]) continue;
    // Iterative flood fill; a recursive one blows the stack on a page
    // whose whole body shifted.
    const stack = [start];
    seen[start] = 1;
    let minC = cols;
    let maxC = 0;
    let minR = rows;
    let maxR = 0;
    let cells = 0;
    let pixels = 0;
    while (stack.length > 0) {
      const at = stack.pop();
      const c = at % cols;
      const r = (at - c) / cols;
      cells += 1;
      pixels += cellDiff[at];
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
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
      x: minC * CELL,
      y: minR * CELL,
      w: (maxC - minC + 1) * CELL,
      h: (maxR - minR + 1) * CELL,
      cells,
      pixels,
    });
  }
  return out.sort((a, b) => b.pixels - a.pixels);
};

/** The smallest imported element whose box contains a cluster. */
const elementUnder = (cluster, rects) => {
  const cx = cluster.x + cluster.w / 2;
  const cy = cluster.y + cluster.h / 2;
  let best = null;
  for (const [cls, r] of Object.entries(rects)) {
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) continue;
    if (best === null || r.w * r.h < best.area) best = { cls, area: r.w * r.h };
  }
  return best?.cls ?? null;
};

/** A greyscale PNG of where the two differ, for a human to look at. */
const writeDiffPng = async (a, b, w, h, file) => {
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 4;
    const off =
      Math.abs(a[i] - b[i]) > CHANNEL_TOLERANCE ||
      Math.abs(a[i + 1] - b[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(a[i + 2] - b[i + 2]) > CHANNEL_TOLERANCE;
    // Differences in magenta over a dimmed copy of the import, so the
    // diff is readable as a page rather than as confetti.
    out[i] = off ? 255 : b[i] * 0.25 + 190;
    out[i + 1] = off ? 0 : b[i + 1] * 0.25 + 190;
    out[i + 2] = off ? 255 : b[i + 2] * 0.25 + 190;
    out[i + 3] = 255;
  }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(file);
};

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node scripts/import-pixels.mjs <url> [url…]');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const summary = [];

for (const url of urls) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(() => document.fonts?.ready);

    // The importer's own settle, which reveals scroll-triggered content.
    // The screenshot has to come from the page AFTER this, or it shows a
    // state the capture never saw.
    await page.evaluate((src) => new Function(`return (${src})`)()(), prepareFn.toString());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts?.ready);

    // Regions the importer declares lost, measured page-relative so they
    // line up with a full-page screenshot.
    const masks = await page.evaluate((sel) => {
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          x: Math.floor(b.left + window.scrollX),
          y: Math.floor(b.top + window.scrollY),
          w: Math.ceil(b.width),
          h: Math.ceil(b.height),
        });
      }
      return out;
    }, MASK_SELECTOR);

    // Capture and screenshot the SAME page instance, without reloading.
    // Reload between the two and a rotating hero or a lazily-swapped
    // image guarantees a diff that is nobody's bug.
    const payload = await page.evaluate(
      ([src, policy]) => new Function(`return (${src})`)()(policy),
      [captureFn.toString(), { ...capturePolicy(), includeRects: true }]
    );
    const sourcePng = await page.screenshot({ fullPage: true });

    const reduced = reduceCapture(payload);
    const themeWithTokens = DEFAULT_THEME_CSS;
    const { tsx, css } = generateCode({
      elements: reduced.elements,
      rootId: reduced.rootId,
      pageName: 'Imported',
      cssModuleImportName: 'Imported',
      isComponent: true,
    });
    const exported = buildHtmlExport({
      projectName: 'pixels',
      pages: [{ name: 'imported', tsxContent: tsx, cssContent: css }],
      components: [],
      themeCss: themeWithTokens,
    });
    const html = exported.files.find((f) => f.path.endsWith('.html'))?.contents;
    const sheet = exported.files.find((f) => f.path.endsWith('.css'))?.contents ?? '';
    const themeSheet = exported.files.find((f) => f.path === 'theme.css')?.contents ?? '';
    if (!html) {
      throw new Error(
        `the exporter produced no document (skipped: ${JSON.stringify(exported.skipped)})`
      );
    }

    // Render the import the way the app does: the project's theme.css,
    // which carries the box-sizing and block-margin resets, and the
    // page's own typefaces. Without the fonts this measures a fallback
    // face, whose metrics differ — which reads as the importer getting
    // every text height wrong. see docs/notes/parity-harness.md
    const fontUrl = googleFontsUrlFor(
      fontsNeededBy(reduced.elements).map((n) => n.family).filter(needsResolving),
      AXES
    );
    const fontLink = fontUrl === null ? '' : `<link rel="stylesheet" href="${fontUrl}">`;
    const shot = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await shot.setContent(
      html.replace(
        '</head>',
        `${fontLink}<style>${themeSheet}</style><style>${sheet}</style>` +
          `<style>${FREEZE_CSS}</style></head>`
      ),
      { waitUntil: 'networkidle' }
    );
    await shot.evaluate(() => document.fonts?.ready);
    const importedRects = await shot.evaluate(() => {
      const out = {};
      const rootEl = document.querySelector('[class*="root"]') ?? document.body;
      const base = rootEl.getBoundingClientRect();
      for (const el of document.querySelectorAll('[class]')) {
        const cls = Array.from(el.classList).find((c) => /_[0-9a-f]{4}$/.test(c));
        if (!cls) continue;
        const b = el.getBoundingClientRect();
        out[cls] = {
          x: Math.round(b.left - base.left),
          y: Math.round(b.top - base.top),
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
      }
      return out;
    });
    const importPng = await shot.screenshot({ fullPage: true });
    await shot.close();

    const [srcMeta, impMeta] = await Promise.all([
      sharp(sourcePng).metadata(),
      sharp(importPng).metadata(),
    ]);
    // Full-page heights rarely match exactly, and the difference is
    // itself a finding — a page 400px shorter than its source has lost
    // something. Diff the common area and report the shortfall, rather
    // than scaling one to the other, which would smear every row.
    const w = Math.min(srcMeta.width, impMeta.width);
    const h = Math.min(srcMeta.height, impMeta.height);
    const [a, b] = await Promise.all([rgbaOf(sourcePng, w, h), rgbaOf(importPng, w, h)]);

    const grid = diffGrid(a, b, w, h, masks);
    const considered = w * h - grid.masked;
    const pct = considered === 0 ? 0 : (100 * (considered - grid.differing)) / considered;
    const clusters = clustersOf(grid);

    const slug = url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    const diffFile = join(outDir, `${slug}.diff.png`);
    await writeDiffPng(a, b, w, h, diffFile);
    await writeFile(join(outDir, `${slug}.source.png`), sourcePng);
    await writeFile(join(outDir, `${slug}.import.png`), importPng);

    console.log(`\n${url}`);
    console.log(`  ${pct.toFixed(2)}% of pixels match  (${grid.differing} differ of ${considered})`);
    console.log(
      `  source ${srcMeta.width}x${srcMeta.height} · import ${impMeta.width}x${impMeta.height}` +
        (srcMeta.height === impMeta.height
          ? ''
          : `  ← ${Math.abs(srcMeta.height - impMeta.height)}px ${
              impMeta.height < srcMeta.height ? 'SHORTER' : 'taller'
            }, compared over the common ${h}px`)
    );
    if (masks.length > 0) {
      const area = masks.reduce((n, m) => n + m.w * m.h, 0);
      console.log(
        `  ${masks.length} masked (${((100 * area) / (w * h)).toFixed(1)}% of the page): ` +
          masks.map((m) => `${m.tag} ${m.w}x${m.h}`).join(', ')
      );
    }
    console.log(`  ${clusters.length} diff clusters · diff: ${diffFile}`);
    for (const c of clusters.slice(0, TOP)) {
      const el = elementUnder(c, importedRects);
      console.log(
        `    ${String(c.pixels).padStart(8)}px  ` +
          `${`${c.w}x${c.h}`.padEnd(11)} at ${`${c.x},${c.y}`.padEnd(11)} ` +
          (el ?? '(no element)')
      );
    }
    if (clusters.length > TOP) console.log(`    … and ${clusters.length - TOP} more`);
    summary.push({ url, pct });
  } catch (err) {
    console.log(`\n${url}\n  FAILED: ${err.message.slice(0, 200)}`);
    summary.push({ url, pct: null });
  } finally {
    await page.close();
  }
}

console.log('\n— summary —');
for (const s of summary) {
  console.log(`  ${s.pct === null ? '  failed' : `${s.pct.toFixed(2)}%`}  ${s.url}`);
}

await browser.close();
await rm(tmpDir, { recursive: true, force: true });

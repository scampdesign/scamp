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

import { VIEWPORT, cleanupHarness, measurePage } from './lib/pixelHarness.mjs';

const TOP = Number(process.env.TOP ?? 12);

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node scripts/import-pixels.mjs <url> [url…]');
  process.exit(1);
}

const browser = await chromium.launch();
const summary = [];

for (const url of urls) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    const m = await measurePage(browser, page, { label: url });
    const { source: src, imported: imp } = m;

    console.log(`\n${url}`);
    console.log(`  ${m.pct.toFixed(2)}% of pixels match  (${m.differing} differ of ${m.considered})`);
    console.log(
      `  source ${src.width}x${src.height} · import ${imp.width}x${imp.height}` +
        (src.height === imp.height
          ? ''
          : `  ← ${Math.abs(src.height - imp.height)}px ${
              imp.height < src.height ? 'SHORTER' : 'taller'
            }, compared over the common ${m.comparedHeight}px`)
    );
    if (m.masks.length > 0) {
      const area = m.masks.reduce((n, mask) => n + mask.w * mask.h, 0);
      console.log(
        `  ${m.masks.length} masked (${((100 * area) / (src.width * m.comparedHeight)).toFixed(1)}% of the page): ` +
          m.masks.map((mask) => `${mask.tag} ${mask.w}x${mask.h}`).join(', ')
      );
    }
    console.log(`  ${m.clusters.length} diff clusters · diff: ${m.diffFile}`);
    for (const c of m.clusters.slice(0, TOP)) {
      console.log(
        `    ${String(c.pixels).padStart(8)}px  ` +
          `${`${c.w}x${c.h}`.padEnd(11)} at ${`${c.x},${c.y}`.padEnd(11)} ` +
          (c.element ?? '(no element)')
      );
    }
    if (m.clusters.length > TOP) console.log(`    … and ${m.clusters.length - TOP} more`);
    summary.push({ url, pct: m.pct });
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
await cleanupHarness();

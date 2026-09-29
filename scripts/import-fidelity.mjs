// Measure how close an import is to the page it came from.
//
//   node scripts/import-fidelity.mjs https://example.com [more urls…]
//
// Loads the page, captures it WITH each element's box, reduces it the
// way the app does, renders the result back to HTML through the same
// exporter the app uses, and compares the two geometries element by
// element.
//
// "It looks a bit off" is not something you can fix. A ranked list of
// which elements are off, by how much, and what they have in common, is.
// The harness exists to turn one into the other.
//
// The comparison is deliberately generous about absolute position and
// strict about size: a container that is 40px too tall pushes everything
// below it down, and reporting all of those as separate failures buries
// the one that caused them.
// see docs/plans/website-import-plan.md

import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tmpDir = join(root, '.fidelity-tmp');

// `node` rather than `neutral`: parseCode pulls in postcss, which needs
// the node builtins. The capture script is the only bundle that has to
// stay browser-safe, and it is injected as text rather than imported.
const bundleOf = async (entry) => {
  const out = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    write: false,
    alias: {
      '@shared': join(root, 'src/shared'),
      '@lib': join(root, 'src/renderer/lib'),
    },
  });
  // Written into the repo rather than imported as a data: URL, because
  // `packages: 'external'` leaves bare specifiers like `postcss` in the
  // output and those only resolve from a real path inside the project.
  await mkdir(tmpDir, { recursive: true });
  const file = join(tmpDir, `${entry.replace(/[^a-z0-9]+/gi, '_')}.mjs`);
  await writeFile(file, out.outputFiles[0].text, 'utf-8');
  return import(pathToFileURL(file).href);
};

const { captureFn, capturePolicy, prepareFn } = await bundleOf('src/shared/captureScript.ts');
const { reduceCapture } = await bundleOf('src/renderer/lib/importReduce.ts');
const { generateCode } = await bundleOf('src/renderer/lib/generateCode.ts');
const { buildHtmlExport } = await bundleOf('src/renderer/lib/htmlExport.ts');
// The oracle must be set up the way the real thing is, or it invents
// bugs. Rendering without the project's theme.css — which carries the
// universal `box-sizing: border-box` and the block-margin reset —
// reported every padded box as 2x its padding too large, and those
// artefacts looked exactly like importer bugs.
// see docs/notes/parity-harness.md
const { DEFAULT_THEME_CSS } = await bundleOf('src/shared/templates/themeCss.ts');
// The import embeds the page's typefaces; the oracle has to render with
// them too. Without this it measures text in a fallback face, whose
// metrics differ — which reads as the importer getting heights wrong
// when it is the harness that is not set up like the real thing. Third
// time this exact mistake has cost a wrong conclusion.
const { fontsNeededBy, googleFontsUrlFor, needsResolving } = await bundleOf(
  'src/renderer/lib/importFonts.ts'
);

/**
 * Google's public axis metadata, keyed by family. Google instances a
 * variable font to whatever axes the URL names, so without this an
 * optical-size face renders visibly wider than the source page.
 * see docs/notes/import-variable-fonts.md
 */
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

const VIEWPORT = { width: 1440, height: 900 };
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node scripts/import-fidelity.mjs <url> [url…]');
  process.exit(1);
}

/** Every captured node, flattened, in the reducer's own document order. */
const flatten = (node, out = []) => {
  out.push(node);
  node.children.forEach((c) => flatten(c, out));
  return out;
};

const browser = await chromium.launch();

for (const url of urls) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    // Web fonts change every text measurement; wait for them.
    await page.evaluate(() => document.fonts?.ready);

    // The same settle the app does, or the harness measures a page the
    // app never sees.
    await page.evaluate((src) => new Function(`return (${src})`)()(), prepareFn.toString());
    const payload = await page.evaluate(
      ([src, policy]) => new Function(`return (${src})`)()(policy),
      [captureFn.toString(), { ...capturePolicy(), includeRects: true }]
    );

    const reduced = reduceCapture(payload);
    const { tsx, css } = generateCode({
      elements: reduced.elements,
      rootId: reduced.rootId,
      pageName: 'Imported',
      cssModuleImportName: 'Imported',
      isComponent: true,
    });
    const exported = buildHtmlExport({
      projectName: 'fidelity',
      pages: [{ name: 'imported', tsxContent: tsx, cssContent: css }],
      components: [],
      themeCss: DEFAULT_THEME_CSS,
    });
    const html = exported.files.find((f) => f.path.endsWith('.html'))?.contents;
    const sheet = exported.files.find((f) => f.path.endsWith('.css'))?.contents ?? '';
    if (!html) {
      throw new Error(
        `the exporter produced no document (files: ${exported.files
          .map((f) => f.path)
          .join(', ')}; skipped: ${JSON.stringify(exported.skipped)})`
      );
    }

    // Render the import and measure the same elements.
    const shot = await browser.newPage({ viewport: VIEWPORT });
    const themeSheet =
      exported.files.find((f) => f.path === 'theme.css')?.contents ?? '';
    const fontUrl = googleFontsUrlFor(
      fontsNeededBy(reduced.elements)
        .map((n) => n.family)
        .filter(needsResolving),
      AXES
    );
    const fontLink = fontUrl === null ? '' : `<link rel="stylesheet" href="${fontUrl}">`;
    await shot.setContent(
      html.replace(
        '</head>',
        `${fontLink}<style>${themeSheet}</style><style>${sheet}</style></head>`
      ),
      {
        waitUntil: 'networkidle',
      }
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
          x: Math.round((b.left - base.left) * 100) / 100,
          y: Math.round((b.top - base.top) * 100) / 100,
          w: Math.round(b.width * 100) / 100,
          h: Math.round(b.height * 100) / 100,
          // Content taller than the box it was given. Comparing boxes
          // alone cannot see this: a pinned height measures exactly
          // right while its text pours out over whatever is below.
          //
          // The threshold is a line, not a pixel. Big type with a tight
          // `line-height` always reports a few pixels of scrollHeight
          // over clientHeight — the glyphs' descenders sit outside the
          // line box — and the source page reports the same, so
          // anything under a line of its own text is the page's own
          // typesetting rather than something the import broke.
          // see docs/notes/import-inherited-typography.md
          spills:
            el.scrollHeight - el.clientHeight >
            Math.max(8, parseFloat(getComputedStyle(el).lineHeight) || 0),
        };
      }
      return out;
    });
    await shot.close();

    // Source geometry, page-relative like the import's.
    const sourceNodes = flatten(payload.root).filter((n) => n.rect);
    const origin = payload.root.rect ?? { x: 0, y: 0 };

    // Exact pairing: the reducer records which captured node each
    // element came from, so nothing is matched by guesswork.
    const sourceById = new Map(flatten(payload.root).map((n) => [n.id, n]));

    let compared = 0;
    const offenders = [];
    for (const [elId, el] of Object.entries(reduced.elements)) {
      if (elId === 'root') continue;
      const src = sourceById.get(reduced.sourceNodes[elId]);
      const cls = el.name ? `${el.name}_${elId}` : `box_${elId}`;
      const got = importedRects[cls];
      if (!src?.rect || !got) continue;
      compared += 1;
      const dw = Math.abs(src.rect.w - got.w);
      const dh = Math.abs(src.rect.h - got.h);
      if (dw > 2 || dh > 2) {
        const m = ['margin-top', 'margin-bottom']
          .map((k) => src.styles[k])
          .filter(Boolean)
          .join('/');
        offenders.push({
          margins: m,
          cls,
          tag: src.tag,
          dw: Math.round(dw),
          dh: Math.round(dh),
          src: `${Math.round(src.rect.w)}x${Math.round(src.rect.h)}`,
          got: `${Math.round(got.w)}x${Math.round(got.h)}`,
        });
      }
    }

    if (process.env.DUMP) {
      for (const cls of process.env.DUMP.split(',')) {
        const m = sheet.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`));
        console.log('\n' + (m ? m[0] : `(no rule for ${cls})`));
        const id = cls.split('_').pop();
        const n = sourceById.get(reduced.sourceNodes[id]);
        if (n) console.log('  SOURCE styles:', JSON.stringify(n.styles));
      }
    }

    offenders.sort((a, b) => b.dw + b.dh - (a.dw + a.dh));
    const withMargins = offenders.filter((o) => o.margins).length;
    const pct = compared === 0 ? 0 : Math.round(((compared - offenders.length) / compared) * 100);
    console.log(`\n${url}`);
    console.log(`  ${compared} elements compared · ${pct}% within 2px of the source`);
    console.log(`  ${offenders.length} off · ${withMargins} of them have vertical margins`);
    const spilling = Object.entries(importedRects).filter(([, r]) => r.spills);
    console.log(
      `  ${spilling.length} overflowing their box` +
        (spilling.length === 0 ? '' : ` · ${spilling.slice(0, 6).map(([c]) => c).join(', ')}`)
    );
    // Is the offender inline content sitting inside a text element?
    const parentOf = new Map();
    const mark = (n) => n.children.forEach((c) => { parentOf.set(c.id, n); mark(c); });
    mark(payload.root);
    const TEXTY = new Set(['p','h1','h2','h3','h4','h5','h6','span','a','li','label','strong','em','b','small','code','kbd','blockquote','figcaption']);
    const insideText = offenders.filter((o) => {
      const id = reduced.sourceNodes[o.cls.split('_').pop()];
      const par = parentOf.get(id);
      return par && TEXTY.has(par.tag);
    }).length;
    console.log(`  ${insideText} of ${offenders.length} sit inside a text element`);
    const byTag = new Map();
    for (const o of offenders) byTag.set(o.tag, (byTag.get(o.tag) ?? 0) + 1);
    console.log('  by tag: ' + [...byTag].sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}=${n}`).join(' '));
    const widthOnly = offenders.filter((o) => o.dw > 2 && o.dh <= 2).length;
    const heightOnly = offenders.filter((o) => o.dh > 2 && o.dw <= 2).length;
    console.log(`  width-only=${widthOnly} height-only=${heightOnly} both=${offenders.length - widthOnly - heightOnly}`);
    for (const o of offenders.slice(0, Number(process.env.TOP ?? 12))) {
      console.log(
        `    ${o.cls.padEnd(22)} <${(o.tag ?? '?').padEnd(6)}> ` +
          `${o.src.padStart(10)} → ${o.got.padEnd(10)} ${o.margins ? `m:${o.margins}` : ''}`
      );
    }
    if (offenders.length > Number(process.env.TOP ?? 12)) console.log(`    … and ${offenders.length - Number(process.env.TOP ?? 12)} more`);
  } catch (err) {
    console.log(`\n${url}\n  FAILED: ${err.message.slice(0, 160)}`);
  } finally {
    await page.close();
  }
}

await browser.close();
await rm(tmpDir, { recursive: true, force: true });

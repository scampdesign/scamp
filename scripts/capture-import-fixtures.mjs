// Generate `CapturePayload` fixtures from the local HTML pages in
// `test/fixtures/import/pages/`, using the real capture script in a real
// browser.
//
// The reducer's tests need payloads that came from an actual layout
// engine — hand-written ones would encode what I assume a computed style
// looks like, and the assumptions are exactly what the reducer has to
// get right. Local pages rather than live URLs so the fixtures are
// deterministic and the suite works offline.
//
//   node scripts/capture-import-fixtures.mjs
//
// The capture script is bundled with esbuild rather than imported: the
// committed `.js` shims use extensionless imports, which Vite and Vitest
// resolve and plain Node does not. Bundling also means this reads the
// `.ts` source directly, so it can never test a stale shim.
// see docs/archive/2026-09-23-website-import-plan.md

import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pagesDir = join(root, 'test/fixtures/import/pages');
const outDir = join(root, 'test/fixtures/import/payloads');

// Bundle the capture module to a single ESM file, then import it.
const bundled = await build({
  entryPoints: [join(root, 'src/shared/captureScript.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const source = bundled.outputFiles[0].text;
const { captureFn, capturePolicy, prepareFn } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const VIEWPORT = { width: 1440, height: 900 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
await mkdir(outDir, { recursive: true });

const pages = (await readdir(pagesDir)).filter((f) => f.endsWith('.html'));
if (pages.length === 0) throw new Error(`No fixture pages in ${pagesDir}`);

for (const file of pages) {
  await page.goto(pathToFileURL(join(pagesDir, file)).href);
  // Fonts and images affect computed values; settle before measuring.
  await page.waitForLoadState('networkidle');

  await page.evaluate((src) => new Function(`return (${src})`)()(), prepareFn.toString());
  const payload = await page.evaluate(
    ([fnSource, policy]) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${fnSource})`)();
      return fn(policy);
    },
    // A page named for tokens is captured reading them, as a React import does.
    [captureFn.toString(), { ...capturePolicy(), authoredTokens: file.includes('tokens') }]
  );

  // The page's own file: URL is machine-specific; the fixture should not be.
  payload.url = `fixture:${file}`;

  const name = file.replace(/\.html$/, '.json');
  await writeFile(join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  const count = (function tally(n) {
    return 1 + n.children.reduce((sum, c) => sum + tally(c), 0);
  })(payload.root);
  const notes = (function collect(n) {
    return n.notes.length + n.children.reduce((sum, c) => sum + collect(c), 0);
  })(payload.root);
  console.log(
    `${name.padEnd(20)} ${String(count).padStart(4)} nodes, ` +
      `${payload.assets.length} assets, ${notes} notes`
  );
}

await browser.close();

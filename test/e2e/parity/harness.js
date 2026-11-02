import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chromium } from '@playwright/test';
import { IFRAME_CANVAS } from '../fixtures/selectors';
/**
 * Machinery for comparing what the canvas lays out against what a browser
 * lays out from the same source files.
 *
 * The browser side deliberately imports NOTHING from `src/`. An oracle
 * that shares code with the thing it checks can agree with it while both
 * are wrong, so the fixture carries hand-written HTML and this module only
 * wraps it in a document with the page's CSS applied verbatim. The
 * document shell mirrors the project's own `app/layout.tsx` so the body
 * reset matches what the preview would use.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */
/** Mirrors `@lib/canvasStylesheet`; duplicated so the oracle imports no src. */
const CANVAS_SCOPE_ATTR = 'data-scamp-canvas';
/**
 * Measure every Scamp element in the document, relative to the page root
 * and normalised out of any canvas zoom.
 *
 * Elements are keyed by their Scamp class name, which both sides carry:
 * the canvas puts it on `data-scamp-id`, the exporter emits it as `class`.
 *
 * Runs inside the page, so it must be self-contained.
 */
export const MEASURE_SCRIPT = `(() => {
  // Inside a component instance the element names are the COMPONENT's, so
  // a page root and a component root are both "root". Qualify by the
  // owning instance so the two don't collide — and so both sides key the
  // same way, since the browser document marks instances the same way.
  // A prop text carries the attribute too, for the canvas's hit test; it isn't an instance.
  const instanceOf = (el) => {
    const host = el.closest('[data-scamp-instance-id]:not([data-scamp-prop])');
    return host ? host.getAttribute('data-scamp-instance-id') : null;
  };
  const read = (el) => {
    const own = el.getAttribute('data-scamp-id') || el.className;
    if (typeof own !== 'string') return own;
    const inst = instanceOf(el);
    return inst ? inst + '/' + own : own;
  };
  // The iframe canvas experiment draws the page in a document of its own;
  // the oracle's plain document has no such iframe.
  const canvasIframe = document.querySelector('[data-testid="iframe-canvas"] iframe');
  const doc = (canvasIframe && canvasIframe.contentDocument) || document;
  const nodes = Array.from(
    doc.querySelectorAll('[data-scamp-id], [class]')
  ).filter((el) => {
    const key = read(el);
    return typeof key === 'string' && key.length > 0;
  });
  const root = nodes.find((el) => read(el) === 'root');
  if (!root) return null;
  const rootRect = root.getBoundingClientRect();
  // The canvas renders inside a transformed frame. offsetWidth is the
  // pre-transform layout width, so their ratio is the zoom factor; in a
  // plain document it is 1.
  const scale = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;
  const out = {};
  for (const el of nodes) {
    const key = read(el);
    if (typeof key !== 'string') continue;
    // Only Scamp's own classes; ignore app chrome and helper wrappers.
    if (!/^[a-z][a-z0-9_]*([/][a-z][a-z0-9_]*)?$/i.test(key)) continue;
    if (out[key]) continue;
    const r = el.getBoundingClientRect();
    out[key] = {
      x: (r.left - rootRect.left) / scale,
      y: (r.top - rootRect.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
    };
  }
  return out;
})()`;
export const measure = async (page) => {
    const result = (await page.evaluate(MEASURE_SCRIPT));
    if (result === null)
        throw new Error('no root element found to measure from');
    return result;
};
/**
 * Playwright's bundled Chromium may not be installed (this repo's e2e
 * suite drives Electron, so browsers aren't a hard dependency). Fall back
 * to any Chromium build already in the Playwright cache before giving up,
 * so the harness runs locally without an extra install step.
 */
const findChromium = async () => {
    const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
    let entries;
    try {
        entries = await fs.readdir(cache);
    }
    catch {
        return undefined;
    }
    const builds = entries
        .filter((e) => e.startsWith('chromium-'))
        .sort((a, b) => Number(b.split('-')[1] ?? 0) - Number(a.split('-')[1] ?? 0));
    for (const build of builds) {
        const candidate = path.join(cache, build, 'chrome-linux64', 'chrome');
        try {
            await fs.access(candidate);
            return candidate;
        }
        catch {
            // try the next build
        }
    }
    return undefined;
};
export const launchTruthBrowser = async () => {
    try {
        return await chromium.launch();
    }
    catch {
        const executablePath = await findChromium();
        if (executablePath === undefined) {
            throw new Error('No Chromium available for the parity harness. Run `npx playwright install chromium`.');
        }
        return chromium.launch({ executablePath });
    }
};
/**
 * Render a fixture's markup the way a browser would, and measure it.
 *
 * `viewport` must match the width the canvas root actually got, since
 * layout depends on it — a different width is a different (valid) layout,
 * not a divergence.
 */
export const measureInBrowser = async (browser, source, viewport) => {
    // Mirrors app/layout.tsx: it imports `theme.css` before the page's own
    // module and wraps everything in `<body style="margin: 0; min-height:
    // 100vh">`. The theme carries the `box-sizing: border-box` reset and the
    // block-margin reset — omitting it makes the browser side disagree with
    // the canvas over padding and `<p>` margins for reasons that have nothing
    // to do with the canvas.
    const document = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
${source.themeCss}
    </style>
    <style>
${source.css}
    </style>
  </head>
  <body style="margin: 0; min-height: 100vh">
${source.html}
  </body>
</html>`;
    const page = await browser.newPage({ viewport });
    try {
        await page.setContent(document, { waitUntil: 'load' });
        return await measure(page);
    }
    finally {
        await page.close();
    }
};
/**
 * Compare two geometries. Sub-pixel differences are noise — anything at or
 * above `tolerance` is a real layout difference a user could see.
 */
export const compareGeometry = (canvas, browser, tolerance = 1) => {
    const out = [];
    for (const [element, browserBox] of Object.entries(browser)) {
        const canvasBox = canvas[element];
        if (canvasBox === undefined) {
            out.push({
                element,
                field: 'x',
                canvas: Number.NaN,
                browser: browserBox.x,
                delta: Number.POSITIVE_INFINITY,
            });
            continue;
        }
        for (const field of ['x', 'y', 'w', 'h']) {
            // A view's root loses `min-height: 100vh` on parse; today's canvas puts a
            // 900px floor back that the saved file doesn't have, and the oracle keeps
            // the fixture's. The iframe canvas draws the file. Open question, so not
            // compared there. see docs/plans/canvas-rendering-options.md, "The full test"
            if (IFRAME_CANVAS && element === 'root' && field === 'h')
                continue;
            const delta = Math.abs(canvasBox[field] - browserBox[field]);
            if (delta >= tolerance) {
                out.push({
                    element,
                    field,
                    canvas: canvasBox[field],
                    browser: browserBox[field],
                    delta,
                });
            }
        }
    }
    return out;
};
/** Human-readable failure text — the numbers are the whole point. */
export const describeDivergences = (divergences) => divergences
    .map((d) => Number.isNaN(d.canvas)
    ? `  ${d.element}: missing from the canvas entirely`
    : `  ${d.element}.${d.field}: canvas ${d.canvas.toFixed(1)} vs browser ${d.browser.toFixed(1)} (off by ${d.delta.toFixed(1)}px)`)
    .join('\n');
/** Width both images are normalised to before comparing. */
const DIFF_WIDTH = 240;
/** Per-channel difference below which two pixels count as equal. */
const CHANNEL_TOLERANCE = 12;
/**
 * Compare two PNG screenshots inside a browser page, which avoids adding a
 * PNG decoder dependency — the browser already has one.
 */
export const comparePixels = async (page, canvasPng, browserPng) => {
    const result = await page.evaluate(async ([a, b, width, tolerance]) => {
        const load = (dataUrl) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
        });
        const [imgA, imgB] = await Promise.all([load(a), load(b)]);
        const w = width;
        // Same target box for both, so the canvas's zoom factor and any
        // aspect difference are normalised away before comparing.
        const h = Math.max(1, Math.round((w * (imgA.height / imgA.width + imgB.height / imgB.width)) / 2));
        const draw = (img) => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            if (!ctx)
                throw new Error('no 2d context');
            ctx.drawImage(img, 0, 0, w, h);
            return ctx.getImageData(0, 0, w, h).data;
        };
        const da = draw(imgA);
        const db = draw(imgB);
        let differing = 0;
        let maxDelta = 0;
        const total = w * h;
        for (let i = 0; i < da.length; i += 4) {
            const dr = Math.abs((da[i] ?? 0) - (db[i] ?? 0));
            const dg = Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0));
            const dbl = Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0));
            const delta = Math.max(dr, dg, dbl);
            if (delta > maxDelta)
                maxDelta = delta;
            if (delta > tolerance)
                differing += 1;
        }
        return { differingFraction: differing / total, maxChannelDelta: maxDelta };
    }, [
        `data:image/png;base64,${canvasPng.toString('base64')}`,
        `data:image/png;base64,${browserPng.toString('base64')}`,
        DIFF_WIDTH,
        CHANNEL_TOLERANCE,
    ]);
    return result;
};
/**
 * Render a fixture in the browser and screenshot its page root, leaving the
 * page open so the caller can also use it to run the comparison.
 */
export const screenshotInBrowser = async (browser, source, viewport) => {
    const page = await browser.newPage({ viewport });
    const document = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
${source.themeCss}
    </style>
    <style>
${source.css}
    </style>
  </head>
  <body style="margin: 0; min-height: 100vh">
${source.html}
  </body>
</html>`;
    await page.setContent(document, { waitUntil: 'load' });
    const png = await page.locator('.root').first().screenshot();
    return { png, page };
};
/**
 * Hide everything the browser has no counterpart for, before a paint
 * comparison.
 *
 * `locator.screenshot()` captures whatever is painted over the element's
 * box, so the canvas toolbar and the shortcuts panel landed in the first
 * capture and accounted for the entire difference. Rather than enumerate
 * app chrome — which changes — hide all of it and re-show only the frame,
 * then take out the canvas-only affordances that live *inside* the frame
 * and legitimately have no browser equivalent.
 */
export const hideCanvasChrome = async (page) => {
    await page.addStyleTag({
        content: `
      body * { visibility: hidden !important; }
      [${CANVAS_SCOPE_ATTR}], [${CANVAS_SCOPE_ATTR}] * { visibility: visible !important; }
      [data-testid="selection-overlay"],
      [data-testid="grid-overlay"],
      [data-testid="overflow-indicator"],
      /* CSS-module class names keep the source name in them, so this
         catches the interaction layer without importing its stylesheet. */
      [${CANVAS_SCOPE_ATTR}] [class*="nteractionLayer"],
      [${CANVAS_SCOPE_ATTR}] [class*="andle"] { visibility: hidden !important; }
    `,
    });
    // The iframe canvas experiment draws its outlines inside the page, from marks.
    await page.evaluate(() => {
        const doc = document.querySelector('[data-testid="iframe-canvas"] iframe')?.contentDocument;
        if (!doc)
            return;
        const style = doc.createElement('style');
        style.textContent =
            '[data-scamp-selected], [data-scamp-editing], [data-scamp-prop-edit] { outline: none !important; }';
        doc.head.appendChild(style);
    });
};
export const COMPUTED_SCRIPT = (props) => `(() => {
  const props = ${JSON.stringify(props)};
  const out = {};
  for (const el of document.querySelectorAll('[data-scamp-id], [class]')) {
    const key = el.getAttribute('data-scamp-id') || el.className;
    if (typeof key !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(key)) continue;
    if (out[key]) continue;
    const cs = getComputedStyle(el);
    const entry = {};
    for (const p of props) entry[p] = cs.getPropertyValue(p).trim();
    out[key] = entry;
  }
  return out;
})()`;
export const measureComputed = async (page, props) => (await page.evaluate(COMPUTED_SCRIPT(props)));
export const compareComputed = (canvas, browser) => {
    const out = [];
    for (const [element, expected] of Object.entries(browser)) {
        const actual = canvas[element];
        if (!actual)
            continue;
        for (const [property, value] of Object.entries(expected)) {
            const mine = actual[property] ?? '';
            if (mine !== value) {
                out.push({ element, property, canvas: mine, browser: value });
            }
        }
    }
    return out;
};
export const describeComputed = (divergences) => divergences
    .map((d) => `  ${d.element}.${d.property}: canvas "${d.canvas}" vs browser "${d.browser}"`)
    .join('\n');
/** Render a fixture in a browser and read its computed styles. */
export const computedInBrowser = async (browser, source, viewport, props) => {
    const page = await browser.newPage({ viewport });
    try {
        await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">` +
            `<style>${source.themeCss}</style><style>${source.css}</style>` +
            `</head><body style="margin:0;min-height:100vh">${source.html}</body></html>`, { waitUntil: 'load' });
        return await measureComputed(page, props);
    }
    finally {
        await page.close();
    }
};
export const startFrameworkServer = async (projectDir) => {
    const { spawn } = await import('child_process');
    const bin = path.resolve(__dirname, '../../../node_modules/scampjs/bin/scamp.js');
    const child = spawn(process.execPath, [bin, 'dev'], {
        cwd: projectDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
        stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
        stderr += chunk;
    });
    const close = () => new Promise((resolve) => {
        if (child.exitCode !== null) {
            resolve();
            return;
        }
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
    });
    const url = await new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            const match = /^scamp dev ready (http:\/\/127\.0\.0\.1:\d+)$/m.exec(stdout);
            if (match?.[1] !== undefined) {
                resolve(match[1]);
            }
            else if (child.exitCode !== null) {
                reject(new Error(`scamp dev exited with ${child.exitCode}\n${stderr}`));
            }
            else if (Date.now() - started > 30_000) {
                reject(new Error(`scamp dev never became ready\n${stdout}\n${stderr}`));
            }
            else {
                setTimeout(tick, 50);
            }
        };
        tick();
    });
    return { url, close };
};
/** Measure a served page instead of hand-written HTML. */
export const measureUrlInBrowser = async (browser, url, viewport) => {
    const page = await browser.newPage({ viewport });
    try {
        await page.goto(url, { waitUntil: 'load' });
        return await measure(page);
    }
    finally {
        await page.close();
    }
};

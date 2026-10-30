import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, expect, stubOpenDialog } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
/** Resident memory of the window's renderer process, in MB (Linux). */
const rendererRssMb = async (app) => {
    const pid = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId() ?? 0);
    const status = await fs.readFile(`/proc/${pid}/status`, 'utf-8');
    const kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    return Math.round(kb / 1024);
};
const bench = (window, fn) => window.evaluate((src) => {
    const b = globalThis.__scampIframeCanvas;
    return new Function('b', `return (${src})(b)`)(b);
}, fn.toString());
const copyProject = async (from) => {
    const to = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-c1-speed-')), path.basename(from));
    await fs.cp(from, to, {
        recursive: true,
        filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.git`),
    });
    return to;
};
const openProject = async (app, window, dir) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.getByRole('button', { name: '← Projects' }).click();
    await stubOpenDialog(app, dir);
    await window.getByRole('button', { name: 'Open Project' }).click();
    await expect(window.getByTestId('canvas-frame')).toBeVisible();
};
const measurePage = async (app, window, label, frames) => {
    await window.waitForTimeout(1500);
    const today = await bench(window, (b) => b.benchEdits(20));
    const rssToday = await rendererRssMb(app);
    await bench(window, (b) => b.set(true));
    await expect(window.locator('[data-testid="iframe-canvas"] iframe')).toBeVisible();
    await window.waitForTimeout(1500);
    const firstDrawMs = await bench(window, (b) => b.stats.firstDrawMs);
    const before = await bench(window, (b) => b.stats.updates.length);
    const iframe = await bench(window, (b) => b.benchEdits(20));
    const updates = await bench(window, (b) => b.stats.updates);
    const split = updates.slice(before);
    const avg = (k) => Math.round((split.reduce((n, u) => n + u[k], 0) / Math.max(1, split.length)) * 10) / 10;
    const result = {
        label,
        today,
        iframe,
        iframeFirstDrawMs: firstDrawMs === null ? null : Math.round(firstDrawMs),
        iframeAvgBuildMs: avg('buildMs'),
        iframeAvgPatchMs: avg('patchMs'),
    };
    result['rssTodayMb'] = rssToday;
    result['rssIframeMb'] = await rendererRssMb(app);
    if (frames) {
        result['frames30'] = await bench(window, (b) => b.benchFrames(30, true));
        result['rssWith30FramesMb'] = await rendererRssMb(app);
        await bench(window, (b) => b.removeFrames());
    }
    console.log(`C1-SPEED ${JSON.stringify(result)}`);
    await bench(window, (b) => b.set(false));
};
const openPage = async (window, slug) => {
    await window.locator('[data-page-slug]').filter({ hasText: slug }).first().click();
    await window.waitForTimeout(1000);
};
test.describe('iframe C1: speed', () => {
    test.setTimeout(600_000);
    test('a large imported page', async ({ app, window }) => {
        const dir = await copyProject('/home/angie-hemans/Documents/scamp-files/website-import');
        await openProject(app, window, dir);
        for (const slug of [/ruixen/i, /gainwix-an-ai$/i, /resova-health$/i]) {
            await openPage(window, slug);
            await measurePage(app, window, String(slug), false);
        }
    });
    test('glitch views, and 30 frames', async ({ app, window }) => {
        const dir = await copyProject('/home/angie-hemans/Documents/github/glitch/ui/glitch');
        await openProject(app, window, dir);
        await openPage(window, /songs/i);
        await measurePage(app, window, 'glitch songs', true);
    });
});
const SYNTHETIC_COUNT = 1000;
test.describe('iframe C1: speed, synthetic', () => {
    test.setTimeout(300_000);
    const rows = Array.from({ length: SYNTHETIC_COUNT }, (_, i) => i.toString(16).padStart(4, '0'));
    test.use({
        projectOptions: {
            pageContent: {
                home: {
                    tsx: `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
${rows.map((id) => `      <div data-scamp-id="rect_${id}" className={styles.rect_${id}} />`).join('\n')}
    </div>
  );
}
`,
                    css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}
${rows
                        .map((id, i) => `
.rect_${id} {
  width: 40px;
  height: 40px;
  position: absolute;
  left: ${(i % 30) * 46}px;
  top: ${Math.floor(i / 30) * 46}px;
  background: #4466${(i % 200).toString(16).padStart(2, '0')};
  border-radius: 6px;
}`)
                        .join('\n')}
`,
                },
            },
        },
    });
    test(`${SYNTHETIC_COUNT} rectangles`, async ({ app, window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await measurePage(app, window, `synthetic ${SYNTHETIC_COUNT}`, true);
    });
});

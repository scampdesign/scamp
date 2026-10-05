import { test as base, _electron as electron } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { createTestProject, } from './project';
import { OZONE_ARGS } from './launchArgs';
/**
 * Replace `dialog.showOpenDialog` in the main process so the next call
 * resolves to `filePaths: [filePath]` without opening a native dialog.
 * Used by image-tool / background-image specs that would otherwise
 * hang on a real file picker. The patch lives for the rest of the
 * Electron session — tests should re-stub per scenario if needed.
 */
export const stubOpenDialog = async (app, filePath) => {
    await app.evaluate(({ dialog }, p) => {
        const patched = async () => ({
            canceled: false,
            filePaths: [p],
        });
        // Playwright gives us access to the live `dialog` module — override
        // both showOpenDialog and its sync variant just in case.
        dialog.showOpenDialog = patched;
    }, filePath);
};
/**
 * Replace `dialog.showSaveDialog` so the next call returns
 * `filePath: <path>` without opening a native dialog. Used by export
 * specs that need a deterministic save target without a real picker.
 */
export const stubSaveDialog = async (app, filePath) => {
    await app.evaluate(({ dialog }, p) => {
        const patched = async () => ({
            canceled: false,
            filePath: p,
        });
        dialog.showSaveDialog = patched;
    }, filePath);
};
/** A minimal 1x1 PNG suitable for image-tool tests. */
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f00050001ff5ca2bf430000000049454e44ae426082', 'hex');
export const writeFixtureImage = async (dir, name = 'pixel.png') => {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, PNG_BYTES);
    return filePath;
};
/**
 * The same PNG, but in its own temp dir OUTSIDE the project — which is
 * where a user's source image actually lives.
 *
 * Writing it inside the project makes the watcher fire an unsuppressed
 * change for a file the app never wrote, and the resulting reload can
 * land in the middle of the import and discard the edit under test. That
 * made the import specs flaky the moment importing got slower. Mirrors
 * `writeFixtureSvg`, which already avoids this for the same reason.
 *
 * Use `writeFixtureImage` only when the point IS to place a file inside
 * the project (e.g. seeding the assets folder to test reuse).
 */
export const writeFixtureImageOutside = async (name = 'pixel.png') => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-img-'));
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, PNG_BYTES);
    return filePath;
};
/**
 * A two-colour SVG with an explicit viewBox — for the import / colour /
 * viewBox-scaling specs. Written OUTSIDE the project (its own temp dir) so
 * the project watcher never sees the source (which would otherwise collide
 * with the copied asset's basename and fire a spurious reload).
 */
const SVG_FIXTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
    '<rect x="2" y="2" width="20" height="20" fill="#ff0000"/>' +
    '<circle cx="12" cy="12" r="6" fill="#00ff00"/>' +
    '</svg>';
export const writeFixtureSvg = async (name = 'icon.svg', content = SVG_FIXTURE) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-svg-'));
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, content);
    return filePath;
};
/**
 * Path to the built Electron main entry. `npm run build` must have been
 * executed before launching — Playwright doesn't start the dev server.
 */
const MAIN_ENTRY = path.resolve(__dirname, '../../../out/main/index.js');
/**
 * Dismiss the first-launch Sentry crash-reporting prompt if it's
 * showing. The prompt mounts before any project / start-screen view
 * and would otherwise block every selector. Specs that build their
 * own `window` fixture (e.g. `settings/app-settings.spec.ts`) should
 * call this from inside their fixture so the prompt doesn't leak.
 */
export const dismissSentryPrompt = async (window) => {
    const optOut = window.getByRole('button', { name: /^No thanks$/i });
    try {
        await optOut.waitFor({ state: 'visible', timeout: 2_000 });
        await optOut.click();
    }
    catch {
        // Not shown this run — already resolved, or IPC hasn't resolved
        // yet. Either way, nothing to do.
    }
};
/**
 * Isolated `userData` dir per spec so recent-projects history and app
 * settings don't bleed between tests or into the real profile.
 */
const makeUserDataDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-userdata-'));
export const test = base.extend({
    projectOptions: [{}, { option: true }],
    appEnv: [{}, { option: true }],
    project: async ({ projectOptions }, use) => {
        const project = await createTestProject(projectOptions);
        try {
            await use(project);
        }
        finally {
            await project.cleanup();
        }
    },
    app: async ({ project, appEnv }, use) => {
        const userDataDir = await makeUserDataDir();
        const app = await electron.launch({
            args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...OZONE_ARGS],
            env: {
                ...process.env,
                SCAMP_E2E: '1',
                SCAMP_E2E_OPEN_PROJECT: project.dir,
                NODE_ENV: 'test',
                ...appEnv,
            },
        });
        try {
            await use(app);
        }
        finally {
            // Belt-and-suspenders: kill any live ptys before tearing down
            // the Electron app. The main process also does this in its
            // `before-quit` handler, but if a spec timed out mid-pty-spawn
            // and node-pty's signal handling is being flaky on macOS, this
            // makes sure we don't sit waiting on a SIGTERM that the shell
            // is ignoring. See `src/main/ipc/terminal.ts:disposeAllTerminals`.
            await app
                .evaluate(async () => {
                const g = globalThis;
                if (g.__scampDisposeTerminals)
                    await g.__scampDisposeTerminals();
            })
                .catch(() => {
                // App may already be gone — that's fine, nothing to clean.
            });
            await app.close().catch(() => {
                // Swallow close errors — they're expected when a spec fails mid-run.
            });
            await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {
                // Best-effort cleanup.
            });
        }
    },
    window: async ({ app }, use) => {
        const window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await dismissSentryPrompt(window);
        await use(window);
    },
});
export { expect } from '@playwright/test';

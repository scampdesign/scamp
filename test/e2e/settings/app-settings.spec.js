import { test as base, expect, _electron as electron, } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { dismissSentryPrompt, stubOpenDialog } from '../fixtures/app';
import { OZONE_ARGS } from '../fixtures/launchArgs';
/**
 * App-level settings live on the Start Screen, so this spec launches
 * Electron WITHOUT the SCAMP_E2E_OPEN_PROJECT env var — unlike the
 * other specs in the suite, we want the Start Screen UI, not an
 * auto-opened project.
 */
const MAIN_ENTRY = path.resolve(__dirname, '../../../out/main/index.js');
const test = base.extend({
    userDataDir: async ({}, use) => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-userdata-'));
        try {
            await use(dir);
        }
        finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => { });
        }
    },
    app: async ({ userDataDir }, use) => {
        const app = await electron.launch({
            args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...OZONE_ARGS],
            env: {
                ...process.env,
                SCAMP_E2E: '1',
                NODE_ENV: 'test',
            },
        });
        try {
            await use(app);
        }
        finally {
            await app.close().catch(() => { });
        }
    },
    window: async ({ app }, use) => {
        const window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await dismissSentryPrompt(window);
        await use(window);
    },
});
test.describe('settings: app-level', () => {
    test('opens the Start Screen by default when no project is auto-opened', async ({ window, }) => {
        // Start Screen renders the "New Project" button.
        await expect(window.getByRole('button', { name: /New Project/ })).toBeVisible();
    });
    test('picking a default projects folder persists it on disk', async ({ window, app, }) => {
        const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-proj-'));
        try {
            await stubOpenDialog(app, folder);
            // Navigate to Settings from the Start Screen.
            await window.getByRole('button', { name: /Settings/ }).click();
            await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();
            await expect(window.getByText('Not set')).toBeVisible();
            // Click Choose → the stubbed dialog returns our temp folder.
            await window.getByRole('button', { name: 'Choose' }).click();
            // The folder path is now rendered in the settings row.
            await expect(window.getByText(folder)).toBeVisible();
            // Clear reverts to "Not set".
            await window.getByRole('button', { name: 'Clear' }).click();
            await expect(window.getByText('Not set')).toBeVisible();
        }
        finally {
            await fs.rm(folder, { recursive: true, force: true }).catch(() => { });
        }
    });
    /**
     * The privacy toggle, end to end.
     *
     * The install id is what makes users countable, so the promise made in
     * the UI — "just a random ID for this install", removed if you opt out
     * — has to hold on disk. The pure pieces are unit-tested; this is the
     * only level that proves the button actually reaches them.
     * see docs/archive/2026-08-11-dau-tracking-plan.md
     */
    test('the privacy toggle mints an install id, and opting out removes it', async ({ window, userDataDir, }) => {
        const settingsFile = path.join(userDataDir, 'settings.json');
        const readSettings = async () => {
            try {
                return JSON.parse(await fs.readFile(settingsFile, 'utf-8'));
            }
            catch {
                return {};
            }
        };
        await window.getByRole('button', { name: /Settings/ }).click();
        await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();
        await window.getByRole('button', { name: 'On', exact: true }).click();
        await expect.poll(async () => (await readSettings())['sentryOptIn']).toBe(true);
        // Poll for the id as well. `sentryOptIn` and `installId` do not land
        // in the same write, so a settled toggle does not imply the id has
        // been minted yet — reading straight through here failed
        // intermittently with `installId: null`. The opt-out half below
        // always polled; this half did not.
        await expect
            .poll(async () => typeof (await readSettings())['installId'])
            .toBe('string');
        // A v4 UUID, generated locally — not derived from anything about the
        // machine or the person.
        const optedIn = await readSettings();
        expect(optedIn['installId']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        await window.getByRole('button', { name: 'Off', exact: true }).click();
        await expect.poll(async () => (await readSettings())['sentryOptIn']).toBe(false);
        // The identifier is GONE, not merely unused — opting out has to
        // remove it, or the next opt-in would resurrect the same id.
        await expect
            .poll(async () => (await readSettings())['installId'])
            .toBeNull();
    });
});

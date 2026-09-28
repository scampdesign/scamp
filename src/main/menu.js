import { app, Menu, shell } from 'electron';
import * as os from 'os';
/**
 * Scamp's application menu.
 *
 * Builds the cross-platform standard menus (File / Edit / View /
 * Window) using Electron's role-based entries so the user gets the
 * expected OS behaviour — Cmd+Q to quit on macOS, Cmd+W to close
 * window, copy/paste in inputs, zoom toggles, full-screen, etc. —
 * without us reimplementing the actions.
 *
 * The custom-to-Scamp entry is Help → Report a bug, which opens a
 * GitHub issue page pre-filled with the user's Scamp version and
 * OS. The bug-report template lives at
 * `.github/ISSUE_TEMPLATE/bug_report.md` in the repo.
 */
const REPO_URL = 'https://github.com/scampdesign/scamp';
/**
 * Build the GitHub new-issue URL with version + OS pre-filled in
 * the body. The renderer never sees this URL — we open it from
 * main via `shell.openExternal` so the user lands in their
 * default browser.
 */
export const buildBugReportUrl = () => {
    const version = app.getVersion();
    const platformLabel = `${process.platform} ${os.release()}`;
    const body = [
        `**App version:** ${version}`,
        `**OS:** ${platformLabel}`,
        '',
        '## Steps to reproduce',
        '',
        '1. ',
        '',
        '## Expected behaviour',
        '',
        '',
        '## Actual behaviour',
        '',
        '',
        '## Screenshots',
        '',
    ].join('\n');
    const params = new URLSearchParams({
        template: 'bug_report.md',
        labels: 'bug',
        body,
    });
    return `${REPO_URL}/issues/new?${params.toString()}`;
};
export const buildApplicationMenu = () => {
    const isMac = process.platform === 'darwin';
    const template = [
        // macOS-only app menu (Scamp → About / Hide / Quit). Other
        // platforms get an empty slot — the role: 'fileMenu' entry
        // becomes the leftmost menu instead.
        ...(isMac
            ? [{ role: 'appMenu' }]
            : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Report a bug',
                    click: () => {
                        void shell.openExternal(buildBugReportUrl());
                    },
                },
                { type: 'separator' },
                {
                    label: 'Scamp on GitHub',
                    click: () => {
                        void shell.openExternal(REPO_URL);
                    },
                },
            ],
        },
    ];
    return Menu.buildFromTemplate(template);
};

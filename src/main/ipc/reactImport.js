import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { inspectReactFolder, startReactApp } from '../reactImport/appServer';
/**
 * React app import, app window side. A folder is chosen through the
 * system dialog here, and only a folder chosen that way can be started:
 * the renderer can't name an arbitrary path and have its scripts run.
 * see docs/plans/react-import-plan.md
 */
const FRAMEWORK_LABEL = {
    vite: 'Vite',
    next: 'Next.js',
    cra: 'Create React App',
};
/** Folders the user picked in the dialog, the only ones that can be started. */
const chosen = new Set();
export const registerReactImportIpc = () => {
    ipcMain.handle(IPC.ReactImportInspect, async (e) => {
        const owner = BrowserWindow.fromWebContents(e.sender);
        const options = {
            title: 'Choose a React project',
            buttonLabel: 'Choose',
            properties: ['openDirectory'],
        };
        const picked = owner === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(owner, options);
        const folder = picked.filePaths[0];
        if (picked.canceled || folder === undefined)
            return { kind: 'cancelled' };
        const detected = await inspectReactFolder(folder);
        if (!detected.ok)
            return { kind: 'unsupported', folder, reason: detected.reason };
        chosen.add(folder);
        const { project } = detected;
        return {
            kind: 'ok',
            folder,
            name: project.name,
            framework: FRAMEWORK_LABEL[project.framework],
            installCommand: project.needsInstall ? `${project.packageManager} install` : null,
            // The port Scamp adds is its own business; this is the script the user knows.
            devCommand: `${project.packageManager} run ${project.devScript}`,
        };
    });
    ipcMain.handle(IPC.ReactImportStart, async (e, args) => {
        if (typeof args?.folder !== 'string' || !chosen.has(args.folder) || typeof args.projectPath !== 'string') {
            return { ok: false, error: 'Choose the React project folder again.' };
        }
        const sender = e.sender;
        return startReactApp(args.projectPath, args.folder, (event) => {
            if (!sender.isDestroyed())
                sender.send(IPC.ReactImportProgress, event);
        });
    });
};

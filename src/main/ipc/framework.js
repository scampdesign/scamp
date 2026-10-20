import { spawn } from 'child_process';
import { ipcMain, net } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { ensureDevServer, getDevServerStatus, stopDevServer } from '../devServer/devServerManager';
import { newerUsableVersion, parseVersion, readFrameworkInfo } from './frameworkVersion';
import { assertInsideActiveProject } from './pathContainment';
/** The installed framework, and a newer release to update to, if npm has one. */
export const checkFrameworkUpdate = async (projectPath) => {
    const installed = await readFrameworkInfo(projectPath);
    if (installed.installedVersion === null)
        return { installed, updateTo: null };
    try {
        const response = await net.fetch('https://registry.npmjs.org/scampjs', {
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
            return { installed, updateTo: null };
        return { installed, updateTo: newerUsableVersion(await response.json(), installed.installedVersion) };
    }
    catch {
        // Offline: nothing to offer, which isn't worth an error.
        return { installed, updateTo: null };
    }
};
/**
 * `npm install scampjs@<version>` in the project. A running preview is
 * stopped for the install (it runs the installed framework) and started
 * again after. Rejects with npm's last lines of output when it fails.
 */
export const updateFramework = async (projectPath, version) => {
    // Validated: it becomes an npm argument, through a shell on Windows.
    if (parseVersion(version) === null)
        throw new Error(`Not a scampjs release: ${version}`);
    const previewWasRunning = getDevServerStatus(projectPath).kind !== 'idle';
    await stopDevServer(projectPath);
    await new Promise((resolve, reject) => {
        let output = '';
        // --prefer-online: the version offered came from the registry just now,
        // and npm's cached metadata can predate it, failing with ETARGET.
        const proc = spawn('npm', ['install', `scampjs@${version}`, '--prefer-online'], {
            cwd: projectPath,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });
        const collect = (data) => {
            output = (output + data.toString('utf8')).slice(-2000);
        };
        proc.stdout?.on('data', collect);
        proc.stderr?.on('data', collect);
        proc.on('error', reject);
        proc.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(output.trim().split('\n').slice(-5).join('\n') || `npm install exited with code ${code}`));
        });
    });
    if (previewWasRunning)
        void ensureDevServer(projectPath);
    return readFrameworkInfo(projectPath);
};
/** Register the framework IPC: checking npm for a newer scampjs, and installing it. */
export const registerFrameworkIpc = () => {
    ipcMain.handle(IPC.FrameworkCheckUpdate, (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        return checkFrameworkUpdate(args.projectPath);
    });
    ipcMain.handle(IPC.FrameworkUpdate, (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        return updateFramework(args.projectPath, args.version);
    });
};

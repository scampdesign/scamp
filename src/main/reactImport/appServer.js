import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { allocateFreePort } from '../devServer/portAlloc';
import { detectReactProject } from './detect';
const running = new Map();
/** The folder read the way the import will: package.json and what's beside it. */
export const inspectReactFolder = async (dir) => {
    let pkg;
    try {
        pkg = JSON.parse(await fs.readFile(join(dir, 'package.json'), 'utf-8'));
    }
    catch {
        return { ok: false, reason: 'That folder has no package.json Scamp can read.' };
    }
    const top = await fs.readdir(dir).catch(() => []);
    const nested = [];
    for (const sub of ['src/app', 'src/pages']) {
        if (await fs.stat(join(dir, sub)).then((s) => s.isDirectory(), () => false))
            nested.push(sub);
    }
    return detectReactProject(pkg, [...top, ...nested]);
};
/** Kill the process and everything it started — `npm run dev` is a tree. */
const killTree = (proc) => {
    if (proc.pid === undefined || proc.exitCode !== null)
        return;
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        }
        else {
            process.kill(-proc.pid, 'SIGTERM');
        }
    }
    catch {
        // Already gone.
    }
};
const run = (command, args, cwd, env, onLog) => {
    const proc = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env, FORCE_COLOR: '0', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Windows resolves `npm` (a .cmd shim) only through the shell.
        shell: process.platform === 'win32',
        // Its own process group, so stopping it stops what it spawned.
        detached: process.platform !== 'win32',
    });
    proc.stdout?.on('data', (d) => onLog(d.toString('utf8')));
    proc.stderr?.on('data', (d) => onLog(d.toString('utf8')));
    return proc;
};
const waitForExit = (proc) => new Promise((resolve) => {
    if (proc.exitCode !== null)
        resolve(proc.exitCode);
    proc.on('exit', (code) => resolve(code ?? -1));
    proc.on('error', () => resolve(-1));
});
/** Poll until the server answers. Rejects if it exits or takes too long. */
const waitForServer = async (url, proc, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null)
            throw new Error(`The dev server stopped before it was ready (exit ${proc.exitCode}).`);
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (res.status < 500)
                return;
        }
        catch {
            // Not listening yet.
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('The dev server didn’t answer within two minutes.');
};
/**
 * Install if needed, then start the app's dev server on a free port.
 * One per key (the Scamp project importing it); a second call while one
 * runs returns the same URL.
 */
export const startReactApp = async (key, dir, onEvent) => {
    const existing = running.get(key);
    if (existing !== undefined && existing.process.exitCode === null)
        return { ok: true, url: existing.url };
    const detected = await inspectReactFolder(dir);
    if (!detected.ok)
        return { ok: false, error: detected.reason };
    const { project } = detected;
    const log = (text) => onEvent({ kind: 'log', text });
    if (project.needsInstall) {
        onEvent({ kind: 'phase', phase: 'installing' });
        const install = run(project.packageManager, ['install'], dir, {}, log);
        const code = await waitForExit(install);
        if (code !== 0)
            return { ok: false, error: `${project.packageManager} install failed (exit ${code}).` };
    }
    onEvent({ kind: 'phase', phase: 'starting' });
    const port = await allocateFreePort();
    const { command, args, env } = project.devCommand(port);
    const proc = run(command, args, dir, env, log);
    const url = `http://localhost:${port}`;
    running.set(key, { process: proc, url, folder: dir });
    proc.on('exit', () => {
        if (running.get(key)?.process === proc)
            running.delete(key);
    });
    try {
        await waitForServer(url, proc, 120_000);
        return { ok: true, url };
    }
    catch (err) {
        killTree(proc);
        running.delete(key);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
};
/** The folder of the app Scamp is running for this key, if it is running one. */
export const reactAppFolder = (key) => running.get(key)?.folder ?? null;
export const stopReactApp = (key) => {
    const entry = running.get(key);
    if (entry === undefined)
        return;
    running.delete(key);
    killTree(entry.process);
};
/** Stop the server at this address, if Scamp started it. */
export const stopReactAppAt = (url) => {
    let origin;
    try {
        origin = new URL(url).origin;
    }
    catch {
        return;
    }
    for (const [key, entry] of running) {
        if (new URL(entry.url).origin === origin)
            stopReactApp(key);
    }
};
export const stopAllReactApps = () => {
    for (const key of [...running.keys()])
        stopReactApp(key);
};

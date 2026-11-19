/**
 * Dev launcher for `npm run dev`.
 *
 * Picks the Linux ozone backend before electron-vite starts Electron.
 * The main process can't fix this itself in dev: its relaunch would
 * make electron-vite exit and take the Vite server with it.
 *
 * The rules here mirror `resolveOzonePlatform` in src/main/ozone.ts,
 * which is the source of truth for the packaged app. They're repeated
 * rather than imported because ozone.ts is TypeScript, which this plain
 * Node script can't import without a bundler.
 * see docs/notes/linux-wayland-ozone.md
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolveOzonePlatform = () => {
  if (process.platform !== 'linux') return null;
  const wanted = process.env.SCAMP_OZONE_PLATFORM?.trim();
  if (wanted !== undefined && wanted !== '') {
    return wanted === 'auto' ? null : wanted;
  }
  return 'x11';
};

const passthrough = process.argv.slice(2);
const ozonePlatform = resolveOzonePlatform();

// electron-vite forwards everything after `--` to the Electron process.
const args = ['dev', ...passthrough];
if (ozonePlatform !== null && !passthrough.includes('--')) {
  args.push('--', `--ozone-platform=${ozonePlatform}`);
}

const child = spawn(path.join(root, 'node_modules/.bin/electron-vite'), args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

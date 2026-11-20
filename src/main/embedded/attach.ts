import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

import type { RailsFacts } from './preflight';

/**
 * Attaching to an app that is already running (a Rails app first): the
 * address, what the folder is, its routes, and when its CSS has rebuilt.
 * Scamp never starts or stops an attached app.
 * see docs/plans/embedded-rails-plan.md
 */

/** `3010`, `localhost:3010` or a full http(s) URL, as a URL; null when it isn't one. */
export const normalizeAttachUrl = (input: string): string | null => {
  const raw = input.trim();
  if (/^\d{2,5}$/.test(raw)) return `http://localhost:${raw}/`;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

/** Gem names a Gemfile asks for. */
export const gemsIn = (gemfile: string): Set<string> =>
  new Set([...gemfile.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? ''));

/** Whether a development config turns template comments on; null when it doesn't say. */
export const annotatesTemplates = (config: string): boolean | null => {
  const m = /^[^#\n]*annotate_rendered_view_with_filenames\s*=\s*(true|false)/m.exec(config);
  return m === null ? null : m[1] === 'true';
};

const read = (path: string): Promise<string> => fs.readFile(path, 'utf8').catch(() => '');

export const readRailsFacts = async (folder: string): Promise<RailsFacts> => {
  const gemfile = await read(join(folder, 'Gemfile'));
  let appIn: string | null = null;
  if (gemfile === '') {
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && gemsIn(await read(join(folder, entry.name, 'Gemfile'))).has('rails')) {
        appIn = entry.name;
        break;
      }
    }
  }
  const gems = gemsIn(gemfile);
  const lock = await read(join(folder, 'Gemfile.lock'));
  return {
    rails: gems.has('rails'),
    version: /^ {4}rails \(([^)]+)\)/m.exec(lock)?.[1] ?? null,
    tailwind: gems.has('tailwindcss-rails'),
    turbo: gems.has('turbo-rails'),
    viewComponent: gems.has('view_component'),
    annotated: annotatesTemplates(await read(join(folder, 'config', 'environments', 'development.rb'))),
    appIn,
  };
};

/** Whether anything answers at `url`, following redirects (`/` to `/login` is fine). */
export const probeUrl = async (url: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    await res.body?.cancel();
    return res.status < 500 ? { ok: true } : { ok: false, error: `It answered with an error (${res.status}).` };
  } catch {
    return { ok: false, error: 'Nothing answered there.' };
  }
};

/** The pages a `bin/rails routes` table lists: GET routes with no values to fill in. */
export const parseRailsRoutes = (text: string): string[] => {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    const m = /(?:^|\s)(?:[A-Z]+\|)*GET(?:\|[A-Z]+)*\s+([/(]\S*)/.exec(line);
    if (m === null) continue;
    let path = m[1] ?? '';
    // Optional parts, `(.:format)` among them, are left out.
    for (let before = ''; before !== path; ) {
      before = path;
      path = path.replace(/\([^()]*\)/g, '');
    }
    if (path.includes(':') || path.includes('*') || path.startsWith('/rails/')) continue;
    out.add(path === '' ? '/' : path);
  }
  return [...out].sort();
};

/** The app's routes, from `bin/rails routes`; empty when Ruby or the command isn't there. */
export const railsRoutes = (folder: string): Promise<string[]> =>
  new Promise((done) => {
    execFile('ruby', ['bin/rails', 'routes'], { cwd: folder, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      done(err === null ? parseRailsRoutes(String(stdout)) : []);
    });
  });

const cssMtimes = async (dir: string): Promise<number[]> => {
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.css'));
  return Promise.all(names.map((n) => fs.stat(join(dir, n)).then((s) => s.mtimeMs, () => 0)));
};

/**
 * Wait for a CSS watcher (`bin/rails tailwindcss:watch`) to rebuild after a
 * run wrote files, so the reload shows the new styles: until a file in
 * `app/assets/builds` is newer than `since`, or `timeoutMs` passes. Returns
 * at once when the app builds no CSS there.
 */
export const waitForCssBuild = async (folder: string, since: number, timeoutMs = 3000): Promise<void> => {
  const dir = join(folder, 'app', 'assets', 'builds');
  if ((await cssMtimes(dir)).length === 0) return;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await cssMtimes(dir)).some((t) => t > since)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
};

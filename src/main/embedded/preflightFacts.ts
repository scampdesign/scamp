import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

import { inspectReactFolder } from '../reactImport/appServer';
import { gitIdentity, hasOrigin, isRepo, parseStatus, git } from './git';
import { detectIdioms } from './idiom';
import type { PreflightFacts } from './preflight';
import { listProjectFiles } from './projectFiles';

/**
 * Gathering what the setup screen decides on: the folder, git, the
 * toolchain on this machine, and a read of the project's own files. Every
 * check here only reads; nothing runs the project's scripts.
 * see docs/plans/embedded-scamp-plan.md
 */

const version = (command: string, args: string[]): Promise<string | null> =>
  new Promise((done) => {
    execFile(command, args, { timeout: 10_000, shell: process.platform === 'win32' }, (err, stdout) => {
      done(err === null ? String(stdout).trim() : null);
    });
  });

const commandExists = async (command: string): Promise<boolean> => (await version(command, ['--version'])) !== null;

const readJson = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    const value: unknown = JSON.parse(await fs.readFile(path, 'utf-8'));
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const depNames = (pkg: Record<string, unknown> | null): string[] => {
  const out: string[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg?.[field];
    if (deps !== null && typeof deps === 'object') out.push(...Object.keys(deps as Record<string, unknown>));
  }
  return out;
};

const BACKEND_DEPS: Record<string, string> = {
  express: 'Express',
  fastify: 'Fastify',
  koa: 'Koa',
  '@prisma/client': 'Prisma',
  mongoose: 'MongoDB',
  pg: 'Postgres',
  mysql2: 'MySQL',
  firebase: 'Firebase',
  '@supabase/supabase-js': 'Supabase',
  '@apollo/client': 'a GraphQL server',
  'socket.io-client': 'a socket server',
};

/** Keys an env file sets: `KEY=value`, comments and blanks skipped. */
export const envKeys = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((k): k is string => k !== undefined);

/** `import.meta.env.VITE_X` names a source file reads. */
export const viteEnvReads = (text: string): string[] =>
  [...text.matchAll(/import\.meta\.env\.(VITE_[A-Za-z0-9_]+)/g)].map((m) => m[1] ?? '').filter((n) => n.length > 0);

export const gatherPreflightFacts = async (
  folder: string,
  accounts: { signedIn: boolean; agentConnected: boolean }
): Promise<PreflightFacts> => {
  const pkg = await readJson(join(folder, 'package.json'));
  const deps = depNames(pkg);
  const detected = await inspectReactFolder(folder);
  const files = await listProjectFiles(folder);
  const top = await fs.readdir(folder).catch(() => [] as string[]);

  const gitInstalled = (await version('git', ['--version'])) !== null;
  const repo = gitInstalled && (await isRepo(folder));
  const status = repo ? parseStatus((await git(folder, ['status', '--porcelain=v1', '-b'])).stdout) : null;

  const viteConfig = top.find((f) => /^vite\.config\.[cm]?[jt]s$/.test(f));
  const viteText = viteConfig !== undefined ? await fs.readFile(join(folder, viteConfig), 'utf-8').catch(() => '') : '';
  const reactPlugin = /@vitejs\/plugin-react-swc/.test(viteText) ? 'swc' : /@vitejs\/plugin-react/.test(viteText) ? 'babel' : null;

  // Env files: an example with nothing filled in, and names the code reads that nothing sets.
  const example = top.find((f) => /^\.env\.(example|sample|template)$/.test(f)) ?? null;
  const envFiles = top.filter((f) => /^\.env(\.local|\.development|\.development\.local)?$/.test(f));
  const defined = new Set<string>();
  for (const f of envFiles) envKeys(await fs.readFile(join(folder, f), 'utf-8').catch(() => '')).forEach((k) => defined.add(k));
  const reads = new Set<string>();
  const hints = new Set<string>();
  for (const dep of deps) if (BACKEND_DEPS[dep] !== undefined) hints.add(`It uses ${BACKEND_DEPS[dep]}`);
  if (/\bproxy\s*:/.test(viteText)) hints.add('Its Vite config proxies requests to a server');
  for (const file of files.filter((f) => /^src\/.*\.(tsx?|jsx?)$/.test(f)).slice(0, 600)) {
    const text = await fs.readFile(join(folder, file), 'utf-8').catch(() => '');
    viteEnvReads(text).forEach((n) => reads.add(n));
    if (/fetch\(\s*[`'"]\/api\//.test(text)) hints.add('It fetches from /api');
    if (/['"`]https?:\/\/localhost:\d{2,5}/.test(text)) hints.add('It calls a server on localhost');
  }

  const engines = pkg?.['engines'];
  const enginesNode =
    engines !== null && typeof engines === 'object' && typeof (engines as Record<string, unknown>)['node'] === 'string'
      ? ((engines as Record<string, string>)['node'] ?? null)
      : null;
  const pm = detected.ok ? detected.project.packageManager : null;

  return {
    folder,
    name: typeof pkg?.['name'] === 'string' ? (pkg['name'] as string) : basename(folder),
    signedIn: accounts.signedIn,
    agentConnected: accounts.agentConnected,
    gitInstalled,
    isRepo: repo,
    gitUser: repo ? await gitIdentity(folder) : null,
    hasRemote: repo ? await hasOrigin(folder) : false,
    dirty: (status?.changed.length ?? 0) > 0,
    nodeVersion: await version('node', ['-v']),
    enginesNode,
    packageManager: pm,
    packageManagerAvailable: pm === null ? false : await commandExists(pm),
    framework: detected.ok ? detected.project.framework : null,
    frameworkError: detected.ok ? null : detected.reason,
    needsInstall: detected.ok ? detected.project.needsInstall : false,
    reactPlugin,
    envExampleWithoutEnv: example !== null && envFiles.length === 0 ? example : null,
    missingEnvVars: [...reads].filter((n) => !defined.has(n)).sort(),
    backendHints: [...hints],
    idioms: detectIdioms(deps, files),
  };
};

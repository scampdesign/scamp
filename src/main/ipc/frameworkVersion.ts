import { promises as fs } from 'fs';
import { join } from 'path';

import { isSupportedContract } from '@shared/projectConfig';
import type { FrameworkInfo } from '@shared/types';

/**
 * What version of the framework a project has installed, and which
 * contract it implements — read from `node_modules/scampjs/package.json`
 * (the package keeps `./package.json` in its exports map for this).
 * A project that was never installed has neither; that isn't an error,
 * the banner just says which version to install.
 * see docs/plans/framework-phase-1-plan.md, step 6
 */
export const readFrameworkInfo = async (projectPath: string): Promise<FrameworkInfo> => {
  try {
    const raw = await fs.readFile(
      join(projectPath, 'node_modules', 'scampjs', 'package.json'),
      'utf-8'
    );
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { installedVersion: null, contract: null };
    const pkg = parsed as { version?: unknown; scampjs?: { contract?: unknown } };
    const version = typeof pkg.version === 'string' ? pkg.version : null;
    const contract =
      typeof pkg.scampjs?.contract === 'number' && Number.isInteger(pkg.scampjs.contract)
        ? pkg.scampjs.contract
        : null;
    return { installedVersion: version, contract };
  } catch {
    return { installedVersion: null, contract: null };
  }
};

/** The `scampjs` version range a project's package.json asks for, if any. */
export const readRequestedFrameworkRange = async (
  projectPath: string
): Promise<string | null> => {
  try {
    const raw = await fs.readFile(join(projectPath, 'package.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const pkg = parsed as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    const range = pkg.dependencies?.['scampjs'] ?? pkg.devDependencies?.['scampjs'];
    return typeof range === 'string' ? range : null;
  } catch {
    return null;
  }
};

/** `1.2.3` as numbers; null for a prerelease or anything else. */
export const parseVersion = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const isNewer = (a: [number, number, number], b: [number, number, number]): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/**
 * The newest release in an npm packument (`registry.npmjs.org/scampjs`)
 * that implements a contract this build supports, and is newer than
 * `installed`. Null when there's none, or `installed` isn't a release.
 */
export const newerUsableVersion = (packument: unknown, installed: string): string | null => {
  const current = parseVersion(installed);
  if (current === null || !packument || typeof packument !== 'object') return null;
  const versions = (packument as { versions?: unknown }).versions;
  if (!versions || typeof versions !== 'object') return null;
  let best: { name: string; parts: [number, number, number] } | null = null;
  for (const [name, meta] of Object.entries(versions)) {
    const parts = parseVersion(name);
    if (parts === null || !isNewer(parts, best?.parts ?? current)) continue;
    const contract = (meta as { scampjs?: { contract?: unknown } } | null)?.scampjs?.contract;
    if (isSupportedContract(contract)) best = { name, parts };
  }
  return best?.name ?? null;
};

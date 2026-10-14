import type { FrameworkInfo } from '@shared/types';
/**
 * What version of the framework a project has installed, and which
 * contract it implements — read from `node_modules/scampjs/package.json`
 * (the package keeps `./package.json` in its exports map for this).
 * A project that was never installed has neither; that isn't an error,
 * the banner just says which version to install.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
export declare const readFrameworkInfo: (projectPath: string) => Promise<FrameworkInfo>;
/** The `scampjs` version range a project's package.json asks for, if any. */
export declare const readRequestedFrameworkRange: (projectPath: string) => Promise<string | null>;
/** `1.2.3` as numbers; null for a prerelease or anything else. */
export declare const parseVersion: (version: string) => [number, number, number] | null;
/**
 * The newest release in an npm packument (`registry.npmjs.org/scampjs`)
 * that implements a contract this build supports, and is newer than
 * `installed`. Null when there's none, or `installed` isn't a release.
 */
export declare const newerUsableVersion: (packument: unknown, installed: string) => string | null;

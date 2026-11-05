import type { EmbeddedIdiom, EmbeddedPreflight } from '@shared/types';
/**
 * The setup screen's checks, decided from facts gathered elsewhere
 * (`preflightFacts.ts`). Pure, so every verdict is tested.
 *
 * The line between fixing and telling: Scamp does what is safe and
 * reversible (install, its own config, the branch, `git init` on request)
 * and reports what it can't own (the Node version, env files, a backend).
 * see docs/plans/embedded-scamp-plan.md
 */
export type PreflightFacts = {
    folder: string;
    name: string;
    signedIn: boolean;
    agentConnected: boolean;
    gitInstalled: boolean;
    isRepo: boolean;
    /** `Name <email>`, or null when git has no identity configured. */
    gitUser: string | null;
    hasRemote: boolean;
    dirty: boolean;
    nodeVersion: string | null;
    enginesNode: string | null;
    packageManager: string | null;
    packageManagerAvailable: boolean;
    /** Null when the folder isn't a React app at all. */
    framework: 'vite' | 'next' | 'cra' | null;
    frameworkError: string | null;
    needsInstall: boolean;
    /** Which React plugin the Vite config uses, which decides source mapping. */
    reactPlugin: 'babel' | 'swc' | null;
    envExampleWithoutEnv: string | null;
    missingEnvVars: string[];
    backendHints: string[];
    idioms: EmbeddedIdiom[];
};
/** The lowest major version a range allows, for the ranges package.json uses. */
export declare const minimumMajor: (range: string) => number | null;
/** Whether `version` (`v20.11.1`) meets `range`; null when the range can't be read. */
export declare const nodeSatisfies: (version: string, range: string) => boolean | null;
export declare const evaluatePreflight: (f: PreflightFacts) => EmbeddedPreflight;

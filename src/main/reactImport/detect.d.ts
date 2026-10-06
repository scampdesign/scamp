/**
 * What kind of React project a folder is, and how to run it.
 *
 * Pure: the caller reads `package.json` and lists the folder. Everything
 * the React import does next — start the dev server, find the routes —
 * depends on these answers, so a project this can't read is said to be
 * unsupported up front rather than failing somewhere later.
 * see docs/plans/react-import-plan.md
 */
export type ReactFramework = 'vite' | 'next' | 'cra';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type ReactRouterKind = 'react-router' | 'next-app' | 'next-pages' | 'none';
export type ReactProject = {
    name: string;
    framework: ReactFramework;
    packageManager: PackageManager;
    router: ReactRouterKind;
    /** The package.json script that starts the dev server. */
    devScript: string;
    /** Run this to start the dev server on `port`. */
    devCommand: (port: number) => {
        command: string;
        args: string[];
        env: Record<string, string>;
    };
    /** Dependencies aren't installed yet. */
    needsInstall: boolean;
};
export type DetectResult = {
    ok: true;
    project: ReactProject;
} | {
    ok: false;
    reason: string;
};
/**
 * `files` are paths relative to the project root: its top-level entries,
 * plus `src/app` and `src/pages` when they exist.
 */
export declare const detectReactProject: (packageJson: unknown, files: ReadonlyArray<string>) => DetectResult;

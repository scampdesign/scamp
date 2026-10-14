import type { FrameworkInfo, FrameworkUpdateCheck } from '@shared/types';
/** The installed framework, and a newer release to update to, if npm has one. */
export declare const checkFrameworkUpdate: (projectPath: string) => Promise<FrameworkUpdateCheck>;
/**
 * `npm install scampjs@<version>` in the project. A running preview is
 * stopped for the install (it runs the installed framework) and started
 * again after. Rejects with npm's last lines of output when it fails.
 */
export declare const updateFramework: (projectPath: string, version: string) => Promise<FrameworkInfo>;
/** Register the framework IPC: checking npm for a newer scampjs, and installing it. */
export declare const registerFrameworkIpc: () => void;

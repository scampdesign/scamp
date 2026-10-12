import type { PageLayoutEntry, ProjectConfig } from '@shared/types';
/** A change to the Pages list's layout; `undefined` in or out means "never grouped". */
export type PageLayoutUpdate = (current: PageLayoutEntry[] | undefined) => PageLayoutEntry[] | undefined;
export type UseProjectConfigResult = {
    projectConfig: ProjectConfig;
    handleProjectConfigChange: (next: ProjectConfig) => void;
    /**
     * Change `pageLayout` against the latest config, not a render's copy:
     * a rename and a drag in quick succession each spread `projectConfig`,
     * and the second would undo the first.
     */
    handlePageLayoutChange: (update: PageLayoutUpdate) => void;
};
/**
 * Owns the per-project `scamp.config.json`: reads it on open (defaults
 * render immediately so the canvas doesn't flash a wrong background while
 * the first read is in flight), exposes a change handler that writes back,
 * and mirrors the breakpoint table into the canvas store so deeply-nested
 * components can read it without prop drilling.
 */
export declare const useProjectConfig: (projectPath: string) => UseProjectConfigResult;

import type { ProjectData } from '@shared/types';
export type FrameworkUpdate = {
    installed: string | null;
    /** A newer release this build of Scamp can use, or null. */
    updateTo: string | null;
    updating: boolean;
    error: string | null;
    onUpdate: () => void;
};
/**
 * A Scamp-framework project's scampjs version, checked against npm while
 * Project Settings is open, and the install behind its Update button.
 */
export declare const useFrameworkUpdate: (project: ProjectData, active: boolean, onProjectChange: ((next: (prev: ProjectData) => ProjectData) => void) | undefined) => FrameworkUpdate | undefined;

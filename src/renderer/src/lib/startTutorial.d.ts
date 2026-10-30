import type { ProjectData } from '@shared/types';
/**
 * Create a fresh tutorial project in `parentPath`, start the checklist
 * over, and open on it. see docs/plans/onboarding-plan.md
 */
export declare const startTutorial: (parentPath: string) => Promise<ProjectData>;

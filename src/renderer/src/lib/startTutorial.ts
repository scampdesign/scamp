import type { ProjectData } from '@shared/types';
import { TUTORIAL_PROJECT_NAME } from '@shared/templates/tutorialProject';
import { useCanvasStore } from '@store/canvasSlice';
import { useOnboardingStore } from '@store/onboardingSlice';

/**
 * Create a fresh tutorial project in `parentPath`, start the checklist
 * over, and open on it. see docs/plans/onboarding-plan.md
 */
export const startTutorial = async (parentPath: string): Promise<ProjectData> => {
  const project = await window.scamp.createProject({
    parentPath,
    name: TUTORIAL_PROJECT_NAME,
    template: 'tutorial',
  });
  useOnboardingStore.getState().restart();
  useCanvasStore.getState().setSidebarSection('learn');
  return project;
};

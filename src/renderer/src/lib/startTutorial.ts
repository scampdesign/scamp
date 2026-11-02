import type { ProjectData } from '@shared/types';
import { TUTORIAL_PROJECT_NAME } from '@shared/templates/tutorialProject';
import { useCanvasStore } from '@store/canvasSlice';
import { useOnboardingStore } from '@store/onboardingSlice';
import { usePanelSizesStore } from '@store/panelSizesSlice';

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
  // The project opens later, so its shell can't see this switch to open a folded panel.
  usePanelSizesStore.getState().setSidebarCollapsed(false);
  return project;
};

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PageLayoutEntry, ProjectConfig } from '@shared/types';
import { DEFAULT_PROJECT_CONFIG } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';

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
export const useProjectConfig = (
  projectPath: string
): UseProjectConfigResult => {
  const [projectConfig, setProjectConfig] = useState<ProjectConfig>(
    DEFAULT_PROJECT_CONFIG
  );
  const latest = useRef(projectConfig);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const next = await window.scamp.readProjectConfig({ projectPath });
      if (cancelled) return;
      latest.current = next;
      setProjectConfig(next);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const handleProjectConfigChange = useCallback(
    (next: ProjectConfig): void => {
      latest.current = next;
      setProjectConfig(next);
      void window.scamp.writeProjectConfig({ projectPath, config: next });
    },
    [projectPath]
  );

  const handlePageLayoutChange = useCallback(
    (update: PageLayoutUpdate): void => {
      const { pageLayout: _previous, ...rest } = latest.current;
      const pageLayout = update(latest.current.pageLayout);
      handleProjectConfigChange(pageLayout === undefined ? rest : { ...rest, pageLayout });
    },
    [handleProjectConfigChange]
  );

  // Mirror the project's breakpoint table into the canvas store so
  // deeply-nested components (ElementRenderer, cascaded styles) can
  // read it without prop drilling.
  useEffect(() => {
    useCanvasStore.getState().setBreakpoints(projectConfig.breakpoints);
  }, [projectConfig.breakpoints]);

  return { projectConfig, handleProjectConfigChange, handlePageLayoutChange };
};

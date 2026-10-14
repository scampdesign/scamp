import { useEffect, useRef, useState } from 'react';

import type { ProjectData } from '@shared/types';
import { errorMessage } from '@shared/errorMessage';

export type FrameworkUpdate = {
  installed: string | null;
  /** A newer release this build of Scamp can use, or null. */
  updateTo: string | null;
  updating: boolean;
  error: string | null;
  onUpdate: () => void;
};

// Electron prefixes a rejected handler's message with the channel name.
const stripIpcPrefix = (message: string): string =>
  message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/**
 * A Scamp-framework project's scampjs version, checked against npm while
 * Project Settings is open, and the install behind its Update button.
 */
export const useFrameworkUpdate = (
  project: ProjectData,
  active: boolean,
  onProjectChange: ((next: (prev: ProjectData) => ProjectData) => void) | undefined
): FrameworkUpdate | undefined => {
  const [updateTo, setUpdateTo] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isScamp = project.format === 'scamp';
  // App passes a new callback each render; keep it out of the check's deps.
  const onProjectChangeRef = useRef(onProjectChange);
  onProjectChangeRef.current = onProjectChange;

  useEffect(() => {
    if (!isScamp || !active) return;
    let cancelled = false;
    void window.scamp.checkFrameworkUpdate({ projectPath: project.path }).then((result) => {
      if (cancelled) return;
      setUpdateTo(result.updateTo);
      // Picks up an install made outside the app since the project opened.
      onProjectChangeRef.current?.((prev) => ({ ...prev, framework: result.installed }));
    });
    return () => {
      cancelled = true;
    };
  }, [isScamp, active, project.path]);

  if (!isScamp) return undefined;
  const handleUpdate = (): void => {
    if (updateTo === null || updating) return;
    setUpdating(true);
    setError(null);
    window.scamp
      .updateFramework({ projectPath: project.path, version: updateTo })
      .then((installed) => {
        setUpdateTo(null);
        onProjectChange?.((prev) => ({ ...prev, framework: installed }));
      })
      .catch((e: unknown) => setError(stripIpcPrefix(errorMessage(e))))
      .finally(() => setUpdating(false));
  };
  return {
    installed: project.framework?.installedVersion ?? null,
    updateTo,
    updating,
    error,
    onUpdate: handleUpdate,
  };
};

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildHtmlExport } from '@lib/htmlExport';
import {
  exportSummary,
  resetDelayFor,
  type HtmlExportStatus,
} from '@lib/htmlExportStatus';
import { useAppLogStore } from '@store/appLogSlice';
import { componentKindOf, type ProjectData } from '@shared/types';
import { viewSlugFor } from '@shared/templates';

/**
 * Exports the whole project as a folder of static HTML + CSS.
 *
 * Page and component sources are re-read from disk rather than taken from
 * the store: the export must reflect what's actually saved, and re-reading
 * is both simpler and more truthful than rebuilding source from the live
 * element model.
 *
 * The status is surfaced to the caller rather than only logged. Revealing
 * the folder is not reliable feedback on its own — on Linux `shell.openPath`
 * can no-op with no error — so a success that the user can't see is
 * indistinguishable from a failure they can't see either.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
export type HtmlExportState = {
  exportHtml: () => Promise<void>;
  status: HtmlExportStatus;
  /** Success summary or failure reason, for the button label and tooltip. */
  message: string | null;
  /** Where the export landed — Scamp names the folder, so this is news. */
  location: string | null;
};

export const useHtmlExport = (
  projectPath: string,
  projectName: string
): HtmlExportState => {
  const [status, setStatus] = useState<HtmlExportStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const log = useAppLogStore((s) => s.log);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = (): void => {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  // A pending reset would fire into an unmounted component otherwise.
  useEffect(() => clearResetTimer, []);

  const settle = useCallback(
    (next: HtmlExportStatus, text: string | null): void => {
      setStatus(next);
      setMessage(text);
      clearResetTimer();
      const delay = resetDelayFor(next);
      if (delay === null) return;
      resetTimer.current = setTimeout(() => {
        setStatus('idle');
        setMessage(null);
        setLocation(null);
        resetTimer.current = null;
      }, delay);
    },
    []
  );

  const exportHtml = useCallback(async (): Promise<void> => {
    if (projectPath.length === 0) return;
    const chosen = await window.scamp.chooseHtmlExportFolder();
    if (chosen.canceled || chosen.path === null) return;

    clearResetTimer();
    setStatus('exporting');
    setMessage(null);
    setLocation(null);
    try {
      const [project, themeCss] = await Promise.all([
        window.scamp.readProject({ folderPath: projectPath }),
        window.scamp.readTheme({ projectPath }),
      ]);

      // A framework project has no pages: its pages are the views, and
      // the slug is what internal hrefs and the output filenames use.
      // Reading `project.pages` there exported nothing at all.
      // see docs/plans/framework-release-readiness.md
      const isView = (c: ProjectData['components'][number]): boolean =>
        componentKindOf(c) === 'view';
      const scamp = project.format === 'scamp';
      const { files, skipped } = buildHtmlExport({
        projectName,
        pages: scamp
          ? project.components
              .filter(isView)
              .map((c) => ({ ...c, name: viewSlugFor(c.name) }))
          : project.pages,
        components: scamp ? project.components.filter((c) => !isView(c)) : project.components,
        themeCss,
      });

      const result = await window.scamp.exportHtml({
        parentDir: chosen.path,
        projectPath,
        projectName,
        files,
      });

      if (!result.ok) {
        log('error', result.error);
        settle('error', result.error);
        return;
      }
      for (const skip of skipped) {
        log('warn', `Skipped page "${skip.pageName}": ${skip.reason}`);
      }
      const summary = exportSummary(result.fileCount, result.assetCount);
      log('info', `${summary} to ${result.targetDir}`);
      setLocation(result.targetDir);
      settle('done', summary);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Failed to export.';
      log('error', reason);
      settle('error', reason);
    }
  }, [projectPath, projectName, log, settle]);

  return { exportHtml, status, message, location };
};

import { promises as fs } from 'fs';
import { join } from 'path';
import type { ProjectFormat } from '@shared/types';
import { atomicWrite } from './fileOps';

/**
 * Path on disk where a project's `theme.css` lives. Nextjs projects
 * co-locate it inside `app/` so the root layout can import it and
 * `next dev` picks up the tokens; legacy keeps it at the project root.
 *
 * Pure w.r.t. `format` — the handler reads it from the project format
 * cache (mirrors the imageOps pattern).
 */
export const themePathFor = (
  projectPath: string,
  format: ProjectFormat
): string =>
  format === 'nextjs'
    ? join(projectPath, 'app', 'theme.css')
    : format === 'scamp'
      ? join(projectPath, 'design', 'theme.css')
      : join(projectPath, 'theme.css');

/**
 * Read the project's theme.css. Returns the file content as a string,
 * or an empty string if the file doesn't exist.
 */
export const readThemeFile = async (
  projectPath: string,
  format: ProjectFormat
): Promise<string> => {
  try {
    return await fs.readFile(themePathFor(projectPath, format), 'utf-8');
  } catch {
    return '';
  }
};

/** Write the project's theme.css, replacing its entire content. */
export const writeThemeFile = async (
  projectPath: string,
  format: ProjectFormat,
  content: string
): Promise<void> => {
  await atomicWrite(themePathFor(projectPath, format), content);
};

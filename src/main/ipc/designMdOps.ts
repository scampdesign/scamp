import { promises as fs } from 'fs';
import { join } from 'path';
import type { ProjectFormat } from '@shared/types';
import { atomicWrite } from './fileOps';

/**
 * DESIGN.md lives in the project ROOT (next to agent.md / CLAUDE.md),
 * regardless of project format — it documents the whole project's design
 * system. The renderer generates the content (it holds the tokens); the
 * main process just does the file I/O. see docs/plans/design-system-plan.md
 */
export const designMdPathFor = (
  projectPath: string,
  format: ProjectFormat = 'nextjs'
): string =>
  format === 'scamp'
    ? join(projectPath, 'design', 'DESIGN.md')
    : join(projectPath, 'DESIGN.md');

/** Read DESIGN.md, or '' if it doesn't exist yet. */
export const readDesignMdFile = async (
  projectPath: string,
  format: ProjectFormat = 'nextjs'
): Promise<string> => {
  try {
    return await fs.readFile(designMdPathFor(projectPath, format), 'utf-8');
  } catch {
    return '';
  }
};

/** Write DESIGN.md, replacing its entire content. */
export const writeDesignMdFile = async (
  projectPath: string,
  content: string,
  format: ProjectFormat = 'nextjs'
): Promise<void> => {
  await atomicWrite(designMdPathFor(projectPath, format), content);
};

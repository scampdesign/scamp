import type { EmbeddedRecentProject } from '@shared/types';

/**
 * Recently opened React projects, for the Edit React Project window's first
 * screen. Only main writes the list, so a folder on it counts as one the
 * user chose. Pure; main reads and writes the file.
 * see docs/plans/embedded-scamp-plan.md
 */

export const MAX_RECENT = 10;

/** The stored list; anything malformed is dropped, entry by entry. */
export const parseRecent = (text: string): EmbeddedRecentProject[] => {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  const list = (body as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(list)) return [];
  return list.flatMap((p: unknown): EmbeddedRecentProject[] => {
    const e = p as Partial<EmbeddedRecentProject> | null;
    return e !== null && typeof e.folder === 'string' && e.folder.length > 0 && typeof e.name === 'string' && typeof e.lastOpened === 'string'
      ? [{ folder: e.folder, name: e.name, lastOpened: e.lastOpened }]
      : [];
  });
};

/** Put `entry` first, without a second copy of its folder, keeping the newest `MAX_RECENT`. */
export const upsertRecent = (list: ReadonlyArray<EmbeddedRecentProject>, entry: EmbeddedRecentProject): EmbeddedRecentProject[] =>
  [entry, ...list.filter((p) => p.folder !== entry.folder)].slice(0, MAX_RECENT);

export const removeRecent = (list: ReadonlyArray<EmbeddedRecentProject>, folder: string): EmbeddedRecentProject[] =>
  list.filter((p) => p.folder !== folder);

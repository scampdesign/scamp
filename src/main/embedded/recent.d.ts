import type { EmbeddedRecentProject } from '@shared/types';
/**
 * Recently opened React projects, for the Edit React Project window's first
 * screen. Only main writes the list, so a folder on it counts as one the
 * user chose. Pure; main reads and writes the file.
 * see docs/plans/embedded-scamp-plan.md
 */
export declare const MAX_RECENT = 10;
/** The stored list; anything malformed is dropped, entry by entry. */
export declare const parseRecent: (text: string) => EmbeddedRecentProject[];
/** Put `entry` first, without a second copy of its folder, keeping the newest `MAX_RECENT`. */
export declare const upsertRecent: (list: ReadonlyArray<EmbeddedRecentProject>, entry: EmbeddedRecentProject) => EmbeddedRecentProject[];
export declare const removeRecent: (list: ReadonlyArray<EmbeddedRecentProject>, folder: string) => EmbeddedRecentProject[];

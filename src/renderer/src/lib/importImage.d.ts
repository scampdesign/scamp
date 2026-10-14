import type { CopyImageResult } from '@shared/types';
/**
 * Import an image into the project, flagging the canvas as busy while it
 * converts.
 *
 * Every import path goes through here — the image tool, drag-and-drop,
 * Replace image, Set background image — so the indicator can't be wired
 * up in three places and forgotten in the fourth. The same argument
 * applies to failure: all four call sites used to `await` this inside a
 * `void`-ed async function with no catch, so anything that threw past
 * the file picker (a conversion failure, a rejected path, a full disk)
 * was an unhandled rejection and the user saw the picker close and
 * nothing else happen. Failures are logged and reported as `null`.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
export declare const importImage: (sourcePath: string, projectPath: string) => Promise<CopyImageResult | null>;

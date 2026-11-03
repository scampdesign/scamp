import type { EmbeddedRawSource } from '@shared/types';
/**
 * Turn React's debug location for an element (Next.js: a frame in a dev
 * server chunk, or a server file) into `src/File.tsx:line:col`, through the
 * chunk's source map, then a pass over the file for the exact JSX line.
 * Reads only the app's own origin and files inside the project.
 * see docs/plans/embedded-scamp-plan.md
 */
export type ResolveHints = {
    tag: string;
    classes: string[];
    text: string;
};
/** `src/app/page.tsx:12:5` for a raw location, or null when it can't be found in the project. */
export declare const resolveSource: (folder: string, origin: string, raw: EmbeddedRawSource, hints: ResolveHints) => Promise<string | null>;

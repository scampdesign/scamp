import type { ScampElement } from './element';
/**
 * Turn a raw selection into the list of subtree roots a copy or cut
 * should act on.
 *
 * Three things happen here, and each exists because the naive version is
 * wrong in a way the user would notice:
 *
 *   - **The page root expands to its children.** The root is the page
 *     frame — there's only ever one, so copying it is meaningless. Taking
 *     its children instead makes "select the page, copy" mean "copy
 *     everything on this page".
 *   - **Descendants of another selected element are dropped.** Selecting
 *     a container *and* something inside it and copying would otherwise
 *     capture the inner element twice, and paste it twice.
 *   - **The result is in document order**, so pasting several elements
 *     preserves their on-page order rather than the order they happened
 *     to be clicked in.
 *
 * Pure and cycle-guarded. Returns an empty array when nothing is
 * copyable — callers should treat that as "leave the clipboard alone"
 * rather than "clear it".
 *
 * see docs/archive/2026-08-12-copy-cut-paste-plan.md
 */
export declare const normalizeCopySelection: (elements: Record<string, ScampElement>, ids: readonly string[], rootId: string) => string[];

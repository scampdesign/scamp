import type { PageLayoutEntry } from '@shared/types';
/**
 * The Pages list's groups and order, as stored in `scamp.config.json`.
 * Pure: every function returns a new layout. The files decide which pages
 * exist; the layout only decides where they show.
 * see docs/plans/page-groups-plan.md
 */
/** A row the user can drag, or drop onto. */
export type RowRef = {
    kind: 'page';
    slug: string;
} | {
    kind: 'group';
    name: string;
};
export type DropPosition = 'before' | 'after' | 'inside';
/**
 * The layout to show for these pages. Entries for pages that no longer
 * exist are dropped; pages the layout doesn't name (new, or added outside
 * Scamp) go at the end of the top level, so nothing is ever hidden.
 */
export declare const reconcileLayout: (slugs: ReadonlyArray<string>, layout: ReadonlyArray<PageLayoutEntry> | undefined) => PageLayoutEntry[];
/** The group a page is in, or null at the top level. */
export declare const groupOf: (layout: ReadonlyArray<PageLayoutEntry>, slug: string) => string | null;
export declare const removePage: (layout: ReadonlyArray<PageLayoutEntry>, slug: string) => PageLayoutEntry[];
/** A rename keeps the page where it was. */
export declare const renamePage: (layout: ReadonlyArray<PageLayoutEntry>, from: string, to: string) => PageLayoutEntry[];
/**
 * Where a page can be moved from its context menu: every other group, and
 * the top level when it's in one. `group: null` is the top level.
 */
export declare const moveTargets: (layout: ReadonlyArray<PageLayoutEntry>, slug: string) => Array<{
    label: string;
    group: string | null;
}>;
/** Put a page at the end of a group, or of the top level when `group` is null. */
export declare const movePageToGroup: (layout: ReadonlyArray<PageLayoutEntry>, slug: string, group: string | null) => PageLayoutEntry[];
/** Insert `slug` right after `after`, in the same group; at the end if `after` isn't there. */
export declare const insertPageAfter: (layout: ReadonlyArray<PageLayoutEntry>, slug: string, after: string) => PageLayoutEntry[];
export declare const addGroup: (layout: ReadonlyArray<PageLayoutEntry>, name: string) => PageLayoutEntry[];
export declare const renameGroup: (layout: ReadonlyArray<PageLayoutEntry>, from: string, to: string) => PageLayoutEntry[];
/** Deleting a group keeps its pages: they move to the top level where it was. */
export declare const removeGroup: (layout: ReadonlyArray<PageLayoutEntry>, name: string) => PageLayoutEntry[];
/** Why `name` can't name a group, or null when it can. `current` is the group being renamed. */
export declare const groupNameError: (layout: ReadonlyArray<PageLayoutEntry>, name: string, current?: string | null) => string | null;
/** "Group", or "Group 2", "Group 3"… if that's taken. */
export declare const nextGroupName: (layout: ReadonlyArray<PageLayoutEntry>) => string;
/**
 * Drop `moving` next to, or into, `target`. A page dropped inside a group
 * goes at its end; next to a page, it joins that page's group. A group
 * only moves among the top-level rows — dropped on a grouped page, it goes
 * next to that page's group. Anything that doesn't resolve is a no-op.
 */
export declare const moveRow: (layout: ReadonlyArray<PageLayoutEntry>, moving: RowRef, target: RowRef, position: DropPosition) => PageLayoutEntry[];

import type { PageLayoutEntry } from '@shared/types';

/**
 * The Pages list's groups and order, as stored in `scamp.config.json`.
 * Pure: every function returns a new layout. The files decide which pages
 * exist; the layout only decides where they show.
 * see docs/plans/page-groups-plan.md
 */

/** A row the user can drag, or drop onto. */
export type RowRef = { kind: 'page'; slug: string } | { kind: 'group'; name: string };

export type DropPosition = 'before' | 'after' | 'inside';

/** Home first, then by slug — the list's order before anyone grouped. */
const defaultOrder = (slugs: ReadonlyArray<string>): string[] =>
  [...slugs].sort((a, b) => {
    if (a === 'home') return -1;
    if (b === 'home') return 1;
    return a.localeCompare(b);
  });

/**
 * The layout to show for these pages. Entries for pages that no longer
 * exist are dropped; pages the layout doesn't name (new, or added outside
 * Scamp) go at the end of the top level, so nothing is ever hidden.
 */
export const reconcileLayout = (
  slugs: ReadonlyArray<string>,
  layout: ReadonlyArray<PageLayoutEntry> | undefined
): PageLayoutEntry[] => {
  const present = new Set(slugs);
  const placed = new Set<string>();
  const place = (slug: string): boolean => {
    if (!present.has(slug) || placed.has(slug)) return false;
    placed.add(slug);
    return true;
  };
  const out: PageLayoutEntry[] = [];
  for (const entry of layout ?? []) {
    if ('page' in entry) {
      if (place(entry.page)) out.push({ page: entry.page });
    } else {
      out.push({ group: entry.group, pages: entry.pages.filter(place) });
    }
  }
  for (const slug of defaultOrder(slugs.filter((s) => !placed.has(s)))) out.push({ page: slug });
  return out;
};

/** The group a page is in, or null at the top level. */
export const groupOf = (layout: ReadonlyArray<PageLayoutEntry>, slug: string): string | null => {
  for (const entry of layout) {
    if ('group' in entry && entry.pages.includes(slug)) return entry.group;
  }
  return null;
};

export const removePage = (layout: ReadonlyArray<PageLayoutEntry>, slug: string): PageLayoutEntry[] =>
  layout.flatMap((entry): PageLayoutEntry[] => {
    if ('page' in entry) return entry.page === slug ? [] : [entry];
    return [{ group: entry.group, pages: entry.pages.filter((p) => p !== slug) }];
  });

/** A rename keeps the page where it was. */
export const renamePage = (layout: ReadonlyArray<PageLayoutEntry>, from: string, to: string): PageLayoutEntry[] =>
  layout.map((entry) =>
    'page' in entry
      ? { page: entry.page === from ? to : entry.page }
      : { group: entry.group, pages: entry.pages.map((p) => (p === from ? to : p)) }
  );

/**
 * Where a page can be moved from its context menu: every other group, and
 * the top level when it's in one. `group: null` is the top level.
 */
export const moveTargets = (
  layout: ReadonlyArray<PageLayoutEntry>,
  slug: string
): Array<{ label: string; group: string | null }> => {
  const current = groupOf(layout, slug);
  return [
    ...layout.flatMap((e) => ('group' in e && e.group !== current ? [{ label: `Move to ${e.group}`, group: e.group }] : [])),
    ...(current !== null ? [{ label: 'Move to top level', group: null }] : []),
  ];
};

/** Put a page at the end of a group, or of the top level when `group` is null. */
export const movePageToGroup = (
  layout: ReadonlyArray<PageLayoutEntry>,
  slug: string,
  group: string | null
): PageLayoutEntry[] => {
  const without = removePage(layout, slug);
  if (group === null || !without.some((e) => 'group' in e && e.group === group)) {
    return [...without, { page: slug }];
  }
  return without.map((entry) =>
    'group' in entry && entry.group === group ? { group: entry.group, pages: [...entry.pages, slug] } : entry
  );
};

/** Insert `slug` right after `after`, in the same group; at the end if `after` isn't there. */
export const insertPageAfter = (
  layout: ReadonlyArray<PageLayoutEntry>,
  slug: string,
  after: string
): PageLayoutEntry[] =>
  moveRow([...removePage(layout, slug), { page: slug }], { kind: 'page', slug }, { kind: 'page', slug: after }, 'after');

/**
 * Make a group of these pages, in list order, where the first of them was:
 * in its place at the top level, or right after the group it came from.
 * Slugs not in the layout are ignored; with none left, nothing changes.
 */
export const groupPages = (
  layout: ReadonlyArray<PageLayoutEntry>,
  slugs: ReadonlyArray<string>,
  name: string
): PageLayoutEntry[] => {
  const wanted = new Set(slugs);
  const ordered = layout.flatMap((e) => ('page' in e ? [e.page] : e.pages)).filter((s) => wanted.has(s));
  if (ordered.length === 0) return [...layout];
  const grouped: PageLayoutEntry = { group: name, pages: ordered };
  const out: PageLayoutEntry[] = [];
  let placed = false;
  for (const entry of layout) {
    if ('page' in entry) {
      if (!wanted.has(entry.page)) out.push(entry);
      else if (!placed) {
        out.push(grouped);
        placed = true;
      }
      continue;
    }
    const rest = entry.pages.filter((p) => !wanted.has(p));
    out.push({ group: entry.group, pages: rest });
    if (!placed && rest.length !== entry.pages.length) {
      out.push(grouped);
      placed = true;
    }
  }
  return out;
};

/**
 * The pages from `from` to `to`, inclusive, in `order` — either way round.
 * An end that isn't in `order` gives just `to`, or nothing if neither is.
 */
export const pagesBetween = (order: ReadonlyArray<string>, from: string, to: string): string[] => {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (b === -1) return [];
  if (a === -1) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
};

export const addGroup = (layout: ReadonlyArray<PageLayoutEntry>, name: string): PageLayoutEntry[] => [
  ...layout,
  { group: name, pages: [] },
];

export const renameGroup = (layout: ReadonlyArray<PageLayoutEntry>, from: string, to: string): PageLayoutEntry[] =>
  layout.map((entry) => ('group' in entry && entry.group === from ? { group: to, pages: entry.pages } : entry));

/** Deleting a group keeps its pages: they move to the top level where it was. */
export const removeGroup = (layout: ReadonlyArray<PageLayoutEntry>, name: string): PageLayoutEntry[] =>
  layout.flatMap((entry): PageLayoutEntry[] =>
    'group' in entry && entry.group === name ? entry.pages.map((page) => ({ page })) : [entry]
  );

/** Why `name` can't name a group, or null when it can. `current` is the group being renamed. */
export const groupNameError = (
  layout: ReadonlyArray<PageLayoutEntry>,
  name: string,
  current: string | null = null
): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name the group.';
  const taken = layout.some(
    (e) => 'group' in e && e.group !== current && e.group.toLowerCase() === trimmed.toLowerCase()
  );
  return taken ? 'A group with that name already exists.' : null;
};

/** "Group", or "Group 2", "Group 3"… if that's taken. */
export const nextGroupName = (layout: ReadonlyArray<PageLayoutEntry>): string => {
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? 'Group' : `Group ${n}`;
    if (groupNameError(layout, name) === null) return name;
  }
};

/**
 * Drop `moving` next to, or into, `target`. A page dropped inside a group
 * goes at its end; next to a page, it joins that page's group. A group
 * only moves among the top-level rows — dropped on a grouped page, it goes
 * next to that page's group. Anything that doesn't resolve is a no-op.
 */
export const moveRow = (
  layout: ReadonlyArray<PageLayoutEntry>,
  moving: RowRef,
  target: RowRef,
  position: DropPosition
): PageLayoutEntry[] => {
  if (moving.kind === 'page') {
    if (target.kind === 'page' && target.slug === moving.slug) return [...layout];
    if (!hasPage(layout, moving.slug)) return [...layout];
    if (target.kind === 'page' && !hasPage(layout, target.slug)) return [...layout];
    const without = removePage(layout, moving.slug);
    if (target.kind === 'group') {
      const at = without.findIndex((e) => 'group' in e && e.group === target.name);
      if (at === -1) return [...layout];
      if (position === 'inside') return movePageToGroup(layout, moving.slug, target.name);
      return splice(without, position === 'before' ? at : at + 1, { page: moving.slug });
    }
    const top = without.findIndex((e) => 'page' in e && e.page === target.slug);
    if (top !== -1) return splice(without, position === 'before' ? top : top + 1, { page: moving.slug });
    return without.map((entry) => {
      if (!('group' in entry)) return entry;
      const at = entry.pages.indexOf(target.slug);
      if (at === -1) return entry;
      const pages = [...entry.pages];
      pages.splice(position === 'before' ? at : at + 1, 0, moving.slug);
      return { group: entry.group, pages };
    });
  }

  const anchor = target.kind === 'group' ? target.name : groupOf(layout, target.slug);
  if (anchor === moving.name) return [...layout];
  const entry = layout.find((e) => 'group' in e && e.group === moving.name);
  if (entry === undefined) return [...layout];
  const without = layout.filter((e) => e !== entry);
  const at = without.findIndex((e) =>
    anchor !== null ? 'group' in e && e.group === anchor : target.kind === 'page' && 'page' in e && e.page === target.slug
  );
  if (at === -1) return [...layout];
  return splice(without, position === 'before' ? at : at + 1, entry);
};

const hasPage = (layout: ReadonlyArray<PageLayoutEntry>, slug: string): boolean =>
  layout.some((e) => ('page' in e ? e.page === slug : e.pages.includes(slug)));

const splice = (layout: ReadonlyArray<PageLayoutEntry>, at: number, entry: PageLayoutEntry): PageLayoutEntry[] => {
  const out = [...layout];
  out.splice(at, 0, entry);
  return out;
};

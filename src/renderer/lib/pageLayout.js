/** Home first, then by slug — the list's order before anyone grouped. */
const defaultOrder = (slugs) => [...slugs].sort((a, b) => {
    if (a === 'home')
        return -1;
    if (b === 'home')
        return 1;
    return a.localeCompare(b);
});
/**
 * The layout to show for these pages. Entries for pages that no longer
 * exist are dropped; pages the layout doesn't name (new, or added outside
 * Scamp) go at the end of the top level, so nothing is ever hidden.
 */
export const reconcileLayout = (slugs, layout) => {
    const present = new Set(slugs);
    const placed = new Set();
    const place = (slug) => {
        if (!present.has(slug) || placed.has(slug))
            return false;
        placed.add(slug);
        return true;
    };
    const out = [];
    for (const entry of layout ?? []) {
        if ('page' in entry) {
            if (place(entry.page))
                out.push({ page: entry.page });
        }
        else {
            out.push({ group: entry.group, pages: entry.pages.filter(place) });
        }
    }
    for (const slug of defaultOrder(slugs.filter((s) => !placed.has(s))))
        out.push({ page: slug });
    return out;
};
/** The group a page is in, or null at the top level. */
export const groupOf = (layout, slug) => {
    for (const entry of layout) {
        if ('group' in entry && entry.pages.includes(slug))
            return entry.group;
    }
    return null;
};
export const removePage = (layout, slug) => layout.flatMap((entry) => {
    if ('page' in entry)
        return entry.page === slug ? [] : [entry];
    return [{ group: entry.group, pages: entry.pages.filter((p) => p !== slug) }];
});
/** A rename keeps the page where it was. */
export const renamePage = (layout, from, to) => layout.map((entry) => 'page' in entry
    ? { page: entry.page === from ? to : entry.page }
    : { group: entry.group, pages: entry.pages.map((p) => (p === from ? to : p)) });
/**
 * Where a page can be moved from its context menu: every other group, and
 * the top level when it's in one. `group: null` is the top level.
 */
export const moveTargets = (layout, slug) => {
    const current = groupOf(layout, slug);
    return [
        ...layout.flatMap((e) => ('group' in e && e.group !== current ? [{ label: `Move to ${e.group}`, group: e.group }] : [])),
        ...(current !== null ? [{ label: 'Move to top level', group: null }] : []),
    ];
};
/** Put a page at the end of a group, or of the top level when `group` is null. */
export const movePageToGroup = (layout, slug, group) => {
    const without = removePage(layout, slug);
    if (group === null || !without.some((e) => 'group' in e && e.group === group)) {
        return [...without, { page: slug }];
    }
    return without.map((entry) => 'group' in entry && entry.group === group ? { group: entry.group, pages: [...entry.pages, slug] } : entry);
};
/** Insert `slug` right after `after`, in the same group; at the end if `after` isn't there. */
export const insertPageAfter = (layout, slug, after) => moveRow([...removePage(layout, slug), { page: slug }], { kind: 'page', slug }, { kind: 'page', slug: after }, 'after');
/**
 * Make a group of these pages, in list order, where the first of them was:
 * in its place at the top level, or right after the group it came from.
 * Slugs not in the layout are ignored; with none left, nothing changes.
 */
export const groupPages = (layout, slugs, name) => {
    const wanted = new Set(slugs);
    const ordered = layout.flatMap((e) => ('page' in e ? [e.page] : e.pages)).filter((s) => wanted.has(s));
    if (ordered.length === 0)
        return [...layout];
    const grouped = { group: name, pages: ordered };
    const out = [];
    let placed = false;
    for (const entry of layout) {
        if ('page' in entry) {
            if (!wanted.has(entry.page))
                out.push(entry);
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
export const addGroup = (layout, name) => [
    ...layout,
    { group: name, pages: [] },
];
export const renameGroup = (layout, from, to) => layout.map((entry) => ('group' in entry && entry.group === from ? { group: to, pages: entry.pages } : entry));
/** Deleting a group keeps its pages: they move to the top level where it was. */
export const removeGroup = (layout, name) => layout.flatMap((entry) => 'group' in entry && entry.group === name ? entry.pages.map((page) => ({ page })) : [entry]);
/** Why `name` can't name a group, or null when it can. `current` is the group being renamed. */
export const groupNameError = (layout, name, current = null) => {
    const trimmed = name.trim();
    if (trimmed.length === 0)
        return 'Name the group.';
    const taken = layout.some((e) => 'group' in e && e.group !== current && e.group.toLowerCase() === trimmed.toLowerCase());
    return taken ? 'A group with that name already exists.' : null;
};
/** "Group", or "Group 2", "Group 3"… if that's taken. */
export const nextGroupName = (layout) => {
    for (let n = 1;; n += 1) {
        const name = n === 1 ? 'Group' : `Group ${n}`;
        if (groupNameError(layout, name) === null)
            return name;
    }
};
/**
 * Drop `moving` next to, or into, `target`. A page dropped inside a group
 * goes at its end; next to a page, it joins that page's group. A group
 * only moves among the top-level rows — dropped on a grouped page, it goes
 * next to that page's group. Anything that doesn't resolve is a no-op.
 */
export const moveRow = (layout, moving, target, position) => {
    if (moving.kind === 'page') {
        if (target.kind === 'page' && target.slug === moving.slug)
            return [...layout];
        if (!hasPage(layout, moving.slug))
            return [...layout];
        if (target.kind === 'page' && !hasPage(layout, target.slug))
            return [...layout];
        const without = removePage(layout, moving.slug);
        if (target.kind === 'group') {
            const at = without.findIndex((e) => 'group' in e && e.group === target.name);
            if (at === -1)
                return [...layout];
            if (position === 'inside')
                return movePageToGroup(layout, moving.slug, target.name);
            return splice(without, position === 'before' ? at : at + 1, { page: moving.slug });
        }
        const top = without.findIndex((e) => 'page' in e && e.page === target.slug);
        if (top !== -1)
            return splice(without, position === 'before' ? top : top + 1, { page: moving.slug });
        return without.map((entry) => {
            if (!('group' in entry))
                return entry;
            const at = entry.pages.indexOf(target.slug);
            if (at === -1)
                return entry;
            const pages = [...entry.pages];
            pages.splice(position === 'before' ? at : at + 1, 0, moving.slug);
            return { group: entry.group, pages };
        });
    }
    const anchor = target.kind === 'group' ? target.name : groupOf(layout, target.slug);
    if (anchor === moving.name)
        return [...layout];
    const entry = layout.find((e) => 'group' in e && e.group === moving.name);
    if (entry === undefined)
        return [...layout];
    const without = layout.filter((e) => e !== entry);
    const at = without.findIndex((e) => anchor !== null ? 'group' in e && e.group === anchor : target.kind === 'page' && 'page' in e && e.page === target.slug);
    if (at === -1)
        return [...layout];
    return splice(without, position === 'before' ? at : at + 1, entry);
};
const hasPage = (layout, slug) => layout.some((e) => ('page' in e ? e.page === slug : e.pages.includes(slug)));
const splice = (layout, at, entry) => {
    const out = [...layout];
    out.splice(at, 0, entry);
    return out;
};

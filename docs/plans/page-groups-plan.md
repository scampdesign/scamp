# Page groups

Status: built, 2026-10-12. Answers to the questions are inline at the end.

> As a designer working on a bigger project, I want to group pages in the
> page list so I can organize many pages into sections instead of one long
> flat list.

Groups are an organizational layer in the **Pages** list only. A page's
files, route, URL, and generated code don't change when it's grouped,
moved, or reordered.

## Decision: metadata, not folders

Grouping is stored in `scamp.config.json`. The files on disk don't move.

Folders would make a group "real", but every project format ties a page's
location to something that must not change:

| Format | Where a page lives | What a folder move breaks |
|---|---|---|
| Next.js | `app/<name>/page.tsx` | The folder **is** the URL. Next's route groups (`app/(marketing)/about/`) keep the URL, but every path helper (`pagePathsFor`, rename, duplicate, delete, migration, HTML export, the agent's view lookup) assumes `app/<name>/`. |
| Scamp | `views/<Name>/` plus `routes/<slug>.tsx` | Route files import `@/views/<Name>/<Name>`, and components import views the same way. A move rewrites imports in files Scamp didn't write. |
| Legacy | `<name>.tsx` at the root | No routing, but the same path helpers. |

So the folder option means teaching about a dozen path helpers about
groups, and rewriting imports on every drag. That's risky for something
the story calls "purely to help designers keep larger projects tidy". The
metadata option touches no page file, so routing and the round-trip
can't break by construction.

**What you give up:** a teammate who opens the project in an editor sees
the flat file tree, not the groups. The groups still travel with the
project, because `scamp.config.json` is committed.

## What gets stored

One new optional field in `scamp.config.json`. The list's top level, in
order:

```json
{
  "pageLayout": [
    { "page": "home" },
    { "group": "Marketing", "pages": ["about", "pricing", "contact"] },
    { "page": "blog" },
    { "group": "Account", "pages": ["login", "settings"] }
  ]
}
```

- **Pages are named by their slug,** the name the list already shows. Slugs
  are unique across pages and views (`PageSidebar.rowsFor` relies on that),
  and a slug is what the user renames.
- **A group is named by its display name.** Names are unique within a
  project, so the name is the key, and a renamed group is just an edit.
  There's no separate id to keep in sync.
- **`pageLayout` is absent until the user first groups or reorders.** Projects
  that never use the feature don't get a new field, and the list stays as
  it is today: Home first, then alphabetical.

### Collapse state is not in the config

Whether a group is collapsed is one person's view of the list, not
project data. In the committed config, every collapse would show up as a
git diff for teammates. It goes in `localStorage`, keyed by project path
and group name, like the start screen's card/list choice. If it's lost,
the groups show expanded.

## Keeping the layout honest

The layout names pages, but pages come and go outside it. An agent, a
teammate's pull, or a hand edit can add, delete, or rename one. The rule
is that **the files decide which pages exist; the layout only decides
where they show.** One pure function reconciles the two each time the
list renders:

- **A page that isn't in the layout** shows at the top level, after the
  pages that are, in alphabetical order. New pages appear at the bottom,
  and nothing is ever hidden.
- **A layout entry with no page** is skipped and dropped on the next
  save. Deleting a page in Scamp also removes it from the layout straight
  away.
- **Home** keeps its place at the top until the user drags it.
- **An empty group** stays (the user made it), and shows an empty
  drop-zone row.

Scamp's own page operations keep the layout in step:

| Operation | Layout change |
|---|---|
| Add page | Appended to the top level. With the group menu's **Add page here**, appended to that group. |
| Rename page or view | Its slug is replaced in place, so it keeps its position. |
| Duplicate | The copy is inserted right after the original, in the same group. |
| Delete | Removed. |
| Delete group | Its pages move to the top level where the group was. No page is deleted. |

A rename done outside Scamp looks like a delete plus an add, so that page
ends up at the bottom of the top level. That's acceptable: nothing is
lost, and the user drags it back.

## Behaviour

- **Create a group:** a **New group** button under the list, next to
  **+ Add Page**, adds a group with an inline name field. It can also be
  created from a page's context menu with **Move to group → New group…**.
- **Rename and delete a group:** from the group header's context menu,
  using the same inline name field as page rename.
- **Drag and drop:** pages can be dragged into, out of, and between groups,
  and reordered at either level. Group headers can be dragged to reorder
  groups. Groups don't nest; a dragged group drops only between top-level
  rows. This uses the same HTML5 drag pattern as the layers panel
  (`ElementTree.tsx`: a MIME type, then before, after, or inside from the
  pointer's position over the row).
- **Keyboard alternative:** the page context menu gets **Move to group ▸**,
  listing the groups plus **Top level**. Drag-only reordering would leave
  out keyboard users.
- **Collapse and expand:** with a chevron on the group header, as in the
  layers panel. A collapsed group that holds the open page shows an
  indicator on its header, the way the layers panel marks a hidden
  selection.
- **Opening a page** is the same click it is today, wherever the page sits.

## Where the code goes

| Piece | File |
|---|---|
| The pure model: parse, reconcile pages against the layout, move, rename, remove, and group create/rename/delete | `src/renderer/lib/pageLayout.ts` (new; fully unit-tested per CLAUDE.md) |
| `pageLayout` in the type and parser (the parser keeps only fields it knows, so an unparsed field is dropped on the next write) | `src/shared/types.ts` (`ProjectConfig`), `src/shared/projectConfig.ts` |
| Rows, group headers, drag and drop, collapse | `src/renderer/src/components/projectShell/PageSidebar.tsx`, splitting out `PageGroupHeader.tsx` |
| Saving: through the existing config hook, so a layout write and a settings write can't overwrite each other | `useProjectConfig.ts` |
| Layout updates on rename, duplicate, and delete | `usePageManagement.ts`, `useComponentManagement.ts` (views) |
| Page and group menu entries | `PageContextMenu.tsx`, plus a small group menu |
| User doc | `docs/user_docs/pages.md` (or the closest existing page) |

No IPC, main-process, generateCode, parseCode, or routing change.

## Tests

- **Unit (`test/pageLayout.test.ts`):**
  - Reconcile with no layout gives today's order.
  - Unknown pages append alphabetically, and missing pages are dropped.
  - Every kind of move: into a group, out of one, between groups, reorder
    within a group, and reorder groups.
  - Rename keeps the position.
  - Deleting a group lifts its pages in place.
  - Malformed `pageLayout` in the config is ignored, not thrown.
- **Config:** `pageLayout` round-trips through `parseProjectConfig` /
  `serializeProjectConfig`, and a config without it is unchanged
  byte-for-byte.
- **E2E (`test/e2e/project-view/page-groups.spec.ts`):**
  - Create a group, drag two pages in, collapse it, reload the project,
    and the layout and collapse state are back.
  - Rename a grouped page and it stays in its group.
  - Open a grouped page, and its files and route on disk are untouched by
    grouping (file bytes compared before and after).

## Phases

1. **Model and storage:** `pageLayout.ts` with tests, plus the config field.
   No UI.
2. **The list renders groups:** headers, collapse, and **Move to group**
   from the context menu. That's usable without drag and drop.
3. **Drag and drop:** pages and group headers.
4. **Keeping in step:** rename, duplicate, and delete hooks, **Add page
   here**, the user doc, and a changelog entry.

Each phase ships on its own. Phase 2 already delivers the story apart from
reordering by drag.

## Out of scope

- Nested groups.
- Grouping components in the **Components** list. The model would carry
  over if wanted later.
- Showing groups anywhere but the **Pages** list: the preview window's page
  menu, HTML export, and the MCP and agent tools all stay flat.

## Questions for you

1. **Should Home be pinned?** I'd let it move like any page, and default to
   the top only until the user drags it. The alternative is that it's
   always first and can't be grouped. no dont pin
2. **Should collapse state be per person (`localStorage`)?** I'd say yes.
   The alternative is the committed config, which shares it with the team
   at the cost of git noise. yes per person
3. **Should the preview window's page menu show the groups?** I'd say not
   now. It's another list to keep in step. not now

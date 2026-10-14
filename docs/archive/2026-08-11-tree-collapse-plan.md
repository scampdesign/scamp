# Collapse elements in the layers tree — Plan

Backlog: `docs/backlog-9.md` story 1 (read `:7-50`).
Status: **proposed** — for review.

## Context

Deeply nested layouts make the layers tree long and noisy. Collapsing a
branch hides its descendants so the user can work on one part of the tree.
Purely a display convenience — no canvas, file, or parse impact.

---

## What already exists

- **The tree is already a flat render of a recursive walk.**
  `ElementTree.tsx:314` has a `visit(id, depth)` that pushes one row per
  element depth-first, then renders `rows.map(...)`. Collapse is "don't
  recurse into a collapsed element" — the render loop doesn't change at all.
- **Cycle safety is already handled.** `visit` carries a `seen` set so a
  duplicate `data-scamp-id` can't recurse forever. Keep it.
- **`ratioLocks: Record<string, number>`** in the UI slice is the precedent
  for per-element UI state keyed by id (`slices/ui.ts`).
- **Chevron icons are already in use** — `IconChevronDown` / `IconChevronRight`
  from Tabler, in `sections/Section.tsx` and `controls/GridTrackList.tsx`.
- **`inlineFragments` produce extra "raw" rows** under an element
  (`ElementTree.tsx:320`). Those are children for collapse purposes and must
  hide too.
- **Layers e2e helpers exist** — `layersRows`, `layersRowByClass` in
  `test/e2e/fixtures/layers.ts`, keyed off `data-element-class`.

---

## Decision 1: state goes in the Zustand UI slice, not component state

The story allows either. The code decides it: the sidebar renders

```tsx
{showThemePanel ? <ThemeSectionNav /> : <>… <ElementTree /> …</>}
```

(`ProjectShell.tsx:358`), so **opening the Design System panel unmounts the
tree**. With `useState`, every collapse would be forgotten on a trip to the
theme panel — which fails the story's "collapsing an element and clicking
away keeps it collapsed".

Shape: `collapsedIds: Record<string, true>` in the UI slice, mirroring
`ratioLocks`. Session-only, never written to disk, never on the element model.

## Decision 2: clear the state when the open target changes

Element ids are short (4 hex) and **scoped to their own page** — two pages can
legitimately contain the same id. Carrying `collapsedIds` across a page or
component switch would collapse an unrelated element on the new page, which
reads as a glitch with no obvious cause.

Clear `collapsedIds` wherever the canvas swaps target (`loadPage` /
`loadComponent`). Cheap, and it removes a whole class of confusing behaviour.

## Decision 3: auto-expand fires on selection CHANGE, not continuously

The story asks that selecting an element expands its collapsed ancestors.
The obvious implementation — "ancestors of the selection are always
expanded" — makes it **impossible to collapse an ancestor of the selected
element**: it would spring back open immediately.

So: run it as an effect keyed on the selected id, expanding ancestors *at the
moment selection changes*. Collapsing afterwards then sticks, and the
selected-descendant indicator (below) is what tells the user something is
hidden in there. This is the difference between the feature helping and the
feature fighting the user.

## Decision 4: the triangle is a sibling of the row button, not a child

Each row is currently a `<button>` inside a wrapper `<div>` that owns the
drag/drop handlers and `data-testid="layers-row"`
(`ElementTree.tsx:184-262`). A `<button>` inside a `<button>` is invalid HTML
and breaks keyboard semantics.

Put the triangle as its own `<button>` in that existing wrapper, absolutely
positioned at the row's indent (`left: depth * 12`), with the row button
keeping its `paddingLeft` so the label doesn't shift. Leaves drag/drop and
selection untouched.

---

## Phases

### Phase 1 — the pure part
`src/renderer/lib/treeRows.ts`: move the depth-first walk out of the
component as `flattenTree(elements, rootId, collapsed)` returning the existing
`TreeRow[]`, plus:

- `descendantIds(elements, id)` — for the recursive collapse/expand
- `ancestorIds(elements, id)` — for auto-expand
- `hasCollapsedAncestor(elements, id, collapsed)` — drives the indicator

Fully tested, as `renderer/lib` requires. This is where the real logic lives;
everything after is wiring.

### Phase 2 — UI slice state
`collapsedIds: Record<string, true>` plus `toggleCollapsed(id)`,
`setCollapsed(ids, collapsed)` (bulk, for the recursive case), and
`clearCollapsed()`. Call `clearCollapsed()` on target switch (Decision 2).

### Phase 3 — the triangle
Render for any element with `childIds.length > 0` **or** `inlineFragments`
— both produce child rows. `IconChevronDown` when expanded,
`IconChevronRight` when collapsed, matching the existing usage.

`Cmd/Alt+click` toggles the whole subtree via `descendantIds`.
`stopPropagation` so it doesn't also select the row.

### Phase 4 — selection behaviour
Auto-expand ancestors on selection change (Decision 3). Add the
selected-descendant indicator on a collapsed row — a small dot, using the
accent token, shown when `hasCollapsedAncestor` puts a selected element
underneath it.

### Phase 5 — e2e
Add a `collapseToggle(page, className)` helper to `fixtures/layers.ts`
targeting a `data-action="toggle-collapse"` attribute, so specs don't depend
on icon markup.

---

## Files to touch

**New:** `src/renderer/lib/treeRows.ts`, `test/treeRows.test.ts`,
`test/e2e/layers-panel/collapse.spec.ts`.

**Modified:** `ElementTree.tsx` (use `flattenTree`, add the triangle + effect),
`ElementTree.module.css`, `store/canvas/slices/ui.ts`, `store/canvasSlice.ts`
(types), the page/component load path for `clearCollapsed`,
`test/e2e/fixtures/layers.ts`.

**Shim regen:** renderer only (`tsconfig.web.json`), dev server stopped.

---

## Tests

**`test/treeRows.test.ts`** — the pure layer:
- a collapsed element's descendants are absent; siblings unaffected
- nested collapse: collapsing an outer node hides an inner collapsed one too,
  and expanding the outer restores the inner's *own* collapsed state
- "raw" `inlineFragments` rows hide with their parent
- `descendantIds` on a leaf is empty; on a cycle it terminates
- `ancestorIds` for the root is empty
- depths are unchanged by collapsing (indentation must not shift)

**`test/e2e/layers-panel/collapse.spec.ts`** — the wiring:
- clicking the triangle hides descendant rows; clicking again restores them
- collapse survives switching to the Design System panel and back
  (the Decision 1 regression)
- selecting a hidden element on the canvas expands its ancestors
- collapsing an ancestor of the selected element **stays collapsed**
  (the Decision 3 regression) and shows the indicator
- `Alt+click` collapses the whole subtree

Only these two files get run — per the standing rule, no directory sweeps.

---

## Open questions

1. **`Cmd+click` or `Alt+click` for recursive?** The story says "(or
   `Alt+click`)". `Cmd/Ctrl+click` collides with nothing in the tree today,
   but `Alt+click` is the Figma convention for expand-all and doesn't risk
   colliding with a future multi-select. I lean **`Alt+click`**, and would
   accept both if you'd rather not choose. lets go with ALT+CLick sinc eit will be familiar to figma users
2. **Should the root be collapsible?** Collapsing it hides the entire tree,
   which is a strange state to be in and easy to hit by accident. I'd render
   no triangle on the root. sounds good
3. **Collapse state on external edits.** An agent rewriting the page reloads
   the element map. Ids usually survive, so collapse state mostly survives
   with it — but an element that disappears leaves a dead entry. Harmless
   (it's keyed by id and simply never matches), so I'd leave it rather than
   add reconciliation. Flagging in case you'd rather prune. lets go with your rec here
4. **Does anything else need clearing besides page/component switch?** Undo
   and snapshot restore both replace `elements` wholesale. Collapse state
   surviving those seems right to me — the user's tree view shouldn't reset
   because they hit undo — but worth confirming. confirmed

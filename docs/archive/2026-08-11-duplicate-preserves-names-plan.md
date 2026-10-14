# Duplicate preserves element names — Plan

Backlog: `docs/backlog-9.md` story 2 (read `:52-117`).
Status: **implemented**.

Shipped as planned. Two notes on what the work turned up:

- The stale doc comments in question 3 went further than the one in
  `internal.ts` — `types.ts` and `parseCode/tsx.ts` both claimed the name
  round-trips through a `data-scamp-name` attribute that **is never
  emitted**. The real mechanism is the class prefix. All three corrected.
- The tests were verified by reverting the fix: the 3 name-dependent e2e
  tests and 6 unit tests fail against the old behaviour, and the
  "unnamed element" guard correctly passes either way.

## Context

A renamed element gets the class `menu_a1b2`. Today, duplicating it
produces `rect_c3d4` — the name is dropped and the duplicate reverts to a
default type prefix. The story wants the name kept and only the 4-char id
suffix regenerated.

---

## The headline: this is one deliberate line

`src/renderer/lib/element/tree.ts:538`, at the bottom of
`cloneElementSubtree`:

```ts
// Clear the name on clones so the duplicate gets a fresh default
// class name. The user can rename it from the layers panel.
name: undefined,
```

Everything above it spreads `...old`, so **every other field already
survives the clone**. The name is being explicitly thrown away, on
purpose, and the story is a decision to reverse that call. Deleting those
three lines is the whole behaviour change.

## Why nothing else needs to move

I checked each place that could have made this harder. All four are
already correct:

- **All three duplication paths funnel through the same clone.**
  `duplicateElement` (`elementsCreate.ts:593`) and `pasteElement`
  (`:705`) are the *only* two callers of `cloneElementSubtree` in the
  codebase. `copyElement` (`:664`) already copies `name` verbatim into the
  clipboard — the strip happens later, at paste. So one line fixes Cmd+D
  and copy/paste together; there is no third code path to keep in sync.
- **The class name already derives from `name`.** `classNameFor`
  (`generateCode/internal.ts:11`) does `el.name ? slugifyName(el.name) :
  ''` and falls back to the type prefix. Keep the name and the duplicate
  emits `.menu_c3d4` with no further change.
- **The parser already recovers the name from the prefix**
  (`parseCode/tsx.ts:506-517`): it takes everything before the last `_`
  and treats it as the name unless it's one of `rect` / `text` / `img` /
  `input`. So the duplicate's name survives save → reload.
- **`name` is stored already-slugified.** The layers rename writes
  `slugifyName(draft)` (`ElementTree.tsx:308`) and displays it back
  through `titleCaseFromSlug`. So "Menu" is `menu` on the model and
  "Menu" in the tree — the store value and the class prefix are the same
  string, and the round trip is exact rather than lossy.

## The one collision risk, and why it isn't one

Two elements sharing a `menu` prefix could plausibly cross-match in the
parser's rename-resilience path (`parseCode/index.ts:232`), which finds a
CSS block for a TSX class that has no exact match. It keys off the
**4-char hex id suffix**, not the prefix (`indexCssClassesByIdSuffix`), and
those stay unique. Two `menu_*` classes can't be confused for each other.

## What is actually missing: right-click Duplicate

The story names three paths. Cmd+D exists
(`useCanvasKeyboardShortcuts.ts:268`) and copy/paste exists
(`:151`, `:164`), but **`ElementContextMenu` has no Duplicate item** —
its items are Make slot, Remove slot, Create component…, Detach from
component…, Delete contents, Copy context for agent, Export…. This is the
only new UI in the story.

---

## Decisions

### 1. Preserve the name verbatim — no "copy" suffix

The story is explicit: same display name, same class prefix, new id. So
no `menu-copy`, no `Menu 2`. The consequence is real and worth naming:
**the layers tree will show two identical "Menu" rows.** That's the
requested behaviour — the id suffix in the class is what distinguishes
them — but it is a genuine change in how a duplicated tree reads.

### 2. Component instances keep their name too

`classNameFor` returns `inst_xxxx` for `component-instance`, so name has
no effect on their class. But the tree label uses it, so preserving it is
still the consistent choice, and the existing fresh-`instanceId` logic in
the clone is untouched.

### 3. Duplicate goes at the top of the context menu

Above Make slot, separated from the component actions. Hidden for the
page root (the store action already rejects root, but an item that
silently does nothing is worse than no item).

---

## Phases

### Phase 1 — the change and its tests
Remove the `name: undefined` override in `cloneElementSubtree`. Extend
`test/cloneElementSubtree.test.ts` — it currently has **zero** assertions
about `name`, which is why the behaviour was free to be wrong.

### Phase 2 — right-click Duplicate
Add the item to `ElementContextMenu.tsx`, calling `duplicateElement(id)`.

### Phase 3 — e2e
One spec covering rename → duplicate → both rows named, via both Cmd+D
and the context menu.

---

## Files to touch

**Modified:** `src/renderer/lib/element/tree.ts` (delete 3 lines),
`src/renderer/src/components/ElementContextMenu.tsx`,
`test/cloneElementSubtree.test.ts`.

**New:** `test/e2e/layers-panel/duplicate-name.spec.ts`.

**Shim regen:** renderer only (`tsconfig.web.json`), dev server stopped.

---

## Tests

**`test/cloneElementSubtree.test.ts`** — the behaviour itself:
- a named element's clone keeps `name`, and gets a different `id`
- `classNameFor(clone)` is `menu_<newid>`, not `rect_<newid>`, and is not
  equal to the original's class
- named **children** keep their names recursively (the story's last
  bullet — the clone walk is recursive, so this needs its own case)
- an unnamed original still clones to `name: undefined` (no accidental
  name invention)
- duplicating twice gives two clones with the same name and two distinct
  ids — the "each gets its own unique ID" bullet
- a component-instance clone keeps its name *and* still gets a fresh
  `instanceId` (guards against the deletion disturbing the spread)

**Round-trip** — the story's real payoff is that the name survives to
disk. Add to the existing generate/parse tests: duplicate a named
element, `generateCode`, `parseCode`, assert both elements come back
named `menu` with distinct ids and that the CSS has both class blocks.

**`test/e2e/layers-panel/duplicate-name.spec.ts`** — the wiring:
- rename a rect to "Menu" (double-click the layers row), Cmd+D, assert
  two rows read "Menu" and their `data-element-class` values are
  `menu_*` and differ
- the same via the right-click Duplicate item
- Only this file gets run — per the standing rule, no directory sweeps.

---

## Open questions

1. **Is the identical-name tree the outcome you want?** Two rows both
   reading "Menu" with nothing distinguishing them is exactly what the
   story asks for, and it's presumably why the name was cleared in the
   first place. The alternative is preserving the name but disambiguating
   the tree label only (e.g. a dimmed `_c3d4` after the name on rows
   whose name is shared). That's cosmetic — the model and the generated
   code are identical either way — so it can also be a later tweak. I
   lean **plain identical names now**, matching the story. yes we do want the identical name tree, this is standard on tools liek figma and we are already doing this when users dont rename and just have a bunch of rectangles.

2. **Should Duplicate also appear in the layers-panel right-click?** The
   tree row dispatches `scamp:open-element-context-menu`
   (`ElementTree.tsx:274`) — the *same* menu component, so adding the item
   gets both surfaces for free. Flagging only so it isn't a surprise. yes

3. **`slugifyName` uses `_`, not `-`.** "Hero Card" becomes `hero_card`,
   giving `hero_card_a1b2` — but the doc comment on `classNameFor`
   (`internal.ts:7`) claims `hero-card_a1b2`. The code is self-consistent
   (the parser splits on the *last* `_`), so this is a stale comment
   rather than a bug, and out of scope. Want me to fix the comment while
   I'm in the file? sure

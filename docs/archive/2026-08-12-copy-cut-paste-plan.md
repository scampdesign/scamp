# Copy, cut, and paste elements — Plan

Backlog: `docs/backlog-9.md` story 3 (read `:121-203`).
Status: **implemented**.

Two things came out differently from the plan:

- **Phase 3 needed no new component.** Right-clicking empty canvas already
  opens the *root's* element menu (`hitTest(...) ?? ROOT_ELEMENT_ID`), so
  instead of a `CanvasContextMenu` the canvas handler now computes the
  click point in the insert parent's local space and passes it through the
  existing event. Paste uses it when present.
- **Ordinary Cmd+V now offsets by 20px.** It previously pasted at the exact
  copied coordinates. Giving Cmd+Shift+V the "in place" job implies the
  plain one shouldn't be — but this is a change to existing behaviour, not
  just an addition.

The menu's Copy/Cut act on the right-clicked element rather than the whole
selection, because right-click deliberately collapses the selection to what
it hit (the copy-context spec depends on that). Cmd+C is the multi-select
path.

Scope was narrowed on review: cross-project token fallback and the system
clipboard moved to **`docs/plans/cross-project-paste-plan.md`**. This plan
covers copy, cut, paste, paste-in-place, and paste-at-a-point — everything
needed for same-project and cross-page use.

## Context

Copy and paste of element subtrees, plus cut, within a session. Cross-page
paste is the use case that matters most: build a nav on one page, reuse it
on the others.

---

## What already exists

More than the story assumes:

- **Cmd+C and Cmd+V are already bound and working**
  (`useCanvasKeyboardShortcuts.ts:145`, `:159`), with an internal
  clipboard in the canvas store (`canvasSlice.ts:533`) holding a deep
  snapshot of the subtree — structure, styles, text, nesting. There's an
  e2e for it (`action-shortcuts.spec.ts:29`).
- **Paste already clones with fresh ids and keeps names** — the latter as
  of the story-2 commit, which is the dependency this story names.
- **The clipboard already survives page switches.** Nothing clears it on
  `loadPage` / `loadComponent`, so the store lives for the whole session.
  The story's key use case is close to free already.
- **`resolveInsertParent`** (`lib/insertParent.ts`) already implements
  the story's paste-target rule exactly: prefer the selected element,
  walk up to the nearest container when it's a leaf, fall back to root.
  It's pure and already used by the OS-clipboard image/SVG paste path.
- **`deleteElementContents`** (`elementsCreate.ts:521`) already removes an
  element's children while keeping the element — which is exactly what
  cut-on-the-root needs (decision 4).
- **Multi-select exists** — Shift+click in both the canvas
  (`CanvasInteractionLayer.tsx:119`) and the layers tree
  (`ElementTree.tsx:263`).

## A real bug to fix first

`pasteElement` (`elementsCreate.ts:697`) does:

```ts
const parentId = selectedId ?? ROOT_ELEMENT_ID;
```

It ignores `resolveInsertParent`. So **pasting while a text, image, or
input element is selected nests the pasted subtree inside that leaf** —
invalid structure that the generator will happily write to disk. The
image/SVG paste path in the same file's caller does it correctly; the
element paste path never got updated.

Small, self-contained, and independently valuable, so it leads.

## The gaps

| Gap | Size | Plan |
|---|---|---|
| Paste target ignores the container rule (above) | small | phase 1 |
| Copy takes `selectedElementIds[0]` — multi-select silently copies one | medium | phase 2 |
| No Cmd+X | small | phase 2 |
| No Copy / Cut / Paste in the right-click menu | small | phase 2 |
| Copy/cut on the page root does nothing | small | phase 2 |
| No canvas-area right-click menu, so "paste at a point" has nowhere to live | medium | phase 3 |
| No Cmd+Shift+V paste-in-place | medium | phase 3 |
| No TSX/CSS text on the system clipboard | medium | *deferred* |
| `readClipboard` can't return plain text | medium | *deferred* |
| No token capture for cross-project paste | large | *deferred* |

---

## Decisions

### 1. The clipboard payload becomes multi-rooted

```ts
clipboard: {
  elements: Record<string, ScampElement>;
  rootIds: string[];   // was `rootId: string`
} | null
```

`rootId` → `rootIds` is what unlocks both multi-select copy and the
root special case below. Everything else in the store already handles
arrays of ids. The cross-project plan extends this payload further; the
array is the part both need.

The story's proposed shape has a separate `styles: Record<id,
CSSProperties>` map. We don't need it — styles live **on** `ScampElement`
in this codebase, so the subtree snapshot already carries them. A parallel
map would be a second source of truth for the same data.

### 2. Paste target is always `resolveInsertParent` — not configurable

The story says "(or as a sibling if the selected element is not a
container — configurable)". Dropping the configurability: pasting *into*
a text element isn't a preference, it's invalid. There's no coherent
setting where the other option is right.

### 3. Cut is copy + delete in one history entry

Otherwise undo after a cut takes two presses, and the intermediate state
(copied but not deleted) is meaningless to the user.

### 4. Copy/cut on the page root acts on its children

The root can't itself be copied — there's one page frame and pasting a
second makes no sense. Rather than refusing, copy and cut on the root
take **its children**, so "select the page, copy" means "copy everything
on this page". Multi-rooted clipboard (decision 1) is what makes this
representable, and `deleteElementContents` already implements the removal
half of cut.

Two details this raises:

- **An empty root is a no-op.** Copying a page with nothing on it leaves
  the previous clipboard alone rather than clearing it — silently losing
  a clipboard is worse than doing nothing.
- **Loose text on the root.** `deleteElementContents` also clears an
  element's own text and `inlineFragments`, but a copy can only capture
  child *elements*. So cut-on-root would remove loose text that the copy
  didn't take — a real (if rare) way to lose content. Cut-on-root will
  therefore remove only the child subtrees, leaving fragments in place.

### 5. Internal clipboard keeps winning over the OS clipboard

Already the rule for the SVG/image path, and it's the right one: if you
copied an element in Scamp, Cmd+V should paste that element, not
whatever a browser left on the system clipboard.

---

## Phases

Each phase is independently shippable.

### Phase 1 — fix the paste target
Route `pasteElement` through `resolveInsertParent`. A store-level test
that pasting onto a text element lands the copy as its *sibling*.

### Phase 2 — cut, multi-select copy, the root case, and the menu items
`rootId` → `rootIds`; `copyElements(ids)` snapshots several subtrees;
`cutElements(ids)` = copy + delete in one history commit; both expand the
root to its children per decision 4. Add Copy, Cut, and Paste to
`ElementContextMenu` (which the layers tree gets for free — it opens the
same menu).

### Phase 3 — paste in place and paste at a point
`Cmd+Shift+V` reuses the copied `x`/`y` rather than the offset. The
right-click-paste-at-a-point half needs a **canvas-area context menu**,
which doesn't exist yet — right-clicking empty canvas currently does
nothing. `PageContextMenu` is the primitive to build it on.

---

## Files to touch

**New:** `src/renderer/src/components/CanvasContextMenu.tsx` (phase 3),
`test/e2e/clipboard/copy-paste.spec.ts`.

**Modified:** `store/canvas/slices/elementsCreate.ts` (the clipboard
actions), `store/canvasSlice.ts` (types),
`useCanvasKeyboardShortcuts.ts`, `ElementContextMenu.tsx`,
`test/e2e/keyboard-shortcuts/action-shortcuts.spec.ts` (the existing
copy/paste test).

**Shim regen:** renderer only (`tsconfig.web.json`), dev server stopped.

---

## Tests

The clipboard actions live in the store, not `lib/`, so most of the
coverage is store-level and e2e. `resolveInsertParent` is already pure
and covered.

**Store-level:**
- pasting with a text element selected produces a **sibling**, not a
  child (the phase-1 regression)
- pasting with a rectangle selected still produces a child
- cut removes the element and leaves exactly one undo entry
- multi-select copy round-trips two subtrees, both with fresh ids
- copy on the root captures its children as multiple roots; on an empty
  root it leaves the existing clipboard untouched
- cut on the root empties the page but keeps the root element
- paste-in-place reuses the source `x`/`y`; ordinary paste offsets

**e2e (`test/e2e/clipboard/copy-paste.spec.ts`):**
- copy on page A → switch to page B → paste lands on B
- Cmd+X removes the element and Cmd+V brings it back
- right-click → Copy, then right-click empty canvas → Paste at that point
- two elements Shift-selected, copied, and pasted as two

Only the spec files touched get run — per the standing rule, no directory
sweeps.

---

## Resolved questions

1. **Scope.** Phases 4–5 carved out into
   `docs/plans/cross-project-paste-plan.md`.
2. **Cmd+C overwriting the system clipboard.** No — an explicit "Copy as
   code" action instead. Deferred with the rest of the system-clipboard
   work.
3. **Pasted component instance with no matching component.** Moved to the
   cross-project plan.
4. **Cut/copy on the page root.** Acts on the root's children rather than
   being refused. See decision 4.

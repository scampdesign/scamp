# Drag-and-drop placement helpers — Plan

Backlog: `docs/backlog-9.md` story 4 (read `:206-311`).
Status: **implemented** — phases 1, 2, 3 and 5. Phase 4 (gap opening)
deliberately deferred pending manual testing.

Two things the plan didn't anticipate:

- **Escape needed a new history primitive.** Cancelling a move drag has to
  close the open transaction without committing, or the abandoned gesture
  leaves an undo step that does nothing visible. `cancelHistoryTransaction`
  mirrors the end path, minus the commit — it still drains a queued
  external edit, which must not be lost just because the drag was
  abandoned.
- **Escape had to be armed from pointer-down**, not from when a drop
  target resolves. The reorder hook now exposes `active` for that; keying
  off `dropIndicator` would have left the first moments of a drag
  uncancellable.

The tree's "inside" highlight kept its solid fill and gained the canvas's
accent outline, rather than being converted to the canvas's subtle tint —
a tint alone is hard to pick out in a dense list of rows, so full parity
there would have been a regression in clarity.

## Context

Dropping an element near a container is ambiguous: it's unclear whether it
will land *inside* that container or *between* it and its neighbour, and
people frequently get the one they didn't mean. The story asks for
unambiguous feedback — a highlighted container for "inside", an opened gap
with an insertion line for "between" — on both the canvas and the layers
tree.

This is the largest story in the backlog and I'd want to land it in
phases. Usefully, the phase that **fixes the actual ambiguity is the
cheapest one**, and the most expensive (gap-opening animation) is polish
on top.

---

## What already exists

Both surfaces have more than the story assumes — and, importantly, they
have *different* amounts:

**Canvas** (`canvas/interactions/`):
- `.dropIndicator` — an accent insertion line, drawn from a frame-local
  rect (`CanvasInteractionLayer.module.css:13`)
- `.dropContainer` — an accent outline with an 8% tint over the target
  container (`:24`). **Both of the story's visual states already exist**
- `resolveReparentDrop` / `flowIndicator` (`reparentDrop.ts`), shared by
  the move, reorder, and component-drop paths
- `resolveDropContainer` (`useCanvasGeometry.ts:177`) correctly treats
  only rectangles as containers

**Layers tree** (`ElementTree.tsx`):
- `computeDropPosition` (`:88`) — **already implements 25/50/25**
- `dropLine` before/after, and a `rowDropInside` row highlight
- Real-time updates via `onDragOver`

So the story is less "build drop feedback" than "make the two agree, and
close the specific gaps".

---

## The actual diagnosis

### The canvas has no edge bands at all

This is the cause of the reported frustration, and it isn't in the visual
layer — it's in targeting. `resolveDropContainer` returns **the deepest
rectangle under the cursor**, so:

- cursor over a sibling container's *body* → that container is the target
  → **drop inside**
- cursor in the *gap between* siblings → the deepest rectangle is the
  shared parent → same-parent → falls through to the reorder path →
  **drop between**

There is no middle ground and no edge band. To place an element *next to*
a container you must hit the narrow gap between elements; anywhere on its
body nests you inside. That is exactly "users frequently drop into a
container they did not intend to", and the story's 25/50/25 split is
precisely the missing piece.

(Within a flow parent, `flowIndicator` does a 50/50 before/after split on
the sibling under the cursor — but only once the parent is already
resolved, so it never offers "inside that sibling".)

### The two surfaces implement drop targeting twice

The tree's `computeDropPosition` (DOM rect, 25/50/25) and the canvas's
`resolveDropContainer` + `flowIndicator` (hit-test, 50/50) are unrelated
code with different rules. The story is explicit that they should behave
identically; today they can't, because there's no shared definition to be
identical to.

### The tree lets you drop inside things that can't hold children

`computeDropPosition` excludes only `el.type === 'text'`, so **images,
inputs, and component-instances all offer "drop inside"** in the tree. The
canvas gets this right (`el.type !== 'rectangle'` → not a container). So
the tree can currently produce a child of an `<img>`.

### Nothing opens a gap

Both surfaces draw a line in the space that's already there. The
"elements visually shift apart to make room" behaviour doesn't exist
anywhere, and it's the story's most visible ask.

### Escape doesn't cancel a canvas drag

`useComponentDrop` mentions Escape in a comment (HTML5 drag fires no
drop event), but the pointer-driven move/reorder state machines have no
Escape handling — a started drag can only be finished, not abandoned.

### Leftover debug instrumentation

The tree's `handleDrop` (`ElementTree.tsx:169-195`) pushes diagnostic
objects onto `window.__scampDropDiag` on every drop, unconditionally, and
never clears it. It should go with this work.

---

## Decisions

### 1. One pure `lib/dropZones.ts`, consumed by both surfaces

```ts
export type DropZone = 'before' | 'inside' | 'after';

export const resolveDropZone = (input: {
  rect: { start: number; size: number };  // along the relevant axis
  cursor: number;
  canHoldChildren: boolean;
}): DropZone;
```

Axis-agnostic (the tree is always vertical; a flex-row container splits
horizontally), so the same function serves both. Being in `lib/` it gets
full test coverage, which is where the 25/50/25 edge cases belong rather
than in an e2e that drags pixels around.

### 2. The edge band is a clamped percentage, not a flat 25%

25% of a 24px tree row is a 6px target — unhittable, and the story flags
this ("Smaller elements may need a different ratio since the middle zone
gets very small"). It's equally wrong at the other end: 25% of an 800px
container is a 200px band that swallows the middle.

Clamp it: `band = clamp(6px, 25% of size, 16px)`. Small rows keep a usable
band, large containers keep a dominant middle, and one rule covers both.

### 3. Container eligibility comes from one shared predicate

`canContainChildren` currently lives private in `insertParent.ts`
(rectangle-only). Export it and use it in both surfaces, which fixes the
tree's leaf bug by construction rather than by duplicating the rule a
third time.

### 4. Edge bands apply in flow parents; absolute parents keep today's rule

> **Revised after manual testing.** The first pass restricted edge bands to
> **flex** parents, on the reasoning that a grid's indicator appended at
> the end rather than inserting. That was fixing the symptom backwards:
> the right move was to make grid resolve a sibling like flex does, which
> it now does. Grid and flex behave identically.
>
> Also added: a flow drop now outlines the container it lands in. The gap
> line alone says where among the siblings but not *whose* siblings, which
> is the question the user actually has mid-drag.
>
> **Second revision.** Grid children never entered the reorder path at
> all: the drag decision in `handlePointerDown` asked `isFlexChild`, so
> they fell through to the absolute-move machine — dragging them did
> nothing visible (grid owns placement) and the only feedback came from
> whichever sibling was under the cursor. `isFlowChild` (flex OR grid)
> gates the reorder now. `isFlexChild` stays flex-only for the
> resize-handle rule, where a grid item genuinely can carry its own size.

In an absolutely-positioned parent, sibling *order* doesn't affect where
anything appears — only paint order. "Drop between these two" has no
visual meaning there, so offering it would be feedback that promises
something the user can't see. In absolute parents the existing behaviour
is already right: body of a container = inside, anywhere else = into the
parent at that point.

So edge bands turn on when the hovered element's parent is flex or grid
— which is also where the ambiguity actually bites.

### 5. Gap-opening lands in the tree first, and may not come to the canvas

The tree is safe: uniform-height rows, no hit-testing against moving
geometry.

The canvas is not. Shifting elements during a drag changes what's under
the cursor, and the drop target is *computed from* what's under the
cursor — so the shift can change the target, which changes the shift.
That's an oscillation risk, and the measurement path
(`measureElementInFrame`) reads the DOM live, so it would see the
animation mid-flight. Doing this safely means resolving the target
against pre-drag geometry rather than live geometry, which is a real
change to how the drag loop works.

Recommendation: gap-opening in the tree, evaluate on the canvas after
seeing it. The canvas already highlights the container and draws a line,
which is most of the clarity.

---

## Phases

Ordered so the ambiguity is fixed early and the expensive polish is last.

### Phase 1 — the shared rule
`lib/dropZones.ts` + tests. Export `canContainChildren`. Adopt in the
tree, replacing `computeDropPosition` — which also fixes the drop-inside-
a-leaf bug. Delete the `__scampDropDiag` instrumentation.

### Phase 2 — edge bands on the canvas
Consult `resolveDropZone` in `resolveDropContainer` / `resolveReparentDrop`
so hovering a container's leading/trailing band means "sibling", not
"inside". **This is the phase that fixes the reported problem**; the
existing indicator and outline visuals need no change.

### Phase 3 — visual parity
Indent the tree's insertion line to the depth it will drop at (it's
currently `left: 8px` regardless, so it doesn't signal nesting level as
the story asks). Align the tree's `rowDropInside` styling with the
canvas's outline+tint so "inside" reads the same on both.

### Phase 4 — gap opening
Tree rows shift apart around the insertion line, 120ms. Canvas deferred
pending decision 5.

### Phase 5 — Escape cancels a drag
Wire Escape into the move/reorder state machines: restore pre-drag state,
clear indicators.

---

## Files to touch

**New:** `src/renderer/lib/dropZones.ts`, `test/dropZones.test.ts`,
`test/e2e/layers-panel/drop-placement.spec.ts`.

**Modified:** `src/renderer/lib/insertParent.ts` (export the predicate),
`src/renderer/src/components/ElementTree.tsx` + `.module.css`,
`src/renderer/src/canvas/interactions/{reparentDrop,useCanvasGeometry,
useMoveInteraction,useReorderInteraction}.ts`,
`src/renderer/src/canvas/CanvasInteractionLayer.module.css`.

**Shim regen:** renderer only (`tsconfig.web.json`), dev server stopped.

---

## Tests

**`test/dropZones.test.ts`** — where the real logic is, so where the real
coverage goes:
- each third of a tall element returns before / inside / after
- a leaf (`canHoldChildren: false`) never returns `inside` — the midpoint
  splits before/after instead
- the band clamps: a 24px row gets a 6px band, not 6% of it; an 800px
  container gets 16px, not 200px
- an element smaller than twice the minimum band still splits sensibly
  and never returns an empty middle for a container
- cursor exactly on a boundary resolves deterministically (no flicker
  between two zones a pixel apart)
- zero-size and negative-size rects don't throw

**`test/e2e/layers-panel/drop-placement.spec.ts`** — the wiring:
- dragging onto a row's middle highlights it and drops as a child
- dragging onto its top band shows the line and drops as a sibling
  *before* — the disambiguation the story is about
- an image row never highlights for "inside" (the leaf-bug regression)
- the insertion line's indent matches the depth it drops at

Canvas drag behaviour is covered by the existing
`test/e2e/canvas/drag-reparent.spec.ts`; phase 2 adds a case there for
dropping on a container's edge band landing as a sibling. Only the spec
files touched get run — per the standing rule, no directory sweeps.

---

## Open questions

1. **Is phase 4 (gap opening) worth it?** Phases 1–3 fix the actual
   ambiguity — after them, the top/bottom quarter of anything means
   "beside" and the middle means "inside", consistently on both surfaces,
   with a line and a highlight to say which. The opening gap is a
   nice-to-have on top, and on the canvas it carries the oscillation risk
   in decision 5. I'd ship 1–3, look at it, and then decide. Happy to do
   all five if you want the full effect. we can set this aside and circle back if I think I need it after my manual testing.

2. **Should the canvas get gap-opening at all?** See decision 5 — it
   needs the drag loop to resolve targets against pre-drag geometry, which
   is a meaningful change to code that currently works. My inclination is
   tree-only. we will go with your reccommendation for now

3. **Band size constants.** I've proposed `clamp(6px, 25%, 16px)`. The
   story says 25/50/25 is "a starting point — it may need tuning". These
   are easy to change later; worth knowing if you already have a feel for
   them from using it. lets go with your rec

4. **Does dropping *between* two elements in an absolute container mean
   anything to you?** Decision 4 says no (position is x/y there, so order
   only affects paint order) and keeps today's behaviour. If you'd want
   the insertion line there as a z-order affordance, that's a different
   feature and I'd scope it separately. not in an absolute container, the drag drop and reorder affordances and improvements are only needed on flext containers

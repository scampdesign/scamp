# Flex controls in the Layout section — Plan

Status: **landed 2026-09-04**, all three phases in one pass. The open
questions at the bottom were answered before the build (longhands;
`auto` default; parent-convention spelling; px means don't-shrink) and
the answers are recorded inline there.

One correction to the "elementToStyle trap" below, found while
building: the canvas already loads the generated stylesheet and has
peeled the flex/grid *container* properties out of the inline layer
(`docs/notes/canvas-inline-layer-peel.md`), so a typed container field
renders through the generator, not through `elementToStyle`. The trap
is real only for values that stay inline — the fill-height `align-self`
substitution and grid-item placement — and those are where the canvas
changes were made.

Prompted by: the Layout section has no **Wrap** control. Pulling on that
thread found the rest of the flex vocabulary is also missing, on both
the container and the child side, and that a few of the gaps are not
just "no control" but **silent round-trip loss**.

Related: `docs/archive/2026-09-04-flex-sizing-contract-plan.md` (fill semantics, the
`flex: 1` contract, the drawn-size guard) and `docs/todos.md` §1 (the
parked "don't shrink" control). Phase 2 here is the natural home for
that todo.

## Context

The typed flex model today is exactly the subset the first Layout
section needed:

| Side | Typed today | CSS accepted by the parser |
|---|---|---|
| container | `display`, `flexDirection` (`row`/`column`), `gap`, `alignItems` (4 values), `justifyContent` (5 values) | the same values only |
| child | nothing flex-specific. `alignSelf` exists but is grid-flavoured (`start`/`center`/`end`/`stretch`) and the Size section only shows it when the parent is **grid** | `align-self` with grid spellings only |

Everything else — `flex-wrap`, `align-content`, `row-reverse`,
`space-evenly`, `baseline`, `flex-grow` / `flex-shrink` / `flex-basis`,
`order`, `align-self: flex-start` — falls through `cssPropertyMap` as
"unmapped" into `customProperties`. That is the designed escape hatch,
and it means these all **render** correctly on the canvas and
round-trip verbatim. What they don't do is show up in the panel.

`agent.md` currently makes a virtue of this: the "Flex children" note
under *Editability* tells agents that per-child flex "works in the
browser but is invisible to the panel" and to avoid it. The recommended
pattern in that same note is `display: flex; flex-wrap: wrap` on the
parent — which is itself not editable. So the guidance steers agents
into the one flex property the panel can't touch.

### Three real bugs found while looking

These are worth fixing whether or not the UI lands, and Phase 0 pins
each with a failing test first.

1. **Per-axis gaps are dropped from flex containers.** The parser maps
   `column-gap` / `row-gap` into `columnGap` / `rowGap` unconditionally,
   but `declarations.ts` only emits those fields inside the `display:
   grid` branch. A flex container written with `row-gap: 16px;
   column-gap: 8px;` parses fine and regenerates with **neither** —
   the declarations vanish on the next canvas write. With wrapping this
   stops being an edge case: row gap between wrapped lines is the
   normal thing to want.
2. **`justify-content: space-evenly` and `align-items: baseline`
   silently degrade.** Both return `null` from their mappers, so they
   land in `customProperties`. The typed field keeps its default, so the
   panel shows *Start* / *Stretch* while the canvas shows the real
   value — and a typed edit then emits a second, conflicting
   declaration. The duplicate indicator on the section header catches
   this after the fact; it shouldn't be possible.
3. **`align-self: flex-start` / `flex-end` on a flex child** — the
   spelling every flex tutorial uses — is rejected by the mapper, which
   only knows the grid spellings. Same degrade path as (2).

## What already exists

This is mostly extending a pattern that has been applied twice before
(grid containers, grid items), so the shape of every change is known.

| Need | Already there |
|---|---|
| Typed field → CSS, defaults omitted | `generateCode/declarations.ts`, `DEFAULT_RECT_STYLES` |
| CSS → typed field, unknowns preserved | `cssPropertyMap.ts` + `customProperties` |
| Typed field → canvas inline style | `elementToStyle.ts` (spreads `customProperties` last, so today's values already render) |
| Per-breakpoint / per-state overrides | `BreakpointOverride = Partial<Omit<ScampElement, …>>` — new fields are overridable for free |
| Section header override / duplicate indicators | `Section` `fields` + `cssProperties` props |
| Segmented + enum controls with icons | `SegmentedControl`, `EnumSelect`, Tabler icons |
| 3×3 alignment picker, direction-aware | `AlignmentGrid` + `lib/alignmentGrid.ts` |
| Parent-aware child controls | `SizeSection` already gates grid-item controls on `parent.display === 'grid'` |
| Drawn-size guard on flex children | `flexChild.ts` — `flex-shrink: 0` via `customProperties` |
| Fill-height in a flex column | `flex: 1` emission + absorption, parity-tested — `2026-09-04-flex-sizing-contract-plan.md` |
| Canvas-vs-browser parity harness | `test/e2e/parity.spec.ts` |

No new dependencies. No new controls beyond composition of existing ones.

### The add-a-field checklist

`justifyItems` was the last container field added; it touches **22
files**, and that list is the checklist. Fields on `ScampElement` are
required, not optional, so every test that builds a full element
literal grows a line. That churn is the repo's precedent and is
accepted here rather than worked around with optional fields.

- `element/types.ts` — field + union
- `defaults.ts` — `DEFAULT_RECT_STYLES` **and** `DEFAULT_ROOT_STYLES` (line ~88)
- `element/tree.ts` — the group-creation literal
- `cssPropertyMap.ts` — mapper, with the `null`-on-unknown contract
- `generateCode/declarations.ts` — emit when ≠ default
- `elementToStyle.ts` — apply to the canvas DOM (see the trap below)
- `LayoutSection.tsx` / `SizeSection.tsx` — control, plus `fields` and `cssProperties` lists
- `templates/agentMd.ts` — the typed-properties list under *CSS properties*, and the *Flex children* editability note (Next.js **and** legacy halves)
- `docs/user_docs/properties-panel.md`, a new `flex-layout.md` mirroring `grid-layout.md`, `index.md`
- tests: `cssPropertyMap`, `defaults`, `generateCode`, `parseCode` round-trip, `elementToStyle`, `alignmentGrid`, `breakpoints`; integration `sync` + `externalEdit`; the e2e in `properties-panel/`

**The `elementToStyle` trap.** Today `flex-wrap: wrap` renders on the
canvas *because* it is in `customProperties` and those are spread last.
The moment it becomes a typed field it leaves `customProperties`, and
if `elementToStyle` doesn't apply the typed field the canvas **stops
wrapping** while the file still says `wrap`. Every field in this plan
needs its `elementToStyle` line landed in the same commit as its
mapper — and the parity harness is the check.

## Design

### Container — Layout section

Flex mode today is one row: mode segmented control, then the alignment
grid beside a stacked *Align* / *Justify* / *Gap*. The plan adds one row
and widens two dropdowns; it does not restructure.

```
[ Block | Flex row | Flex column | Grid ]        ⇄ Reverse   ← toggle, flex modes only

 ┌───┬───┬───┐   Align:    Start / Center / End / Stretch / Baseline
 │ · │ · │ · │   Justify:  Start / Center / End / Between / Around / Evenly
 │ · │ ▪ │ · │   Gap:      [ 8 ]  ⟷
 └───┴───┴───┘

 Wrap: [ No wrap | Wrap | Wrap reverse ]                              ← new row
   when wrapping:
   Align content:  Start / Center / End / Between / Around / Evenly / Stretch
   Row gap: [ 16 ] ↕    Column gap: [ 8 ] ⟷                            ← replaces Gap
```

Decisions, each with the reason:

- **Reverse is a toggle, not two more segments.** Six segments don't
  fit the panel width, and `row-reverse` is a modifier on a direction
  the user has already chosen. The model still stores the real CSS
  value (`FlexDirection` becomes the four-value union) so the file and
  the CSS tab read exactly what the browser reads.
- **The alignment grid keeps mapping by axis, not by visual position.**
  In `row-reverse`, clicking the left column still means
  `justify-content: flex-start` — which the browser draws on the
  *right*. Mirroring the grid to match would make the same cell mean
  different CSS depending on a toggle elsewhere. Figma makes the same
  call. The tooltip says "start" / "end", not "left" / "right", once
  reverse is on. `lib/alignmentGrid.ts` needs only a `mainAxisOf()`
  helper so it treats `row-reverse` as horizontal.
- **Wrap swaps the single Gap for Row gap + Column gap.** The model
  already has all three (`gap`, `columnGap`, `rowGap`); only the flex
  emission branch ignores the axis fields. The rule becomes: emit
  `gap` when the axis fields are both default, otherwise emit the axis
  fields — the same rule the grid branch already follows, which also
  fixes bug (1). Switching Wrap off folds the two back into `gap`
  (copying `columnGap` for a row, `rowGap` for a column), mirroring
  what `computeLayoutPatch` already does on the grid↔flex transition.
  Note CSS `row-gap` is *always* vertical regardless of
  `flex-direction`; the icons should say so.
- **Align content only shows when wrapping.** With a single line it
  has no effect and a visible control that does nothing reads as
  broken.
- **Baseline and Evenly are added to the existing selects.** The 3×3
  grid can't represent either (same as `stretch` / `space-*` today),
  and the existing "no active cell, dropdown carries the value" rule
  already covers that.

### Child — Size section, beside the grid-item controls

The Size section already has a parent-aware block for grid items. A
sibling block appears when the parent is **flex**:

```
 Flex child
   Grow:  [ 0 ]     Shrink:  [ 1 ]  ☐ Don't shrink     Basis:  [ auto ]
   Align self:  Auto / Start / Center / End / Stretch / Baseline
   Order: [ 0 ]                                                      (Phase 3)
```

- **`flexGrow: number`, `flexShrink: number`, `flexBasis: string`.**
  Basis is free text like `gridColumn`, so `200px`, `0%`, `auto`,
  `var(--card-w)` all round-trip. Grow and shrink are plain numbers;
  the UI clamps at ≥ 0.
- **"Don't shrink" is `flexShrink: 0`,** and it is what closes
  `todos.md` §1. The drawn-size guard in `flexChild.ts` moves from
  `customProperties['flex-shrink'] = '0'` to the typed field. That
  satisfies the todo's hard constraint — *the guard must be stored in
  the file, never derived* — because a typed field emits a real
  declaration. `parseCode` needs no special case: `flex-shrink: 0` now
  maps to the field like any other. The todo's other half (should
  typing a px width in the panel also set the guard?) stays a product
  decision; nothing here forces it.
- **`alignSelf` grows from a grid enum to a flex-and-grid one.** See
  open question 2 — the default changes from `stretch` to `auto`, and
  that touches the fill-height contract.
- **The `flex: 1` fill contract is left exactly alone.** A `stretch`
  height in a flex column emits `flex: 1` and the parser absorbs the
  exact string `flex: 1` back into `heightMode` (`parseCode/index.ts`
  ~345). That is a *mode*, parity-tested, and it stays a mode. The
  typed grow/shrink/basis fields only ever describe what the user set
  explicitly; the generator emits the fill line first and the explicit
  longhands after, and Phase 0 pins that they never contradict.

### `flex` shorthand on the way in

Agents write `flex: 1 1 200px` and `flex: none` far more often than
the longhands. The mapper expands the shorthand into the three fields
(`1` → `1 1 0%`, `auto` → `1 1 auto`, `none` → `0 0 auto`, `initial` →
`0 1 auto`, one number → grow, two → grow shrink, three → all), except
the one case already spoken for: exact `flex: 1` on a heightless
flex-column child stays the fill-height absorption. The way *out* is
open question 1.

## Phases

### Phase 0 — characterise what is lost today

Failing tests first, one per gap, all pure. They are the acceptance
tests for the rest of the plan and the record of why it exists.

- `generateCode`: a flex container with `columnGap` / `rowGap` set
  emits them (bug 1).
- `parseCode` round-trip through `generateCode` for a file containing
  each of: `flex-wrap: wrap`, `align-content: space-between`,
  `flex-direction: row-reverse`, `justify-content: space-evenly`,
  `align-items: baseline`, child `flex: 1 1 200px`, child `flex-grow:
  1`, child `align-self: flex-end`, child `order: 2`. Today each lands
  in `customProperties`; the tests assert the typed field.
- `elementToStyle`: for each of the above, the canvas style carries
  the value **after** it leaves `customProperties`. This is the test
  that catches the trap.
- `generateCode`: a flex-column child with `heightMode: stretch`
  **and** an explicit `flexShrink: 0` emits `flex: 1` and
  `flex-shrink: 0` with no contradiction, and round-trips.

### Phase 1 — container fields

`flexWrap`, `alignContent`, the two reverse directions, `space-evenly`,
`baseline`, and per-axis gap emission in flex. The full checklist above
for each. UI: the Reverse toggle, the Wrap row, the two widened
selects, the gap swap. `alignmentGrid.ts` gets `mainAxisOf()`.
`computeLayoutPatch` learns the wrap↔gap migration. e2e:
`properties-panel/flex-wrap.spec.ts` — set Wrap, read the CSS module,
assert `flex-wrap: wrap` and a `row-gap`; toggle Reverse, assert
`flex-direction: row-reverse`. Run the parity harness.

Lands bugs (1) and (2).

### Phase 2 — child fields

`flexGrow`, `flexShrink`, `flexBasis`, the extended `alignSelf`, the
shorthand expansion, the guard migration in `flexChild.ts`. The "Flex
child" block in `SizeSection`. Update `draw-into-flex-parent.md` and
mark `todos.md` §1 resolved (or narrowed to the px-means-don't-shrink
question). e2e: draw into a flex row, assert the guard is now a typed
`flex-shrink: 0` and that "Don't shrink" reads checked; untick it,
assert the declaration is gone. Run the parity harness and the
`draw-into-flex` spec.

Lands bug (3). Settle open questions 1 and 2 before starting.

### Phase 3 — `order`, and the guidance

`order: number`, default 0, one input. Then `agent.md`: the typed list
gains the new properties, and the *Flex children* note is rewritten —
it currently tells agents per-child flex is invisible to the panel,
which stops being true. Replace it with the actual editability rule:
prefer the longhands or a simple shorthand over `calc()`-laden bases,
and note that `flex: 1` on a column child means fill-height to Scamp.
`flex-layout.md` for users, mirroring `grid-layout.md`'s table format.

## Risks

- **Fixture churn.** Three-plus required fields across ~22 test files
  with full element literals. Mechanical, but it's the bulk of the
  diff and where a stray default typo hides. Do it once, in Phase 1,
  for every field in all three phases, so the churn happens exactly
  once.
- **Canonicalisation on open.** A file written with longhands (or
  with the shorthand, depending on open question 1) gets rewritten in
  Scamp's canonical form on the first canvas-side write. That is the
  same thing that happens to every other typed property and the
  external-edit machinery already handles it, but it is a visible
  diff in the user's git status for projects that used these
  properties by hand. The `component-scaffold-roundtrip` note explains
  why the *blank* scaffold must be text-stable; that constraint
  doesn't extend to hand-written flex CSS, but it's worth a line in
  the changelog.
- **Parity.** Every canvas-side change here is exactly the kind of
  thing `parity.spec.ts` exists for. Run it per phase, not at the end.

## Open questions

1. **Emit `flex` shorthand or longhands?** Longhands are unambiguous
   and keep today's `flex-shrink: 0` guard text-stable for every
   existing project. The shorthand is what agents and humans write, so
   a canonical shorthand (`(g,1,0%)` → `flex: g`; `(0,0,auto)` →
   `flex: none`; else `flex: g s b`) keeps *their* files stable
   instead. It can't be both. **Recommendation: longhands**, because
   the guard is already in thousands of lines of user CSS and because
   a longhand can never be misread by the fill-height absorption,
   which keys on the literal `flex: 1`. go with rec
2. **`alignSelf` default: keep `stretch` or move to `auto`?** In CSS
   the initial value is `auto` (inherit the parent's `align-items`),
   and `stretch` is a real, different value once the parent isn't
   stretching. The grid code chose `stretch` as the default because
   grid's effective default is stretch, and the fill-height emission
   guards on `el.alignSelf === 'stretch'` meaning "unset". Moving to
   `auto` is more honest and makes the Align self control read
   correctly for flex children, but it means: adding `auto` to the
   union, changing that guard to `auto || stretch`, and one line in the
   grid-item emission. **Recommendation: move to `auto`**; the grid
   side keeps emitting nothing for the default either way, so no
   existing grid file changes. go with your rec
3. **Which spelling to emit for `align-self` start/end?** The parent
   side uses `flex-start` / `flex-end` for flex and the grid side uses
   `start` / `end`; the mapper should accept both everywhere. On emit,
   matching the parent's convention (flex spelling under a flex parent,
   grid spelling under a grid parent) keeps each file internally
   consistent. Minor; decide in Phase 2.  go with your rec
4. **Does typing a px width in the Size panel set "Don't shrink"?**
   Deliberately not decided here — it is `todos.md` §1's remaining
   half, and Angie parked it on 2026-08-29. Phase 2 gives it a typed
   home so that whichever way it goes later, it is a one-line change
   in `SizeSection`. yes

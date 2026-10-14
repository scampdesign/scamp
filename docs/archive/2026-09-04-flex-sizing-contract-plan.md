# The flex sizing contract — Plan

Status: **Phases 1-3 landed, with one rule inverted by the parity
harness — see "Rule 2 reversal" below. The explicit don't-shrink
control landed 2026-09-04 as a typed `flexShrink` field with the
px-means-don't-shrink rule (`docs/archive/2026-09-04-flex-controls-plan.md`), which
closes this.**

Earlier status: **Phase 0 complete — results below changed the design.** Rule 3's
main-axis half is DROPPED on the evidence; the fill-height half is kept
and measured safe. Phases 1-4 proceed from the revised contract.

Supersedes `2026-08-28-draw-free-space-plan.md` (free-space-constrained drawing),
which is kept as a stub pointing here.

## Context

Drawing and sizing rectangles inside flex parents produced a chain of
bugs this week, each fix exposing the next:

1. Draw clamp shrank width to `parentW - x` → the 20px bug.
2. Clamp read model sizes that are meaningless for stretch parents → the
   100px bug.
3. A full flex line shrank the drawn box below its own CSS → fixed by
   auto-adding `flex-shrink: 0` at draw time (`preserveDrawnSize`).
4. That leftover guard broke Fill width (`width: 100%` that cannot
   shrink overflows by its sibling's width) → `releaseDrawnSize`,
   commit `f4fe569`, reverted in `7238e00` after an unexplained canvas
   break.

Before re-fixing, we compared how two shipping tools resolve the same
tension between "the box you drew is the box you get" and "flex layout
negotiates sizes":

**Figma** lets you draw any size into an auto-layout frame and grows
the frame to fit. That is not exotic — it is exactly what CSS does when
the parent is `fit-content`. It only *looks* magical because Figma
frames float on an infinite canvas.

**Paper** (HTML-canvas tool, closest analogue to Scamp) exports this
for a frame with three drawn children:

```jsx
<div style={{ display: 'flex', gap: 16, overflow: 'clip', padding: '16px', ... }}>
  <div style={{ flexShrink: '0', height: '423px',  width: '342px' }} />
  <div style={{ flexShrink: '0', height: '1526px', width: '464px' }} />
  <div style={{ flexShrink: '0', height: '593px',  width: '1110px' }} />
</div>
```

Every child gets `flexShrink: 0` — not as residue but as a **system
invariant**: in Paper, nothing ever shrinks. The parent gets
`overflow: clip` so an over-full line clips instead of renegotiating
anyone's size.

And for the exact layout that started this week — fixed sidebar, main
filling the remainder — Paper writes:

```jsx
<div style={{ display: 'flex', gap: 16, height: '832px', overflow: 'clip',
              alignItems: 'start', padding: '16px', width: '1280px' }}>
  <div style={{ alignSelf: 'stretch', flexShrink: '0', width: '342px' }} />
  <div style={{ alignSelf: 'stretch', flex: 1 }} />
</div>
```

That is this plan's contract verbatim: `flex: 1` for Fill, the shrink
guard on the fixed axis and nowhere else, and `align-self: stretch`
with NO height for fill-height — even though their parent has a
definite height where `height: 100%` would have worked. It is their
general rule, not a workaround.

The one place Scamp deliberately diverges from Paper: no automatic
`overflow: clip`. Silently hiding content in generated web code is a
trap someone finds in production; clip stays a deliberate user choice.

## The contract

Four rules. Each is independently useful; together they make drawn
boxes, fixed sizes, and Fill stop being enemies.

### Rule 1 — Draw freely

No free-space gating, no size clamp against the parent inside flex
parents. Draw any size, anywhere in the parent. `MIN_SIZE` (20px) still
floors the result; non-flex (absolute-positioning) parents keep today's
`clampToParent` behaviour unchanged.

### Rule 2 — Fixed-in-flex means `flex-shrink: 0`, derived not stored

*(Decided: yes — Q1.)*

A flex child whose **main-axis** mode is `fixed` (row parent → width,
column parent → height) gets `flex-shrink: 0` emitted **by the
generator**, the way Paper does — a rule you can predict from the
panel, not a property left behind by a gesture. Every fixed flex child
in every export carries it; that is now the house style of
Scamp-generated code.

Derived, not stored: `preserveDrawnSize` (which wrote it into
`customProperties` at draw time) is deleted. The generator emits it
from the model (`parent is flex` + `main axis fixed`), and `parseCode`
absorbs a matching `flex-shrink: 0` back into that expectation instead
of routing it to `customProperties` — same typed-echo dedupe rule the
codebase already uses (`docs/notes/typed-property-echo.md`). Existing
files with the draw-time residue self-heal on their next save. Any
OTHER `flex-shrink` value stays a verbatim custom property, untouched.

Consequences worth stating: `flex-shrink` only affects the main axis,
so cross-axis fixed sizes need nothing. Text, hug, and auto children
are not guarded — they shrink and wrap like the browser, which is what
a hand-coder expects of them. And because the guard is derived,
switching the axis away from `fixed` removes it automatically —
`releaseDrawnSize` becomes unnecessary rather than re-landed.

### Rule 3 — Fill-height in a flex row emits `align-self: stretch`

*(Narrowed by Phase 0. The original rule proposed a full Fill matrix
including `flex: 1` on the main axis; measurement killed that half —
see Phase 0 result 1. What survives is the fill-height fix.)*

| Parent context | Fill **width** emits | Fill **height** emits |
|---|---|---|
| Non-layout (absolute positioning) | `width: 100%` — unchanged | `height: 100%` — unchanged |
| Flex **row** | `width: 100%` — **unchanged** (main axis; the shrink guard from Rule 2 is what makes it behave) | **`align-self: stretch`, no height** — the one change |
| Flex **column** | `width: 100%` — unchanged (cross axis; see `docs/notes/canvas-cross-axis-stretch.md`) | `height: 100%` — unchanged (main axis) |
| Grid | `width: 100%` — unchanged | `height: 100%` — unchanged (items already stretch by default; Phase 0 result 4) |

One cell changes. Everything else keeps the spelling it has today.

**Why only this cell.** `height: 100%` on a flex-row child resolves
against the container's height, which is `auto` under the usual
`min-height: 100vh` page root — indefinite — so the child computes to
**zero** and disappears. That is the invisible sidebar, and it is what a
real browser does with the CSS Scamp writes. `align-self: stretch`
fills the cross axis whether or not the container's height is definite
(Phase 0 result 2), which is why Paper emits it even where a percentage
would have worked.

Guarded on the default `alignSelf`, so a user-set alignment is never
contradicted by a second line.

**Parsing.** `align-self: stretch` with no height on a flex-row child
maps back to fill-height, closing the round trip and keeping the Size
panel reading "Fill" rather than "Auto". Any other `align-self` value
passes through as it does today.

**Migration: eager, because there is nothing to migrate.** Phase 0
result 3 measured every page in `scamp-ui`: zero elements would be
rewritten. Existing `height: 100%` files parse as fill-height already
and self-heal on the next save of that page.

### Rule 4 — Overflow resolves by the parent's sizing mode

*(Decided: visible overflow, no new indicator in v1 — Q3.)*

- **Hug (`fit-content`) parent → it grows.** Figma's behaviour, and
  also just CSS. With rule 1 removing the clamp, the browser does this
  on its own; the canvas mirrors it. No code.
- **Fixed parent → visible overflow.** The child sticks out, exactly as
  in a browser. No auto-`overflow: clip`, no v1 indicator.
- Follow-up: extend the canvas overflow indicator (today root-level) to
  flag over-full nested containers.

## Migration — the open decision Phase 0 must close

The reverted `f4fe569` broke something on the canvas that was never
diagnosed. The prime suspect is its migration: existing
`height: 100%` elements parse as Fill, so the first save re-emitted
them as `align-self: stretch`, shifting any layout that leaned on the
old collapsed rendering.

Rule 3 re-introduces that migration — plus a new one (`width: 100%` →
`flex: 1` for main-axis fill). Two candidate strategies:

- **Eager:** parse old spellings as Fill; next save rewrites them to
  the matrix. Files self-heal; layouts that depended on broken
  behaviour change.
- **Lazy:** old spellings round-trip byte-stably (parsed as
  fixed-with-custom-value, or a preserved-spelling flag); only a NEW
  Fill choice, or touching that axis in the panel, emits the matrix
  spelling.

Phase 0 decides with evidence instead of taste: apply the candidate
emissions to the real `scamp-ui` pages (`new-layout`, `test`,
`start-page`) and diff rendered geometry element-by-element against
today's rendering. If the diffs are all "broken layouts becoming what
the user meant" (invisible sidebars appearing, overflowing mains
snapping to the remainder), eager is right and the `f4fe569` break gets
an explanation on the record. If something defensible moves, lazy wins.


## Rule 2 reversal — derived vs stored (found in Phase 1)

Rule 2 said the shrink guard should be **derived** by the generator and
never stored. Implemented, it broke `parity: nested-flex-with-gap-and-padding`:

```
a_d002.w: canvas 120.0 vs browser 103.7 (off by 16.3px)
c_d004.w: canvas  60.0 vs browser  51.8 (off by  8.2px)
```

The parity harness renders the fixture's hand-written CSS **verbatim,
importing nothing from `src/`**. A derived declaration exists only in
Scamp's head, so the canvas laid out a file the browser could not see —
for every project Scamp did not write, which is the agent workflow the
whole product is built around.

Measured three ways, on the sidebar layout that started this:

| guard | sidebar renders | canvas/browser parity |
|---|---|---|
| derived (not in the file) | 287 ✓ | **broken** |
| none at all | **218 ✗** | fine |
| **stored (written into the file)** | **287 ✓** | **fine** |

Storing it is what puts the browser and the canvas in front of the same
declaration. "Derived, not stored" was exactly backwards for a tool
whose oracle is the file on disk — and Paper can hold the opposite view
only because it authors every file it renders.

`preserveDrawnSize` is therefore **kept**, not deleted. What remains
wrong with it is unchanged from the original bug list: it fires only at
draw time (not when a size is typed into the panel), and nothing removes
it when the axis switches to Fill.

**Recommended close: Angie's own proposal** — make the guard an explicit
control ("don't shrink") in the Size section, written into the file when
set. That preserves parity by construction, matches what a hand-coder
writes, and makes the property visible and removable instead of
residual. `releaseDrawnSize` then becomes unnecessary a second time,
because nothing is applied behind the user's back.

## Phase 0 — RESULTS (measured in Electron's Chromium, 2026-08-28)

### 1. Rule 3's main axis is unnecessary — and would regress real pages

Sidebar 342 fixed + main filling, Paper's frame geometry. Correct
remainder is 890.

| spelling | sidebar | main |
|---|---|---|
| today, no guards anywhere | 265 | 967 |
| **Rule 2 only** (guard on the sidebar, main keeps `width: 100%`) | **342** | **890** |
| Rule 2 + `flex: 1` on main | 342 | 890 |
| Paper's export verbatim | 342 | 890 |
| the reported bug (guard on MAIN) | **0** | 1248 |

The last row is Angie's disappearing sidebar, reproduced exactly: the
guard was on the wrong child. And rows 2-4 are identical — **the shrink
guard is what fixes this layout; the `flex: 1` spelling adds nothing.**

Worse, `flex: 1` is not neutral. Re-running the hero from
`docs/notes/canvas-flex-main-axis-stretch.md` (1440px, an in-flow 980px
decorative sibling):

| spelling | glow | inner |
|---|---|---|
| `width: 100%` (what the generator writes today) | 583 | **857** |
| `flex: 1` | 980 | **460** |

The note was right, and my "its argument dissolves if the file says
`flex: 1`" was wrong in the way that counts: the two spellings are
genuinely different layouts, not different spellings of one layout.
Switching the generator would silently re-lay-out every existing
project that uses Fill next to an in-flow sized sibling.

**Decision: Rule 3's main-axis change is dropped.** Fill on the main
axis keeps emitting `width: 100%` / `height: 100%`. No `flex: 1`
emission, no `flex: 1` parsing, no `min-width: 0` companion (Q2 is moot
— the canvas already adds it inline), no migration. The prior-art note
stands unamended.

### 2. Fill-height in a flex row: `align-self: stretch` confirmed

| parent | `height: 100%` | `align-self: stretch` |
|---|---|---|
| indefinite (`min-height: 400`) | 200x**0** | 200x400 |
| definite (`height: 400`) | 200x400 | 200x400 |

`height: 100%` collapses to zero against an indefinite container — the
invisible sidebar, root-caused. `align-self: stretch` is correct in
both cases, which is why Paper uses it even where a percentage would
have worked. **Kept.**

### 3. The fill-height migration is inert on real projects

The suspected cause of the `f4fe569` canvas break was its migration:
existing `height: 100%` elements re-emitting as `align-self: stretch`.
Measured against every page in `scamp-ui`:

| page | elements with `height: 100%` | would migrate |
|---|---|---|
| `app/page` | 1 | 0 |
| `alignment-grid` | 127 | 0 |
| `start-page` | 1 | 0 |
| `new-layout`, `test` | 0 | 0 |

Zero. The 127 in `alignment-grid` all sit inside **grid** parents, which
the rule never touched. The project contains no `align-self` at all, so
the parse-side half had nothing to bite on either.

**So the fill-height change did not break the canvas** — it was inert on
these files. That leaves `releaseDrawnSize` (which silently rewrote
`customProperties` whenever a size field was committed; the project has
4 such declarations) as the remaining suspect from that commit, and
Rule 2 makes it unnecessary regardless. Recorded as unexplained rather
than solved: see "Open risk" below.

**Migration strategy: eager**, on the evidence — there is nothing to
migrate.

### 4. Grid: leave it alone

| child in a `200px | 1fr` grid | result |
|---|---|---|
| no size declarations | 200x300 — already fills its track |
| `width/height: 100%` | 692x300 — same as the default |
| `justify-self/align-self: stretch` | same as the default |

Grid items stretch by default, and `100%` matches that in a definite
track. Nothing to change; the grid row of the Fill matrix stays as it
is today.

### 5. Rules 1 and 4 need no code

- Hug (`fit-content`) parent with an oversized child: parent grew to
  1230 — Figma's behaviour, for free, because it is just CSS.
- Over-full line (500px, two guarded 300s, one shrink-based fill): the
  guarded children held 300 each, the fill child floored at 0, parent
  `scrollWidth` 600. Visible overflow, no negative sizes. Accepted per
  Rule 4.

### Open risk

What actually broke the canvas after `f4fe569` is still unknown. The
fill-height migration is now ruled out by measurement; `releaseDrawnSize`
is the leading remaining candidate and is deleted-by-design under Rule 2.
Phase 4's e2e must therefore include a rendered-geometry regression over
a realistic multi-element page, not just the sidebar acceptance case.

## Phase 0 — the spike (as planned, for the record)

An Electron measurement script, same discipline as this week's checks.
Numbers go into this doc before phase 1 starts.

1. `flex: 1` next to a fixed `flex-shrink: 0` sibling — remainder in
   both canvas-equivalent DOM and plain browser DOM. Re-test the exact
   scenario `canvas-flex-main-axis-stretch.md` was written about, with
   the file spelling `flex: 1`. If a real divergence appears, rule 3 is
   re-designed, not forced.
2. Two Fill children → equal split under both spellings.
3. Over-full line: fixed+guarded children with one `flex: 1` child →
   the fill child floors at 0 (basis 0 cannot go negative) — confirm
   and accept as visible-overflow behaviour per rule 4.
4. Hug parent + oversized drawn child → parent grows identically on
   canvas and in a plain browser page.
5. **Grid matrix cells:** fill width/height in fixed tracks, `auto`
   tracks, and `fr` tracks, under both candidate spellings, canvas vs
   browser. Winners go into the rule 3 table.
6. **Migration diff:** candidate emissions applied to the real
   `scamp-ui` pages, rendered geometry diffed against today — closes
   the eager/lazy decision and, ideally, names what `f4fe569` actually
   broke.

## Phases

1. **Rule 2 — the derived shrink guard.** Generator emits
   `flex-shrink: 0` for a fixed main axis in a flex parent; parse
   absorbs the echo via the typed-echo dedupe rule; delete
   `preserveDrawnSize` and its wiring; migration test proving a file
   carrying the draw-time residue self-heals byte-stably. This is the
   fix for the reported sidebar bug (Phase 0 result 1).
2. **Rule 3 — fill-height only.** `align-self: stretch` emission for a
   stretch cross-axis in a flex row, guarded on the default
   `alignSelf`; parse mapping back; round-trip fixtures. Scope is one
   matrix cell.
3. **Rules 1 + 4** — remove the flex-parent size clamp from
   `useDrawInteraction`; hug-parent growth and fixed-parent overflow
   covered with rendered-geometry e2e; no new rendering code expected.
4. **E2e rewrite** — `draw-into-flex.spec.ts` re-asserted around the
   contract (guard present for fixed children *from the generator*,
   absent for hug/text; drawn size renders exactly, including into a
   full line; hug parent grows). Resurrect the sidebar+main acceptance
   spec from `f4fe569` with matrix expectations — the rendered
   `root.w - 287` assertion stays, since CSS-level assertions passed
   through every one of this week's bugs.
5. **Insertion index from draw position** *(decided: bundled — Q6)* —
   draw between two children, land between them, reusing the
   drag-reparent index logic. Last, because it is independent of the
   sizing rules and must not gate them.

## What this plan does NOT touch

- `flex-wrap` parents — today's behaviour.
- Existing files beyond the migrations named above (whose strategy
  Phase 0 decides).
- The "don't shrink" UI toggle — with rule 2 the guard is derived;
  dropped unless wanted later.
- Automatic `overflow: clip` — rejected deliberately, see Context.

## Decisions log (was: open questions)

1. Guard on every fixed flex child, Paper-style house rule — **yes**.
2. `min-width/min-height: 0` alongside `flex: 1` — **emit**. *(Moot:
   no `flex: 1` is emitted. The canvas already adds `min-width: 0`
   inline for stretch children.)*
3. Fixed-parent overflow in v1 — **visible, no indicator**.
4. Parse narrowness — **narrow**; foreign spellings pass through.
   *(The `flex: 1` half of this answer is moot — Phase 0 dropped that
   emission, so there is no new spelling to recognise beyond
   `align-self: stretch`.)*
5. Fill is context-smart on both axes, including grid — **in scope, and
   the audit found only one cell that needed changing** (flex-row
   fill-height). Grid, flex-column, and main-axis width were all
   measured correct as they stand.
6. Insertion index — **bundled**, as phase 5.

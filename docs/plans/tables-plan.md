# Tables in Scamp

Scamp has no tables. The importer grades one `lost` — "the elements
arrive, the layout doesn't" — and the tag picker offers `ul`, `ol` and
`li` but nothing from the table family. A ported data table loses its
layout entirely.

This plan adds them in a shape that fits the model Scamp already has,
rather than bolting a second layout system onto it.

---

## What people do instead, and what it costs

From the reviewed project's patient list — a table built without a
table:

```css
.sort_dob_296e { flex-grow: 0.8; flex-basis: 120px; }   /* header cell */
.dob_cell_f74c { flex-grow: 0.8; flex-basis: 120px; }   /* body cell   */
```

The header row and the body row are two independent flex rows, and every
column's width is written **twice** — once in each. That screen has
**eight such pairs**, four columns each side, and nothing couples them.
Change a column and you have to find its twin; miss it and the table
goes crooked in a way no test catches.

That is the cost, and it is the thing worth fixing. A screen reader
getting `<div>` instead of `<table>` matters too, but it is not what
makes the work unpleasant.

---

## The shape

**A table is a grid, written with table tags.**

```css
.table  { display: grid; grid-template-columns: 2fr 120px 100px; }
.row    { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; }
```

Three things fall out of that, and the third is why it is worth doing
this way:

1. **The columns are defined once**, on the table. Rows inherit them
   through `subgrid`. The duplication above cannot happen.
2. **It is Scamp's existing model.** A grid container with tracks is
   something the canvas, the panel and `generateCode` already handle.
   No second layout engine, no new box semantics.
3. **The rows stay real elements.** The usual "CSS grid table" trick
   puts `display: contents` on the row, which deletes it as a box — and
   the row is exactly where dividers, striping and hover live. `subgrid`
   keeps the row addressable. It also sidesteps `display: contents`,
   which Scamp does not support and which the importer already reports
   as a loss.

**Verified in Chromium**, on real `<table>`/`<thead>`/`<tr>`/`<th>`/`<td>`
tags with `display: grid` overriding table layout: header and body cells
land at identical x positions (8, 372, 492 twice) from a single column
definition. `CSS.supports('grid-template-columns', 'subgrid')` is true.

So we get the semantics *and* single-source columns without giving up
the box model.

---

## Phases

### Phase 1 — the tags — **done**

Add `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `caption` to
`TAG_OPTIONS`, and make sure nothing downstream trips on them:
`parseCode` reading them back, `generateCode` emitting them, the canvas
rendering them, and the tag-reset CSS that stops a browser's defaults
leaking in (`th` is bold and centred by default; `table` has
`border-spacing`).

Deliberately no layout work in this phase. A ported table keeps its
meaning and its content immediately, and looks no worse than the `div`
soup it replaces. Ship it alone.

What landed, and the two things that were not obvious going in:

- **`th` and `td` are in both tag lists.** They are dual-natured exactly
  like `li`: a plain `<td>Smith</td>` is a text element, one holding
  elements is a container. `TEXT_TAGS` gets all three of `th`, `td`,
  `caption`, and the structural-correction pass that already upgrades a
  `<li>` with children to a rectangle covers cells for free.
- **The reset needed its own sentinel.** Folding the table rules into
  `BROWSER_RESET_BLOCK` would have reached no existing project — every
  one of them already carries that sentinel. `TABLE_RESET_SENTINEL` is
  a seventh backfill check, so a project created before today gets the
  rules when it is opened. Mirrored in `ElementRenderer.module.css` with
  `:where` for zero specificity, per
  [`../notes/canvas-tag-reset-specificity.md`](../notes/canvas-tag-reset-specificity.md).

A table keeps the browser's `display: table` on both surfaces: the
model's `display: 'none'` is the "not a flex or grid container"
sentinel and emits nothing. So the reset is doing real work rather than
being shadowed by an inline style — the canvas writes no inline padding
when it matches the tag default, and no inline `font-weight` at all.

Cell padding is deliberately **not** added to `TAG_PADDING_DEFAULTS`.
The UA's 1px on a cell is zeroed by the reset on both surfaces, so
Scamp's universal `[0,0,0,0]` is already the truth — unlike `ul`, where
the 40px inline-start default had to be modelled.

Tests: `test/tablesRoundTrip.test.ts` (prefixed and unprefixed trees,
round-trip and byte-stability), `test/elementTags.test.ts` (the picker
and the parser agree on every tag, not just the table ones),
`test/themeBackfill.test.ts` (the seventh check).

### Phase 2 — columns in one place — **done**

The table element becomes a grid; `tr` gets `grid-template-columns:
subgrid` and `grid-column: 1 / -1`.

- A **Columns** control on the table: how many, and each track's size.
  The panel writes `grid-template-columns` on the table and nothing else.
- A cell must **not** carry its own width. Its width is the column's,
  and offering a width control on a `<td>` would recreate exactly the
  duplication this fixes. The panel should say so where the control
  would have been, rather than silently hiding it.
- `colspan` / `rowspan` map to `grid-column: span n` / `grid-row: span n`,
  which Scamp already stores.

This is the phase that pays for the plan.

It does. A three-column table with a header, a body row and a footer
now generates **one** `grid-template-columns`, and every row and cell
rule comes out empty:

```css
.rect_t1 { width: 600px; display: grid; grid-template-columns: 2fr 120px 100px; }
:where(.rect_t1) > :where(thead, tbody, tfoot),
:where(.rect_t1) :where(tr) { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; }
.rect_t2 {}  /* thead */
.rect_t3 {}  /* tr    */
.text_t4 {}  /* th    */
```

Measured through the real path — model → `generateCode` → `generateHtml`
→ Chromium — header, body and footer land at `0/380  380/120  500/100`,
and a `colSpan="2"` footer cell at `0/500` with the next at `500/100`.

**What the phase actually turned on.** Three things, none of which were
in the plan, and the first two would each have broken it silently:

1. **The subgrid has to chain through the SECTION.** A row's parent is a
   `tbody`, not the table, so `subgrid` on the row alone inherits
   nothing: measured, every cell in a row collapsed to the same x and
   the header and body rows sat at different offsets. `thead` / `tbody`
   / `tfoot` need the same three declarations as `tr`.
2. **The rule must match children by TAG, not by Scamp class.** The HTML
   parser inserts a `<tbody>` of its own around any `<tr>` written
   directly inside a `<table>`. That element carries no Scamp class, so
   a per-class rule missed it, the chain was cut, and every cell stacked
   in column one — **in the exported page only**, while the canvas
   (built through the DOM API, which inserts nothing) rendered it
   correctly. A canvas/preview divergence, from a rule that looked fine.
3. **`effectiveDisplay` had to learn the table tags.** A `tbody`'s typed
   `display` is the "neither" sentinel, so every caller answered no to
   "does this lay its children out?" and Scamp gave the rows
   `position: absolute`. An out-of-flow grid item is placed by nothing,
   so the columns reached no cell at all. The same seam already existed
   for `inline-grid`; table tags are the same problem from the other
   side, and routing the two remaining raw `el.display` checks through
   it fixed a latent `inline-grid` gap too.

**How it is written down.** Nothing about subgrid is stored on a row —
that copy is the duplication this exists to remove. The rule is derived
from the table in `@lib/tableGrid`, emitted after the table's own block,
and dropped on parse because its selector starts with `:where(` and is
attributed to no class. `colSpan` / `rowSpan` work the same way: the
attribute is the record, `grid-column: span n` is derived from it, and
the parser folds a matching declaration back so the model never carries
the span twice. An explicit placement a user typed still wins.

Every compound in the derived selector sits inside `:where()`, so it has
zero specificity and a row a user deliberately made a flex row stays
one — verified, not assumed.
[`../notes/canvas-tag-reset-specificity.md`](../notes/canvas-tag-reset-specificity.md)

**The panel.** A `table` gets a **Columns** section instead of the
layout-mode picker, since its mode is not a choice and its rows are
elements rather than track-list entries; an undefined table offers
"Define N columns", seeded from the row it already has. A cell's **W**
field is shown disabled reading `Column`, with the reason on hover —
said rather than silently removed, as the plan asked.

**Drawing inside a table** lands on the shape the HTML parser would
build: a child of `table` is a `tbody` (not a `tr`), of a section a
`tr`, of a row a `td`. Text is handled separately — words directly
inside a table are a `caption`.

Tests: `test/tableGrid.test.ts` (20). Each of the three fixes above was
reverted in turn to confirm the tests fail without it.

### Phase 3 — the styling a table actually needs — **done**

Dividers, striping, a sticky header, and cell padding and alignment, all
set once on the table in a **Rows and cells** section.

**Decided before building.** Striping cannot use the state machinery:
`.row_ab12:nth-child(even)` on each row fires only if *that* row is even,
so striping is a table-level rule by nature. A divider on every `tr` is
the per-row duplication Phase 2 removed. So all five live in one typed
field, `tableStyle` on the table, and the generator derives one rule per
setting, in `@lib/tableStyle` beside the subgrid rule. Cell padding and
alignment are a table default plus the cell's own override; per-column
is deferred, because `colspan` breaks the mapping from `:nth-child(n)`
to a column.

```css
.rect_t1 :where(th, td)            { padding: 8px 12px; text-align: left; }
:where(.rect_t1) :where(tr)        { border-bottom: 1px solid #e0e0e0; }
:where(.rect_t1) > :where(tbody) > :where(tr:nth-child(even)),
:where(.rect_t1) > :where(tr:nth-child(even of tr)) { background-color: #f5f5f5; }
:where(.rect_t1) > :where(thead)   { position: sticky; top: 0; z-index: 1; }
```

Header treatment needed nothing new: the `thead` is a real element with
its own class, so its background is already one control away.

**Read back strictly.** The parser turns a rule into `tableStyle` only if
re-emitting what it read gives the same declarations. An agent that adds
a `color` to the stripe rule or writes `solid 1px` keeps its rule
verbatim, as a `customSelectorBlocks` entry on the table, rather than
having it rewritten.

**What the phase turned on.** Three things, each found by measuring
rather than by the unit tests, which all passed:

1. **The cell rule cannot be zero-specificity.** In Chromium its padding
   came out `0`: the table reset's `th, td { padding: 0 }` is (0,0,1)
   and the canvas reset `.element:where(th, td)` is (0,1,0). The cell rule
   is `.table :where(th, td)` at (0,1,0), and a cell's own rule still wins
   the tie because the generator writes it later in the file. Every other
   derived rule stays at zero.
2. **The incremental writer never removed a `:where(` rule.** It treats
   anything not starting with `.` as hand-written and leaves it on disk,
   so a stripe switched off in the panel came straight back on the next
   parse. Phase 2's subgrid rule had the same problem when a table stopped
   being a grid. `cssRuleEdits` now recognises the derived table shapes
   (and only those — a hand-written `:where(.card) p` still survives). It
   also wrote every newly inserted rule's declarations at column zero;
   new rules are now indented like the generator's.
3. **The canvas hid the stripe.** It wrote an inline
   `background-color: transparent` on every element, which outranks any
   sheet rule. The default is no longer written inline.
   [`../notes/canvas-inline-layer-peel.md`](../notes/canvas-inline-layer-peel.md)

The stripe needs two selector arms: the exported page always has a
`tbody` (the HTML parser inserts one), the canvas has only the ones the
user drew, and `of tr` stops a `thead` sibling shifting the count there.
Measured on all three shapes.

Tests: `test/tableStyle.test.ts` (31), `test/cssRuleEdits.test.ts` (five
new, each failing on the old writer), the `table-rows-and-cells` parity
fixture (fails on the canvas without fix 3), and
`test/e2e/properties-panel/table-style.spec.ts`.

### Phase 4 — the importer stops losing them

`unsupported-display` currently grades a captured table `lost`. With the
shape above it becomes a translation:

- `<table>` → grid, with the column tracks read from **what the page
  actually measured**, the same way `normalizeGridTracks` already turns
  filling px columns into `fr`.
- `<tr>` → subgrid row. `<th>`/`<td>` → cells.
- The finding changes from `lost` to `approximated`, and says what it
  approximated.

An imported table then arrives editable rather than as a note saying it
could not come.

---

## Decisions, and what is still open

**What a cell's box controls do — decided.** Width belongs to the
column: the **W** field on a cell is disabled and reads `Column`, with
the reason on hover. Height, padding and alignment stay the cell's own.

**Whether a `<table>` may hold anything else — partly.** Drawing inside
a table now lands on the shape the HTML parser would build, so
`table > tr` is no longer the default path and the reparenting hazard in
Phase 2's finding 2 is off the common route. It is not *refused* at the
drop, though, and a `<div>` dragged into a `<tr>` is still accepted.
Worth a lint finding — the Checks section is the surface for it.

**What dragging a cell means — still open.** Scamp's canvas moves boxes.
Inside a table, moving a cell means moving it between columns: a
different gesture with a different result. Cells are still draggable
today. Selectable-but-not-draggable is probably right, and no other
element does that, so it wants its own look.

---

## What not to do

**Don't use `display: contents` on rows.** It is the common trick and it
deletes the row as a box — losing dividers, striping and hover, which is
most of what a table's styling *is*. Scamp does not support it, and the
importer already reports it as a loss.

**Don't build a Table primitive that isn't a table.** Emitting `div`s
with a table-ish API costs the semantics, and a ported `<table>` would
not round-trip as one. The tags are cheap; take them.

**Don't let a cell own a width.** It is the one rule that makes the
whole thing hold together, and the reviewed project is what it looks
like when nothing enforces it.

---

## How we will know it worked

Re-import a page with a real data table — the reviewed project's patient
list is one — and check three things:

1. The column widths appear **once** in the CSS, not once per row.
2. The import report grades the table `approximated`, not `lost`.
3. Changing a column in the panel moves the header and the body
   together.

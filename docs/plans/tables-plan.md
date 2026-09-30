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

### Phase 1 — the tags

Add `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `caption` to
`TAG_OPTIONS`, and make sure nothing downstream trips on them:
`parseCode` reading them back, `generateCode` emitting them, the canvas
rendering them, and the tag-reset CSS that stops a browser's defaults
leaking in (`th` is bold and centred by default; `table` has
`border-spacing`).

Deliberately no layout work in this phase. A ported table keeps its
meaning and its content immediately, and looks no worse than the `div`
soup it replaces. Ship it alone.

### Phase 2 — columns in one place

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

### Phase 3 — the styling a table actually needs

Small, specific, and each of these is something every table has:

- **Header treatment** — the `thead`/`th` row as its own styleable thing.
- **Row dividers** — a border on the row, not on every cell.
- **Striping** — `:nth-child(even)`. Scamp models a fixed set of
  pseudo-classes today; this needs one more, and it is worth checking
  whether the existing state machinery takes it or whether striping
  wants a dedicated control.
- **Cell padding and alignment** — per column would be ideal and is
  harder; per cell is what the model gives cheaply. Decide before
  building.
- **Sticky header** — `position: sticky; top: 0` on the header row. The
  reviewed project hand-rolled this; it should be a toggle.

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

## Decisions to make before Phase 2

**What a cell's box controls do.** Width belongs to the column. Height,
padding and alignment belong to the cell. The panel has to express that
difference rather than show every control and let two of them fight.

**What dragging a cell means.** Scamp's canvas moves boxes. Inside a
table, moving a cell means moving it between columns — a different
gesture with a different result. It may be right for cells to be
selectable but not draggable, which no other element does.

**Whether a `<table>` may hold anything else.** A `<div>` inside a `<tr>`
is invalid HTML that browsers silently reparent, which would move an
element the user placed. Worth refusing at the point of the drop.

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

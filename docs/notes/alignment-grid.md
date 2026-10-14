# The alignment grid preview

The 3×3 flex alignment picker (`controls/AlignmentGrid.tsx`). Nine clickable
cells with faint dots; the cell(s) matching the current alignment show preview
bars instead of their dot.

Designed in Scamp itself — `scamp-ui` project, `alignment-grid` page, which
holds all twelve row states plus a column state.

## Bars live in cells, not in an overlay

The earlier version absolutely positioned one preview flexbox across the whole
control and let flex place the bars. That looks equivalent and isn't: a flex
container puts its content's leading EDGE on the content edge, while the dots
mark cell CENTRES. Lining the two up needed an inset expanded by half the bar
group — width-dependent, and it was originally approximated with a hand-tuned
`padding: 0 3.5px` that only held at one control width.

Now each bar group is a **grid item on the same tracks as the cell it
describes**, and the cell centres it. There is no geometry to tune, and it
holds at any control size.

**Both the cells and the bar groups need explicit `gridColumn`/`gridRow`.**
Grid auto-placement positions explicitly-placed items first, so leaving the
nine cells auto-placed makes them flow *around* the bar group and spill into a
fourth row. That bug shows up as everything being off by exactly one cell.

## The band

Bars are 3px thick with lengths **10 / 14 / 8** px, and sit inside a band
whose cross size is fixed to the longest bar (14px), with `align-items` set
from the element's own value.

The band is fixed rather than `fit-content` because of `space-between`: there,
each bar sits in a *separate* cell, and a `fit-content` band would centre each
one independently — so `flex-start` would not produce a shared top edge. A
fixed band gives all three the same baseline whichever cell they're in.

Gaps come from the design and differ by axis: **4px for a row, 3px for a
column**.

## Which cells light up

| Value | Effect |
|---|---|
| justify `flex-start` / `center` / `flex-end` | one cell on that main-axis track holds all three bars |
| justify `space-between` / `space-around` | three cells across the main axis, one bar each |
| align `flex-start` / `center` / `flex-end` | picks the cross-axis track |
| align `stretch` | the group spans the whole cross axis (`1 / -1`) and bars fill it |

`space-around` is drawn the same as `space-between`: with one bar centred per
cell on a 3×3 grid the two are indistinguishable, and the dropdown still
carries the exact value. `stretch` and the `space-*` values have no single
cell, so `flexAlignToCell` returns null and no cell reads as pressed — the
bars are the indicator.

## Testing

`test/e2e/properties-panel/alignment-grid-design.spec.ts` measures the real
geometry: bar sizes, which cell holds them, that its dot is hidden, that the
group is centred in its cell, and that align start/center/end moves the shared
edge. `alignment-grid.spec.ts` covers the values a click emits.

Tolerance is 0.6px — tight enough to catch a reintroduced pixel nudge. A loose
tolerance passes for both the bug and the fix and guards nothing.

## Reverse directions map by axis

`row-reverse` and `column-reverse` (added with
`docs/archive/2026-09-04-flex-controls-plan.md`) do not mirror the grid. The left
column still means `justify-content: flex-start` in a row, even though
the browser now draws that item on the right. Mirroring would make the
same cell mean different CSS depending on the Reverse toggle elsewhere
in the panel; Figma makes the same call. `lib/alignmentGrid.ts` and the
control both ask `isColumnDirection()` and otherwise ignore the
modifier, and the preview band is laid out along the plain axis so the
bars don't flip either.

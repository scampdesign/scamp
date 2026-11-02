# A child with no `position` under a block parent is in flow

Scamp's `position: 'auto'` means "the tree-shape rule decides": a child of
a flex or grid parent is laid out by it, and a child of anything else is
`position: absolute` at its stored x / y. Every file Scamp writes says so
explicitly, so a Scamp-drawn child always has a `position` in its rule.

A hand-written or agent-written file often doesn't. In the browser a
child with no `position` under a block parent is in normal flow. Parsed
as `auto`, it drew at 0,0 on the canvas and the next save wrote it as
`position: absolute; left: 0px; top: 0px`. That is how a `<progress>`
inside a block component root collapsed the root to 0px and pulled the
row below it up over the bar.

`parseCode` now reads that child as `static`, the same value an import
writes for a box it leaves in flow. The generator then writes
`position: static`: one added line, the same rendering.

## Where it stops

- **No CSS rule at all** stays `auto`. That's an unmatched or ambiguous
  class name (see the rename-resilience tests), not a statement about
  layout.
- **An inline tag with no `display`** (`INLINE_BY_DEFAULT` in
  `tagDefaults.ts`) stays `auto`. As `static` the generator would write
  `display: block` for it, which the file never said.
- **Slot content** stays `auto`: its parent is an instance, which lays
  it out.
- **A component instance** needs no rule for this: with no `.inst_x`
  rule, or one with only a size, it is `static` too. The instance rule
  carries `position` only when the page places it (`instanceRuleLines`),
  and that reads back as `auto` at its x / y, like any placed element.

`<progress>` and `<meter>` joined `INLINE_BY_DEFAULT` with this: they're
inline-block, and the project reset doesn't make them block, so a
`display: block` on one in flow has to be written down or it's lost.

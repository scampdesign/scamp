---
title: Drawing into a flex or grid parent
related:
  - src/renderer/lib/bounds.ts
  - src/renderer/src/canvas/interactions/useDrawInteraction.ts
---

# Drawing into a flex or grid parent

Drawing a rectangle inside a flex container produced a box with the drawn
height and a **20px width**.

## The cause

`clampToParent` keeps a child inside its parent by shrinking it:

```ts
if (nx + nw > parentW) {
  nw = Math.max(MIN_SIZE, parentW - nx);
}
```

That is right for an absolutely positioned child, where `x` is where the
element actually sits. It is wrong for a flex or grid child, whose
position is decided by the layout — the drawn offset is not where the
element ends up, it is just where the pointer happened to be.

So the width was being shrunk to `parentW - x`. Draw near the right of a
container and that goes negative, leaving `MIN_SIZE`, which is 20.

The height survived because the same arithmetic ran against a tall parent
with room to spare. That asymmetry is what made the bug look strange —
"correct height, absurd width" reads like a width-specific bug, when both
axes were running identical, correct-looking code.

## The fix

`clampSizeToParent` bounds the size to the parent without consulting the
offset. `useDrawInteraction` picks it when the parent's `display` is
`flex` or `grid`, and keeps `clampToParent` otherwise.

The size is still bounded by the parent, so a draw cannot instantly create
overflow. Only the offset-driven shrink is dropped.

`x` and `y` are set to 0 for a layout parent. The generator emits no
`left`/`top` for a flow child, so a kept offset would be discarded on the
next round-trip anyway — zeroing it keeps the in-memory model matching
what lands on disk.

## The second half: the render, not just the model

Fixing the clamp made the CSS correct and the canvas still wrong. A drawn
box reported `width: 180px` in the stylesheet and rendered at 148px,
because a flex item's default `flex-shrink: 1` squashes it below its own
width as soon as the line overflows. Both halves were behaving exactly as
CSS specifies; they simply disagreed about the answer.

The draw tool's promise is that you get the box you drew, so a drawn
element in a flex parent now gets `flex-shrink: 0` (`preserveDrawnSize` in
`src/renderer/lib/flexChild.ts`), applied to the rectangle, image, SVG and
input creators — everything that commits an exact drawn size. Text is left
alone: it hugs its content, and pinning it against shrinking changes how
it wraps, which is a different decision.

The guard is the typed `flexShrink` field (it began life as a
`customProperties` entry, before flex-item fields existed — see
`docs/archive/2026-09-04-flex-controls-plan.md`). It is written to the file as
`flex-shrink: 0`, so the preview and any browser agree with the canvas;
it round-trips through `parseCode` like any other declaration; and the
Size panel shows it as the **Don't shrink** toggle in the flex-child
block, where it can be switched off.

The Size panel applies the same rule the other way round: typing a px
size into a flex child's main axis sets the guard, and switching that
axis to Fill / Hug / Auto clears it (`shrinkGuardPatch`). "The size you
gave it is the size you get" holds whether the size came from a drag or
from the keyboard. Only a guard Scamp set (`0`) is ever cleared; a
hand-written `flex-shrink: 0.5` is the user's.

Grid parents are excluded — a grid item is sized by its track and already
honours an explicit width.

**The trade-off, stated plainly:** these boxes no longer participate in
flex shrinking, so they will not narrow when their container does. That is
the correct default for a drawing tool and the wrong default for a
responsive layout. Untick **Don't shrink** (or set Shrink to 1) to
restore normal flex behaviour.

## The third half: measuring the parent, not asking the model

The clamp fix made the CSS right; `flex-shrink: 0` made it render right.
Both were still wrong for the container that actually prompted the report,
because `parentSizeOf` never measured anything:

```ts
return { w: el.widthValue, h: el.heightValue };
```

Those numbers only mean something when the axis is `fixed`. For `stretch`,
`fit-content` or `auto` they are the untouched fallback — 100 — with no
relation to the rendered box.

A real page made that concrete. `scamp-ui`'s start page has:

```css
.projects_a056 {
  width: 100%;      /* → stretch, widthValue stays 100 */
  height: 850px;    /* → fixed, heightValue is real   */
  display: flex;
  flex-direction: column;
}
```

So a rectangle drawn inside it clamped to `min(drawn, 100)` on the width
and `min(drawn, 850)` on the height. The file recorded
`width: 100px; height: 382px` — a real drag height beside a width that was
never anything but the default. Correct height, absurd width, in exactly
the containers a real design uses.

`parentSizeOf` now measures, falling back to the model only when the node
cannot be found. Note the same function already measured for the root, and
for `boundsFor` — this one branch was the odd one out.

Worth naming why three fixtures in a row missed it: every one gave the
parent an explicit pixel width, which makes `widthValue` accidentally
correct. A percentage-width parent is the common case in real projects and
was the one shape never tested. `test/e2e/canvas/draw-into-flex.spec.ts`
now has `stretch_col` for exactly this.

## Testing note

`test/e2e/canvas/draw-into-flex.spec.ts` covers both directions: a flex
parent keeps the drawn width, and a plain absolutely-positioned parent
still clamps. Two traps cost time writing it, both worth knowing for any
canvas spec:

- **The canvas renders unscaled and offset ~308px from the window's left
  edge**, so a frame-x much past 800 is outside the window and the mouse
  never lands. The drag silently does nothing and the failure looks like
  "no element was created".
- **A drawn width of exactly 100px is invisible in the CSS**, because 100
  is `DEFAULT_RECT_STYLES.widthValue` and the generator omits defaults.
  Assertions have to pick a number that is not a default, or they fail
  against correct behaviour.
- **Start the drag over empty space in the container.** Beginning it on
  top of a child resolves the insert parent to the root instead, and the
  spec then silently tests nothing — the CSS looks right because no flex
  parent was ever involved.
- **Assert the rendered box, not only the CSS.** Every CSS assertion in
  this spec passed while the canvas was visibly wrong. Only
  `getBoundingClientRect().width` caught it.

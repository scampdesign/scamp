# Narrowing a text element keeps the height I set

Status: **done**, 2026-10-14. Built and manually tested.

Story: "Narrowing a text element keeps the height I set", the next bug
in `docs/backlog-open.md`.

> While trying to reduce the width for text element its affecting the
> height. (getting back to default height)

## Reproduced

The test page has one text element, absolutely positioned, whose width
and height hug its content: `width: fit-content; height: fit-content;
font-size: 40px`. It renders about 380 × 48.

1. Click the text element.
2. Drag its right-edge handle 60px to the left.

**Expected:** about 320px wide. The height still hugs the text and grows
as the text wraps.

**Got:** `width: 40px; height: 100px`, both fixed. The box collapses and
the height jumps to a number the user never set.

The panel isn't the cause. Typing a width into **W**
(`SizeSection` → `lockedSizePatch`) writes only the width fields, and
the height mode is left alone. When the height hugs the text, a
narrower width makes the text wrap and the box grow taller. That's
correct, and it's the case the third "done when" line is about.

## Why

Two things in the canvas resize (`useResizeInteraction.ts` and
`resizeElement` in `store/canvas/slices/elementsEdit.ts`) cause it.

1. **The drag starts from stored numbers, not the element's real
   size.** `tryStart` records `originW = el.widthValue` and
   `originH = el.heightValue`.
   - For an axis that hugs, fills, or is auto, those fields aren't the
     size on screen. They hold a fallback: 120 × 24 for a text element
     drawn in Scamp, or 100 for one parsed from a file.
   - So the drag starts from the wrong width: 100 − 60 clamps to the
     40px minimum.
   - And the untouched axis is set to its fallback height. That's the
     "default height" in the user's note.
2. **Every handle fixes both axes.** `resizeElement` writes
   `widthMode: 'fixed'` and `heightMode: 'fixed'` whichever handle is
   dragged. A side handle should only change its own axis.

The ratio lock already does the first part right. `toggleRatioLock`
(`slices/ui.ts`) uses the measured size for any axis that isn't fixed.
The resize just never did the same.

A related problem: the drag's starting position and size come from the
element's base values, not its values at the active breakpoint. The
resize itself writes into the breakpoint's override, so at Tablet a drag
starts from the desktop numbers. I'll fix that in the same change,
since it's the same three lines.

## The fix

### 1. Start from the size on screen

In `tryStart`, read the element at the active breakpoint and state
(`resolveElementAtState`, as the panel does).

- For each axis whose mode isn't `fixed`, take the size from
  `geometry.measureElementInFrame(id)`. It already returns canvas units,
  so zoom doesn't matter.
- For a fixed axis, use the stored value.
- The starting x and y also come from the element at the active
  breakpoint.

### 2. Change only the axes the handle moves

`resizeElement(id, x, y, width, height)` becomes
`resizeElement(id, box, axes)`, where `axes` is `{ width: boolean;
height: boolean }`:

| Handle | Width | Height |
|---|---|---|
| `e`, `w` | fixed, new value | unchanged (mode and value) |
| `n`, `s` | unchanged | fixed, new value |
| corners | fixed | fixed |

- `x` is written only when a `w` handle (or a `w` corner) moves it, and
  `y` only for `n` handles.
- For a flex or grid child, x and y aren't written at all; they never
  meant anything there.
- The ratio-locked path is unchanged, since it's corner-only and fixes
  both axes on purpose.

`resizeElement` has one caller (`useResizeInteraction.ts`), so the
signature change stays contained.

### 3. The panel shows a hugging height for what it is

Already true. With a height that hugs, the **H** field shows the
measured height dimmed and in italics (`computed`), and the size-type
menu shows the **Hug** icon.

I'll check it by hand after the fix. The only addition I'd make is a
tooltip on a computed field: "Hug — grows with the content. Type a
number to fix it."

## Tests

### Unit tests

The resize store test (`test/` next to the other `resizeElement`
cases, or a new `resizeAxes.test.ts`) covers:

- An `e` resize fixes the width and leaves a `fit-content` height's mode
  and value alone.
- An `s` resize does the opposite.
- A corner resize fixes both.
- A `w` resize moves x; an `e` resize leaves it alone.
- At the tablet breakpoint, each case writes into the override and
  leaves the base untouched.

### End to end

New `test/e2e/canvas/resize-text.spec.ts`, with the reproduction above
as the fixture:

1. **The bug.** Drag the right handle of a hug text element 60px left.
   - The width is the starting width minus 60, within 1px.
   - The CSS has no `height:` other than `fit-content`.
   - The box got taller, because the text wrapped.

   This test fails on today's code.
2. **A fixed height stays.** Give the text `height: 80px`, drag the
   right handle, and check the CSS still says `height: 80px`.
3. **A corner still fixes both.** Drag the bottom-right corner, and
   check both axes are fixed px.

Also run the existing resize, ratio-lock, and size specs that the
signature change touches: `ratio-lock.spec.ts`, `size-controls.spec.ts`,
and any spec that drags a handle.

## Not in scope

- Turning on text auto-width (Figma's "auto width" mode) while dragging.
- Resizing several elements at once. Handles still show for one element
  only.

## Question for you

Should a corner drag on a text element fix the height?

- Figma does: a corner gives the text box a fixed size.
- The alternative: corners fix the width only and leave the height
  hugging, so text can never overflow its box.

I've planned Figma's behaviour. Say if you'd rather the height keep
hugging. lets follow how figma does it 

## What was built

As planned, with Figma's corner behaviour.

- **Which axes a handle moves.** `lib/resizeAxes.ts` (`axesForHandle`)
  answers this.
- **`resizeElement` takes an optional `axes`.** With no axes it changes
  everything, as before, so other callers and tests are unchanged. A
  side handle no longer writes x or y, so dragging the right edge keeps a
  position kept as raw CSS (`left: 50%`).
- **The drag starts from the size on screen.** `useResizeInteraction`
  starts from the element at the active breakpoint, and from its measured
  size on any axis that isn't fixed.
- **Tooltip.** A hugging height's tooltip says it grows as the text wraps.

Tests: `test/resizeAxes.test.ts` (9) and
`test/e2e/canvas/resize-text.spec.ts` (3). The existing specs that drag
a handle or edit size pass: select-move-resize, draw-rect,
layers selection, overflow clip, ratio-lock, size-controls, and
multi-select.

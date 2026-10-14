# Drag a component instance on the canvas

Status: **done**, 2026-10-14. Built and manually tested.

Story: "Drag a component instance on the canvas", the next bug in
`docs/backlog-open.md`.

> After adding components to the screen it's not working for drag
> option using trackpad. It's getting deselected from the item while
> trying to use mouse or trackpad. It will be able to move using
> keyboard shortcut and select option available only from Layers Panel

## Reproduced

The setup is the `Card` component from
`components/instance-selection-border.spec.ts`: a 200 × 120 root with a
200 × 120 child.

1. Drag `Card` onto a page. The selection border draws around the card,
   200 × 120.
2. Click the middle of the card.

**Got:** the page root is selected. The border jumps to 1440 × 900, and
dragging from there doesn't move the card.

The instance's wrapper `<div>` measures **0 × 0**. The card is drawn,
but nothing on the canvas that can be clicked is where the card is.

## Why

- **How a click finds its element.** It's a DOM hit test:
  `hitTest` in `canvas/interactions/canvasHitTest.ts` calls
  `document.elementsFromPoint` and takes the first node with a
  `data-element-id`.
- **The wrapper has the id; the card doesn't.** An instance renders as
  a wrapper `<div data-element-id="…">`, with the component's own
  elements inside it. Those inner nodes carry only `data-scamp-id`, and
  the block that holds them has `pointer-events: none`
  (`ElementRenderer.tsx`, the component-instance branch).
- **So only the wrapper's own box can be hit.** `elementsFromPoint`
  skips anything with `pointer-events: none`. When the wrapper has no
  size, the hit test finds the page behind the card.
- **When the wrapper has no size.** This happens whenever the
  component's content doesn't give the wrapper one. Absolute
  positioning does it. So does a root that resolves to a size the
  wrapper doesn't take on: here, the root's fixed size sits inside the
  inner block, which is itself `height: 100%` of a content-sized
  wrapper.
- **Why the rest of the app copes.** The selection border already
  measures the instance from its drawn contents
  (`measureElementInFrame`, the `scampInstanceId` fallback), which is
  why the border looks right. Keyboard and layers-panel selection never
  hit-test, so they work too.

The `pointer-events: none` isn't doing anything else any more. The
interaction layer covers the whole frame and takes every pointer event
(`CanvasInteractionLayer`, `pointer-events: auto`). Page elements never
receive a press, a hover, or a native image drag. The only thing the
rule changes is what `elementsFromPoint` can see.

## The fix

Two small changes, so a click on anything an instance draws resolves to
the instance.

1. **Let the hit test see an instance's contents.** Remove
   `pointerEvents: 'none'` from the inner block in the
   component-instance branch of `ElementRenderer.tsx`.
   - Prop text and slot boxes already turn pointer events back on
     inside it, and keep working.
   - While a text element is being edited, the interaction layer turns
     itself off, so clicks then reach the canvas DOM. A click on an
     instance's contents then bubbles to the wrapper's own `onClick` and
     selects the instance, which is the right answer there too.
2. **Resolve a hit to its nearest element.** In `hitTest` and
   `instanceAt`, take each node under the pointer and look up its nearest
   ancestor with a `data-element-id` (`node.closest('[data-element-id]')`).
   - For a node inside an instance, that's the instance's wrapper.
   - For any other page node it's the node itself, so nothing else
     changes.
   - Nodes outside the page tree, like canvas chrome, have no such
     ancestor and are skipped, as today.

`slotZoneAt` and `propTextHitTest` keep walking the raw node list.
Their answers don't change: an inner node with no slot or prop
attributes is skipped, exactly as before.

### What this changes elsewhere

`hitTest` also picks the parent for the draw tool, image drops, and the
right-click menu.

- **Over an instance's contents**, those now see the instance. That's
  what they already see over an instance whose wrapper has a size, so
  the behaviour becomes consistent rather than new.
- **Slot content** is page content with its own `data-element-id`. It's
  drawn above the component's elements, so it's hit first and stays
  selectable and draggable on its own.
- **A component element over a page element** now selects the instance
  rather than the page element behind it. That's the one that's
  visible.

## Tests

`canvasHitTest.ts` is DOM-only (`elementsFromPoint` isn't implemented in
jsdom), so the coverage is end to end.

New `test/e2e/components/instance-hit-test.spec.ts`, with the `Card`
component above:

1. **Click selects.** Place the card, click empty canvas, then click the
   middle of the card. The selection border is the card's 200 × 120, not
   the page's.

   This test fails on today's code, as reproduced.
2. **Drag moves.** Press on the card's middle and drag 80 × 40. The
   card's `left` and `top` in the page CSS move by 80 and 40, adjusted
   for the canvas zoom.
3. **Double-click opens the component.** Double-click the card's middle;
   the component editor opens.
4. **Slot content still selects itself.** This uses a component with a
   `children` slot holding a page rectangle. Clicking the rectangle
   selects the rectangle, not the instance.

Trackpad taps and click-drags arrive as the same pointer events as a
mouse, so the mouse tests cover them. Check a trackpad by hand.

Also run the existing component and canvas specs that hit-test:
- `components/instance-selection-border`, `open-instance-editor`,
  `drop-into-container`
- the slot specs
- `parity/instance-isolation`
- `canvas/select-move-resize`, `drag-reparent`

## Not in scope

- **Giving the wrapper a real size.** That's the other option in the
  story. It's a layout change with a parity cost: the generated page
  has no wrapper, and `docs/notes/components-data-model.md` explains why
  the wrapper stays layout-neutral. Hit-testing through the contents
  fixes the bug without moving any pixels.

## What was built

As planned.

- **The hit test.** `canvasHitTest.ts` resolves each node under the
  pointer to its nearest ancestor with a `data-element-id`
  (`owningElementId`). `hitTest` and `instanceAt` both use it.
- **The renderer.** The instance's inner block in `ElementRenderer.tsx`
  no longer sets `pointer-events: none`.

Tests: `test/e2e/components/instance-hit-test.spec.ts` (4 tests), using
a component whose wrapper the test checks is 0 × 0. In the slot test,
the rectangle drawn into the slot doesn't render where the pointer
drew it. Placing drawn slot content is a separate matter, so the test
clicks the content where it renders.

The existing specs pass:
- the component specs: instance selection, open editor, drop into
  container, slots, inline prop text, instance panel, instance
  breakpoint size, editor matches instance, group inside component
- `parity/instance-isolation`
- `canvas/select-move-resize`, `drag-reparent`

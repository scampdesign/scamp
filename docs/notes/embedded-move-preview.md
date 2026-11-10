# Embedded move preview: stand-in copies

A move in Embedded Scamp shows on the page as it will look once the agent
writes it, in any layout: block flow, flex, grid, or into another parent.

## How

- **The original is hidden, a copy goes where it lands.** `applyMove`
  (in `installInspector`, `src/shared/embedded.ts`) sets `display: none`
  on the element, tagged so undo restores it, and inserts `standIn(el)`, a
  `cloneNode(true)` marked `data-scamp-ghost` with its ids removed, before,
  after, or inside the target. The page lays out around the copy.
- **React's nodes never move.** Moving the real element, as DevTools does,
  breaks React's next commit to that parent (its `insertBefore` and
  `removeChild` calls expect the node where React left it). A copy is an
  extra node React doesn't know about; React's own calls still find theirs.
- **Clicks on a copy mean the original.** `originalOf` maps a node in a
  copy to the same child-index path in the original, so selecting,
  dragging again, and hover outlines work; `shownOf` maps back for drawing
  the outlines on the copy. `isOverlay` treats copies as Scamp's, so the
  tree, `kidsOf`, and `sameSource` skip them.
- **Dragging previews live.** When a drag starts, the siblings' boxes are
  recorded and the element is lifted out; each new drop spot moves one
  copy there. Drop spots come from the recorded boxes, not live hit
  testing, because the copy moving the layout under the pointer would
  otherwise make the target flip back and forth.
- **Moving again** replaces the copy; `prev` keeps the last one so undo puts
  it back.

## When the copy goes

- **Undo, or removing the queue item:** `undoTag` drops it and restores the
  original's display.
- **The agent's run ends:** `clear` removes every copy; the page shows the
  real code.
- **React changes a parent a copy sits in, or the original's parent:**
  `retireGhosts`, from the inspector's `MutationObserver`. That's the hot
  reload after the agent writes the move, and it can come before the run
  ends; without this the element would show twice. Copies and Scamp's
  overlays are ignored, so the preview's own insertions don't count. This
  works for Next.js too, since it doesn't rely on the Vite plugin.

## What a drag moves, and lists

- **Only children the page shows count as siblings.** A closed `<details>`
  keeps its content laid out but hidden with `content-visibility`, so
  `shownKids` uses `checkVisibility()`, not client rects. Its summary then
  lifts to the `<details>`. **Select parent** in the Style tab reaches an
  element no click can, such as a `<details>` its summary covers.
- **A move among items of one `.map()`** (`fromList`) asks main where the
  list comes from (`listOrigin.ts`): the element's own JSX first, then where
  its component is used. An array literal in the file, in the component, or
  in an imported module (relative or through tsconfig `paths`) is
  `written`, and the prompt names where. State, props, and computed values
  are `data`: the window takes the preview back and shows the reason, and
  nothing is queued.

## Limits

- A copy is a picture of the element: no event handlers, and a `<canvas>`
  inside it is blank.
- Selectors that count siblings (`:nth-child`, `+`, `~`) still count the
  hidden original.
- Double-clicking text in a moved element opens the editor over the hidden
  original, so it isn't placed; edit text before moving, or after the agent
  writes it.

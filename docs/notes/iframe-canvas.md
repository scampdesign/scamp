# The iframe canvas

The canvas draws the open page the way the preview does: as the HTML
export of the element model (`generateHtml` with `editorIds: true`) and the
page's generated CSS, inside a same-origin iframe (`IframeCanvas.tsx`). A
real document means real `@media`, `:hover`, `vh` and `vw`, and no app
styles leaking in. Decided and planned in
`docs/plans/canvas-rendering-options.md`.

For one release the legacy canvas (`ElementRenderer` drawing into the app's
own document) stays as a fallback: `__scampIframeCanvas.set(false)` in the
developer tools, remembered under `scamp.legacyCanvas`. `SCAMP_E2E_LEGACY_CANVAS=1`
runs the e2e suite on it. Both go when the legacy path is deleted.

## One seam: `canvasDom.ts`

The interaction layer (selection, draw, move, resize, drops) and the panels
that read the canvas DOM are the same code on both canvases. They reach the
drawn page only through `canvasDom.ts`: hit tests at a client point, node
lookups by element id, the iframe's window for text selection. The iframe
that draws the editable page registers itself there; the chrome (handles,
overlay, drop lines) always stays in the app's document, over the iframe.

- Nodes from the iframe belong to its own window: `instanceof HTMLElement`
  is false for them. Use `isHtmlNode` / `hasDataset`.
- Geometry walks the offset chain out through the iframe (`offsetIn`), and
  a rect from inside it is mapped to client space with `clientRectOf`. The
  iframe can sit anywhere in the frame (a variant set's live frame).
- A click inside the iframe but on no element selects the root, as the
  canvas's floor does on the legacy canvas.

## Updates: build once, patch in place

The iframe document is created once (`srcdoc` shell) and then patched: the
page CSS replaces one `<style>`'s text, and the markup is applied with
`morphDom`, matched by position. A style-only edit doesn't patch the DOM at
all. The patch drops attributes the markup doesn't have, so everything the
editor adds to the page is put back after each patch:

- **Marks**: `data-scamp-selected`, `data-scamp-editing`,
  `data-scamp-prop-edit`, drawn by an editor `<style data-sheet="chrome">`
  in the app's accent and component colours. Every capture of the page
  strips them (`EDITOR_MARKS`): thumbnails, PNG and SVG export.
- **The root floor**: the root gets `min-height` inline, as the legacy
  canvas does, so a short page or view still fills the canvas (900px, or
  the artboard in the component editor). Never written to the file; the
  parser strips a view root's `100vh`. Not on a variant frame, nor on a
  fixed-height component root.
- **Variant values**: a variant frame's root gets `data-<axis>` for its key.

## Viewport rules

- `vh` follows the iframe's height, and the iframe is as tall as the page,
  so `vh` and `vw` are rewritten to `--scamp-vh` / `--scamp-vw`, pinned to
  the page's viewport height and the canvas width.
- With clipping off, the iframe widens to show what runs past the canvas.
  The page still lays out at the canvas width: `<html>` and `--scamp-vw`
  are pinned to it, and `@media` is resolved for it (`mediaForViewport`)
  while widened. Animated elements are measured where they rest, or an
  animation mid-move would widen the iframe.
- In the component editor `@media` follows the breakpoint picked, as before.
- The iframe never scrolls (`html { overflow: hidden }`).

## The component editor

The artboard is one iframe. A variant set is one iframe per frame; only the
live frame registers with `canvasDom`, so the others are only looked at,
and a click on one makes it live (`inactiveVariantCellAt` looks inside the
iframe under the pointer). Frames hug the component by measuring what they
draw.

## Keys, text and focus

- The app's shortcuts listen on its own window, and keys pressed while the
  iframe has focus never reach it. The iframe passes keydown / keyup on to
  the app, except while something in the page is being typed into.
- Text editing happens in the iframe: `contenteditable` on the node, all
  text selected on entry, committed on blur. An instance's prop text edits
  the same way, Enter commits, Escape restores.

## Captures

Thumbnails rasterise a copy of the iframe's document (`canvasSnapshotHtml`,
without the marks) in an off-screen iframe: its nodes need its own
stylesheets, so a clone in the app's document can't draw them. The page PNG
export captures the iframe's body.

## Tests

- e2e runs on the iframe canvas. Locate drawn nodes with `canvasElement`,
  `canvasLocator`, `canvasContent` or `inVariantCell`; code that runs in
  the page reads `iframe.contentDocument`, never `document`.
- The parity harness measures inside the iframe (see `parity-harness.md`);
  `iframe-c1.spec.ts` checks it against the browser drawing the saved file.
- `SCAMP_E2E_SPEED=1` runs `iframe-c1-speed.spec.ts`, which prints edit-to-
  paint timings for both canvases.

# Exporting an element: its placement stays on the page

The Export section rasterises with `html-to-image`
(`src/renderer/src/lib/exportCapture.ts`). It clones the node and copies
each node's **computed** styles onto the clone, then draws the clone
inside an SVG `foreignObject` the size of the element.

That copies the exported element's *placement* as well as its look. An
element at `position: absolute; left: 40px; top: 40px` arrives as
`position: absolute; inset: 40px 1210px 724px 40px`. Inside a
`foreignObject` 189px wide, that puts the element 40px in from the
top-left and pinches it to nothing from the right. The result is
shifted and clipped, which looks like missing padding and wrong type,
though both were copied correctly.

`CAPTURE_ROOT_STYLE` is laid over the root of every capture
(`html-to-image`'s `style` option touches only the root): `position:
static`, `inset: auto`, `margin: 0`, `translate: none`. The element
then draws at the image's origin, at its own size. Its transform is
already handled separately (`withTransformReset` on the frame).

`captureIsolatedPng`, the thumbnail path, captures the frame rather
than an element. It already sets `position: static` on its clone.

Test: `test/e2e/export/element-position.spec.ts`. It decodes the
exported PNG and checks that the padding corners are the card's color,
and that the heading's red text spans a 48px band.

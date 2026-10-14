# Canvas extent oscillation

The canvas sizes itself from its own contents, and the result feeds back into the measurement. That loop is fine as long as every step is stable, but two things made it oscillate forever — visible as the canvas jittering continuously after placing an element exactly as wide as the frame (a component instance whose root is `width: 100%` is the easy way to hit it).

## The loop

```
measureFrame()  →  content.right  →  fitWidth  →  fitScale  →  scale
      ↑                                                          ↓
      └──────  container clientWidth  ←  scrollbar  ←  shellWidth/Height
```

`Viewport` measures the rightmost/bottommost rendered edge, feeds it into fit-to-width zoom, and multiplies the result back into the `frameShell` size — which is what makes the artboard scroll.

## Two fixes, both needed

**1. Sub-pixel wobble in the measurement.** `measureFrame` computes the extent as `(rect.right - frameRect.left) / appliedScale`. At a fractional zoom, an element exactly as wide as the frame lands a hair either side of it, and `Math.round` turned that into `frameW` on one pass and `frameW + 1` on the next. Since `fitWidth = Math.max(frameW, content.right)`, that 1px flip changes the zoom.

`settleExtent` (`lib/canvasOverflow.ts`) snaps anything within `CONTENT_EXTENT_TOLERANCE_PX` of the frame box onto the frame box exactly. Real overflow (beyond the tolerance) rounds up, so the boundary indicator never under-reports. `measureFrame` also bails out of `setContent` when the value is unchanged — the extent drives the zoom, so a no-op re-render is a full lap around the sizing loop.

The same trap is documented for the component-canvas hug in `../archive/2026-07-17-component-canvas-sizing-plan.md`, which is why `measureContentSize` uses `offsetLeft/offsetWidth` chains instead of dividing client rects by the scale.

**2. The scrollbar.** `.artboardScroll` was `overflow: auto` with no reserved gutter. A vertical scrollbar appearing shrinks `clientWidth`, which shrinks `fitScale`, which shrinks `shellHeight`, which removes the scrollbar, which grows `clientWidth` — forever. `scrollbar-gutter: stable` takes the scrollbar out of the loop entirely.

Fix 1 stops the canvas from entering the oscillation; fix 2 stops it from being able to sustain one. Anything that later derives layout from `clientWidth` on a scroll container whose contents it also sizes needs the same gutter treatment.


## Second cause: animated elements (found in a real project)

`settleExtent` handles sub-pixel wobble. It cannot handle an element that
is genuinely moving.

A page with `animation: glow-drift 18s ease-in-out infinite` on a
full-width hero glow, translating 60px and scaling 1.08, made the canvas
flip between two zoom levels on **every edit**. The extent is measured from
bounding boxes, a bounding box includes the current transform, and the
measurement therefore samples whatever frame the animation is on.

Measured in Electron's Chromium, frame width 1440, one animated child:

| animation time | via client rect / scale | via layout box |
|---|---|---|
| 0ms | 1440 | 1440 |
| 3000ms | 1467.4 | 1440 |
| 6000ms | 1530.6 | 1440 |
| 9000ms | 1557.6 | 1440 |

The extent fed `fitWidth = max(frameW, content.right)`, so the fit zoom
alternated between `802/1440 = 55.7%` and `802/1474 = 54.4%`, and the
overflow indicator appeared and vanished with it. The user's report was
"changing a text colour changes the zoom" — the colour was incidental, any
edit re-measures.

The fix is in `src/renderer/src/canvas/animatedExtent.ts`: elements with a
running animation (and their descendants, since an ancestor transform moves
them too) are measured by their transform-free layout box —
`offsetLeft`/`offsetWidth` up the offset chain. Everything else keeps the
client-rect path.

Deliberately NOT skipping animated elements: one parked past the right edge
is genuinely overflowing and the user needs to see that. Its resting layout
position is the honest answer; the frame it happens to be on is not.

## Tracing

`localStorage.setItem('scamp.debugZoom', '1')` and reload logs each extent
measurement with the scale it was taken at, the raw and settled right
edge, and — the part that identified this — the `data-element-id` of the
element setting the widest edge. Also logs the fit calculation. Left in
because the loop is only observable in a running canvas with a real
project in it.

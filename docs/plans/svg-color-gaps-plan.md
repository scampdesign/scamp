# SVG colors: put the controls where people look

Backlog: `docs/backlog-11.md` story #6.

> SVG items color change (not working or need to know how to change it)

## Decision

The SVG color and stroke controls already exist (they shipped with
`svg-color-editing-plan.md`). They were in the **SVG** section near the
bottom of the visual panel, below Background, Border, Shadows, Filters,
and Transform, so someone recoloring an icon found the box's background
color first and never reached them.

The **SVG** section now sits directly above Background when an SVG is
selected (`UiPanel.tsx`), so an icon's own colors and stroke width are the
first color controls you see. `test/e2e/canvas/svg-paste.spec.ts` pins
the order.

The section also reads paint written on the `<svg>` tag itself
(`stroke="currentColor"`, as Lucide, Tabler, Feather and agents write
icons), which used to show "No editable colours". A concrete color there
gets a swatch that rewrites the attribute; `currentColor` turns on
**Current color**, which sets the element's CSS `color` and leaves the
markup alone. Unset, that swatch shows the color the icon inherits, read
from the canvas, marked **Inherited**.
`test/e2e/canvas/svg-tag-paint.spec.ts`.

## Possible follow-ups, if the move isn't enough

Found while investigating (2026-10-12), not planned:

- Paint in a JSX `style={{ fill: … }}` object, or from CSS classes,
  isn't found.
- SVGs placed as `<img>` files have no color controls.
- Icons inside a component instance can't be selected on the page.

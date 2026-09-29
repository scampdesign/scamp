# An imported gradient icon renders black

## What was seen

gainwix.com's wordmark is a green-to-purple gradient. Imported, it
rendered **solid black** — on the canvas AND in the HTML export, so not a
canvas bug.

The generated JSX looked perfect. Everything was there:

```jsx
<defs>
  <linearGradient id="gwGrad" x1="46" y1="18" x2="156" y2="18" gradientUnits="userSpaceOnUse">
    <stop stopColor="#0ACD95"></stop>
    <stop offset="1" stopColor="#6940F2"></stop>
  </linearGradient>
</defs>
<g fill="url(#gwGrad)">…</g>
```

## Why

`stopColor` is React's spelling, and nothing that renders this markup is
React. The canvas injects it as HTML; `buildHtmlExport` writes it into an
HTML document. **An HTML parser lowercases attribute names**, so
`stopColor` becomes `stopcolor`, which is not a property — the stops have
no colour, and a gradient whose stops have no colour is black.

Measured, same markup, one attribute changed:

| attribute | parsed as | computed `stop-color` | renders |
|---|---|---|---|
| `stop-color` | `stop-color` | `rgb(10, 205, 149)` | the gradient |
| `stopColor` | `stopcolor` | `rgb(0, 0, 0)` | **black** |

Tag names survive — an HTML parser has a fix-up table that restores
`linearGradient` inside `<svg>` — which is why the markup *looks* right
and only the paint is wrong. That is what made it hard to see.

`svgSourceToJsx` is not wrong to camelCase: the TSX it feeds is read by
React. The mistake is that the same string is then rendered twice more by
things that are not React.

## The fix

An SVG that works by internal reference is written to a **file** and
referenced as an image. A `.svg` file is read by the real SVG parser: no
case folding, no JSX spelling, and no ids shared with every other icon on
the page. Gradients, filters, masks and clip paths simply work, because
nothing rewrote them.

`needsFileTreatment` decides, on the presence of `defs`,
`linearGradient`, `radialGradient`, `filter`, `mask`, `clipPath`,
`pattern`, `use`, `symbol`, `style` or `foreignObject`.

The file goes through the same path a downloaded image does —
`fetchImportImage` now accepts a `data:` URL, so one pipeline handles
temp file, `copyImage`, the project's assets folder and the reference
path. It is named from the SVG's `<title>` where there is one, because
that is the only human name an icon has: gainwix's wordmark lands as
`gainwix.svg` rather than `icon_0005.svg`.

## Why not every SVG

**An `<img>` cannot inherit `currentColor`.** An icon painted with the
text colour around it becomes a flat picture the moment it is a file, and
the capture deliberately keeps `currentColor` as written for exactly that
case (see [`svg-recolor.md`](svg-recolor.md)).

So a plain icon — a few paths and a fill — stays inline, where it round
trips fine and stays recolourable. Only the ones that cannot survive
inlining become files. The import report grades those
`rendered-fallback` and says so, because a file IS a loss of editability
even though it is a gain in fidelity.

## Verified

The wordmark's captured markup, run through `svgDocument`, written to a
file and rendered as an `<img>`: green at the left, purple at the right,
matching the page. Inline, the same markup is black.

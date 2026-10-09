# The canvas/preview parity harness

`test/e2e/parity/` renders the same page two ways and compares the
geometry of every element. It exists because canvas/preview divergence
kept being found by users rather than by us.

## How it works

Each fixture carries three things: the `tsx` and `css` a page would have
on disk, and the same markup written out as plain `html`.

- **Canvas side** — the TSX/CSS are pre-seeded into the test project, the
  app opens, and every `[data-scamp-id]` is measured.
- **Browser side** — the HTML is rendered against the identical CSS in
  Chromium, and every `[class]` is measured.

Both are measured relative to the page root and normalised out of the
canvas zoom, then compared field by field (x, y, w, h) with a 1px
tolerance.

## Two deliberate choices

**The oracle imports nothing from `src/`.** The browser side is
hand-written HTML wrapped in a document by the harness. An oracle that
shares code with the thing it checks can agree with it while both are
wrong — using the HTML exporter here would have meant an exporter bug
could hide a canvas bug. A consistency test asserts the `tsx` and `html`
of each fixture name the same elements, so they can't drift apart.

**The document includes the project's `theme.css`.** `app/layout.tsx`
imports it before the page's own module, and it carries the universal
`box-sizing: border-box` reset and the block-margin reset (whose comment
reads "keep canvas and preview in sync"). Leaving it out made the first
run report three divergences that were entirely artefacts of the missing
reset — padding off by exactly `2 × padding`, and `<p>` off by exactly
the browser's default margin.

That near-miss is the reason to state the rule: **the browser side must
be set up the way the real preview is**, or the harness invents bugs.

## Known gaps

A fixture with `knownGap` is asserted to FAIL, via `test.fail()`. The
suite stays green while the divergence is recorded, and the moment
someone fixes it the test flips to failing and has to be updated.

**None are recorded today.** `component-root-fills-grid-row` came from a
user, not the harness: an instance's inner wrapper was content-sized, so a
component root's `height: 100%` stopped there instead of reaching the grid
row (fixed by passing the wrapper's height through). All three the harness
found on its first run are fixed: the `align-items` default
([note](align-items-default.md)), the grid `gap` shorthand
([note](grid-gap-shorthand.md)), and `::before` / custom selectors, which
closed when the canvas started loading the page's own stylesheet
([note](canvas-injected-stylesheet.md)).

## Fixtures must not depend on text metrics

The canvas runs in Electron's Chromium and the oracle in a standalone
Chromium build. They resolve `system-ui` slightly differently, so the
intrinsic width of a text run differs by a few pixels between them — a
fixture with `width: fit-content` on a `<p>` reported a 3.2px divergence
that was pure font resolution.

Give text elements an explicit size. Testing text metrics across two
browser instances isn't meaningful; testing the box they sit in is.

## Regenerate the shims before running it

**Regenerate the shims before running the harness.** `tsconfig.web.json`
includes `test/**`, so these specs get committed `.js` siblings like
everything else, and Playwright imports the `.js`. Editing a fixture
without `npx tsc --build tsconfig.web.json --force` runs the previous
version — which shows up as stale test titles and results that don't
match the source.

## Paint comparison

Geometry says the boxes are in the right places and nothing about what is
painted in them. Colour, gradients, shadows, radii and blend modes all
produce identical geometry, so the bug behind
[canvas-gradient-backgrounds.md](canvas-gradient-backgrounds.md) would
have passed the geometry check without a murmur.

A fixture with `pixels: true` also screenshots the page root on both
sides and compares them. Two things make a naive diff useless, so neither
is attempted: the canvas renders inside a transformed frame (its
screenshot is at the zoom factor, the browser's at 1), and the two
Chromium builds resolve `system-ui` differently. Both are handled by
normalising the images to a common width and comparing with a per-channel
tolerance, failing when more than 2% of pixels differ.

That is deliberately blunt. It answers "is this block the wrong colour,
is this gradient missing" and not "is this edge antialiased identically",
which is the question worth asking of a design tool. Paint fixtures must
avoid text for the font reason above.

**Chrome has to be hidden first.** `locator.screenshot()` captures
whatever is painted over the element's box, so the canvas toolbar and the
shortcuts panel landed in the first capture and accounted for the entire
5.4% difference. `hideCanvasChrome` hides everything and re-shows only the
frame, then removes the canvas-only affordances inside it (selection
overlay, grid, handles).

### Validating a paint oracle is harder than it looks

Breaking the canvas's gradient handling did **not** make the paint test
fail — because the injected stylesheet supplies the gradient too, so the
canvas still rendered it correctly. That is the architecture working, but
it means the obvious mutation proves nothing. The oracle was validated by
breaking *both* paths at once, which produced a 4.3% difference.

### Paint fixtures must fit the visible canvas

`locator.screenshot()` of the canvas root captures only what is painted.
The root is as wide as the artboard, but the canvas viewport is narrower
(sidebars), so anything past that edge is simply absent from the capture —
the first five-box fixture lost its fifth box and reported a difference
that was pure clipping. Keep painted content inside roughly 800px, or
wrap it.

## What it still does not catch

Anything only visible in motion (transitions, animation timing) and
anything behind an interaction (`:hover`). Geometry is still where the
structural divergences have been
and is far less brittle.

## Bumping Playwright invalidates the oracle browser

The oracle is Playwright's own Chromium, launched via `chromium.launch()`
with no `executablePath`. Playwright resolves that to one exact browser
revision pinned to the installed `@playwright/test` version, so **every
Playwright bump orphans the previously-downloaded Chromium** and all 17
comparison tests fail at once with:

```
No Chromium available for the parity harness. Run `npx playwright install chromium`.
```

Run that command; nothing else needs doing. The failure looks alarming
because it takes out the whole parity suite in one go, but it is purely
an installed-browsers problem and says nothing about the canvas. Note
that the `findChromium` fallback only looks for `chrome-linux64/chrome`,
so on macOS there is no second chance — `chromium.launch()` either works
or the suite fails.

## Adding a fixture

Every parity bug that gets fixed should leave a fixture behind. Write the
`tsx`, the matching `html`, and the `css`; if the canvas doesn't match
yet, add `knownGap` describing why rather than deleting the fixture.

see docs/plans/canvas-preview-parity-plan.md

# Rendering the canvas in an iframe — Plan

Status: **superseded** by [canvas-rendering-options.md](canvas-rendering-options.md),
which shipped the iframe canvas (2026-11-02). Phase D below is still to do.

## Why this, and why now

Two separate pieces of work have stalled on the same wall.

**Media queries.** The injected stylesheet's `@media` blocks were
evaluated against the Electron window rather than the canvas frame, so
they fired on a condition unrelated to the design. They had to be
stripped. ([note](../notes/canvas-injected-stylesheet.md))

**The phase-3 peel.** The canvas resolves each element at the active
breakpoint and renders it inline; the sheet, with `@media` gone, carries
only the desktop base. Remove a property from the inline layer and its
breakpoint-specific value vanishes from the canvas. That covers most
properties, so essentially nothing can be peeled.

Both are the same problem: **the canvas frame is a `div`, and a `div` is
not a viewport.** An iframe is.

The parity plan lists the iframe as scoping option 3 — "more correct,
much more work, shouldn't gate the parity win". That was right for
phase 2 and is wrong now: it is the prerequisite for phase 3.

## The premise is verified

Measured in the real app (Electron 31 / Chromium 126), a 390px iframe
inside a 1440px window:

| | |
|---|---|
| `iframe.contentWindow.innerWidth` | **390** |
| `@media (max-width: 700px)` | **fired** — follows the iframe |
| `@media (min-width: 1000px)` | **did not fire** — ignores the 1440px window |
| `getBoundingClientRect` from the parent | **worked** |
| `contentDocument` access | **worked** (same origin) |

The last two matter as much as the first: the parent can read geometry
and reach the DOM inside, which is what selection, hit-testing and the
parity harness all need.

A `transform: scale()` on an ancestor does not change the iframe's
viewport width — it scales the rendering. That is exactly the semantics
the artboard wants: a 390px design, displayed at 60% zoom, is still a
390px viewport.

---

## What this buys

- **Real `@media`**, so `breakpointCascade`'s re-derivation can go
- **Real `:hover` / `:focus`**, so state simulation can go
- **The phase-3 peel unblocks** — the whole inline translation layer
  becomes deletable, property by property, measured by the harness
- **Total style isolation**, so `@scope` and the app-chrome leak concerns
  disappear
- The canvas becomes what the preview is: a browser rendering the
  generated files

The end state is that `elementToStyle` shrinks to canvas-only
affordances, and everything else is the same CSS the preview loads.

## What has to cross the boundary

This is the actual work, and it is not small.

| Concern | Today | In an iframe |
|---|---|---|
| Selection outlines, resize handles, drop indicators | siblings of the elements, inside the frame | stay **outside**, in the parent, positioned from measured rects |
| Hit-testing (click to select) | DOM events in one document | events inside the iframe, forwarded with coordinates translated |
| Drag / resize | pointer events on the frame | pointer capture in the parent, coordinates mapped through the iframe's offset and the zoom scale |
| Live drag preview | inline style applied directly to the node | same, but reaching through `contentDocument` |
| Theme tokens | CSS custom properties on the frame | injected into the iframe document |
| Fonts | `fontFamily` mirrored onto the frame | the iframe must load the project's `theme.css`, `@import`s and all |
| Keyframes | a `<style>` in the frame | moves inside |
| Text editing | contentEditable on the node | contentEditable inside the iframe, events forwarded |

The overlays moving out is the good news: they stop polluting the canvas
DOM, which is what forced `hideCanvasChrome` in the paint harness.

## Decisions to make

### 1. How the document is delivered

`srcdoc` is simplest and same-origin. `document.write` worked in the
probe. A blob URL is a third option but complicates same-origin access.
**Lean `srcdoc`**, re-written on change — but see the flicker question.

### 2. How updates are applied

Rewriting the whole document on every keystroke would flicker and lose
scroll/selection state. The iframe document should be created **once per
target** and then mutated: React rendering into `contentDocument` via a
portal, and the stylesheet updated by replacing one `<style>` node's text.

React portals into an iframe are a known pattern; the caveat is that
React's synthetic events attach to the portal's host document, so event
wiring needs care.

### 3. Coordinate mapping

One function, used everywhere: iframe-local point → frame point → client
point, accounting for the iframe's offset and the zoom scale. Pure and
testable, and the single place a sign error can hide.

---

## Phases

**Phase A — spike, behind a flag.** Render the page into an iframe with
no interaction at all: no selection, no drag. Point the parity harness at
it and confirm geometry and paint still match, plus a new breakpoint
fixture that is impossible today. This answers the questions the probe
couldn't: fonts, theme variables, and whether anything about the
generated CSS misbehaves in a fresh document.

**Phase B — measurement and overlays.** Move selection outlines, handles
and indicators to the parent, driven by measured rects. Still no editing.

**Phase C — interaction.** Hit-testing, drag, resize, text editing.
The riskiest phase; every canvas e2e spec is the safety net.

**Phase D — delete the re-derivation.** `breakpointCascade` out of the
render path, state simulation out, then the inline property peel one
group at a time, each verified by geometry *and* paint.

Phase A is worth doing on its own even if B–D are deferred: it proves or
disproves the whole approach for a few days' work rather than a few
weeks'.

## Risks

- **This is the largest change proposed to Scamp.** Phases B and C touch
  every interaction the tool has.
- **Performance.** A per-target iframe plus React portal rendering is
  more machinery than a div. Unmeasured.
- **The harness must move with it.** `measure` reaches
  `[data-scamp-id]` in one document today; it needs to reach into the
  iframe. Cheap, but it must happen in phase A or the safety net is gone
  exactly when it is most needed.
- **Text editing across the boundary** has the most fiddly event
  behaviour and is the likeliest source of subtle regressions.
- **A flag doubles the code paths** for as long as it exists, and the two
  will drift. Phase A should be time-boxed and then committed to or
  abandoned.

## Open questions

1. **Is a flag worth it, or should phase A be a throwaway spike?** A
   branch that is never shipped costs nothing to delete. I lean throwaway
   spike, then a committed migration. sounds good
2. **How much interaction fidelity is negotiable in the interim?** If B
   and C take a while, is a canvas that renders perfectly but selects
   slightly differently acceptable to ship behind a flag? no I wont ship this until It is fully manually tested by me and feels as good or better than the current designing experience
3. **Should the iframe load the real files** (`file://` or a dev-server
   URL) rather than generated content? That would be maximal fidelity —
   literally the preview — but couples the canvas to the save pipeline
   and to Next's dev server. I dont think it should be coupled to the next server so its okay if the canvas loads a scamp generate version as long as it matches what the preview will be and the design experience is smooth and fast.
4. **What happens to the component editor?** It shares the canvas. One
   iframe per target, or one reused? one iframe per target.

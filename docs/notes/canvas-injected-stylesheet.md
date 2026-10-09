# The canvas loads the page's own stylesheet

`CanvasPageStylesheet` in `Viewport.tsx` mounts a `<style>` inside the
canvas frame containing the CSS `generateCode` would write to disk,
wrapped in `@scope`.

## Why

The canvas translates the element model into inline React styles. Two
consequences, both bad:

- every property is an independent chance to translate wrongly, which is
  where the parity bugs kept coming from
- some CSS has **no inline form at all**, so it never rendered —
  `::before` / `::after`, `:nth-child`, and any hand-written selector
  were parsed, preserved, written back to the file, and invisible on the
  canvas

The second is unfixable by improving the translator. The generated
stylesheet is the thing the preview already renders, so the canvas loads
it too.

## Additive, for now

Inline styles beat any selector, so this changes nothing about the
properties `elementToStyle` already sets — it only supplies what the
translation could never express. That makes this step safe to land on its
own: the parity harness went from one known gap to none, with no other
fixture moving.

Later phases move properties out of the inline layer so these rules take
over. Each removal is verifiable: if the stylesheet doesn't say the same
thing the inline style did, the harness fails.

## `@scope`, and its one wrinkle

`@scope ([data-scamp-canvas]) { … }` keeps the page's rules off Scamp's
own UI. A descendant prefix (`#canvas .rect_a1b2`) would work too but adds
specificity, and a rule that outranks its counterpart in the preview is a
new way to diverge.

`@scope` is not entirely cascade-neutral either: **scope proximity is
considered before source order**, so a scoped rule beats an unscoped one
of equal specificity regardless of position. Verified in Electron 31
(Chromium 126), along with `@scope` support itself and the fact that
scoped rules don't leak outside the frame. It only matters for rules
outside this sheet targeting the same page classes, which nothing does.

## Media queries become container queries

Width-based `@media` blocks are rewritten to `@container` before the sheet
is injected, and the canvas frame declares `container-type: inline-size`.
Verified in the running app: a 390px container inside a 1440px window
fires `@container (max-width: 500px)`, and the injected sheet contains the
rewritten rule.

This is a translation, and worth naming as one. It is a single lossless
rewrite of a prelude across the whole sheet, not a re-derivation of each
property, and the parity harness checks it — a different kind of risk from
the inline layer this work exists to remove.

Non-width queries are left as `@media`: `prefers-color-scheme` and
friends describe the real device and should keep answering for it.

**The rules apply but are currently masked.** Inline styles beat any
stylesheet rule, so a breakpoint's `width` loses to the `width`
`elementToStyle` writes. The mechanism is correct and inert until the
inline layer is peeled back — which is now safe to do, because the sheet
finally carries breakpoint rules that resolve against the artboard.

### Superseded: why they used to be stripped

A media query is evaluated against the **document viewport** — here, the
Electron window — while Scamp's breakpoints size the canvas *frame*. Set
the artboard to 390px in a maximised window and a `max-width: 700px` rule
does not fire; narrow the window on a 1440px artboard and it does. Both
are wrong, and neither has anything to do with the design.

The breakpoint cascade is already resolved against the frame width and
applied inline, which is the correct semantics, so stripping these loses
nothing that worked. What it does cost is breakpoint-specific rules that
inline styles cannot express — a `::before` inside a media query still
won't render on the canvas.

They were stripped because a media query is evaluated against the
DOCUMENT viewport — the Electron window — while Scamp's breakpoints size
the frame. An iframe was pursued to fix that, and it does, but the
interaction surface proved much larger than the parity plan estimated:
four cross-realm `instanceof` bugs, a measurement rewire, and a
state-timing seam. Container queries reach the same result in the same
document.

The one thing the iframe still does better is viewport units: `100vh`
here resolves against the app window, not the artboard. Container units
(`cqh`) would fix it but need `container-type: size`, which requires a
definite height the canvas frame does not have — measured, `100cqh`
returned the window's height. Scamp already accommodates the page root's
`min-height: 100vh` with a canvas-only floor, so this is an existing
accommodation rather than a new gap.

## Keyframes are excluded

`CanvasKeyframes` already injects them, and a non-style at-rule inside
`@scope` has no defined meaning — a browser that rejects it could drop
the entire scoped block and take every page rule with it. `stripKeyframes`
removes them before wrapping.

## Page elements carry their page class; instance internals carry a prefixed one

The page's `ElementRenderer` path appends `classNameFor(element)` to the
node's class list alongside Scamp's own canvas classes, so the injected
rules have something to match.

Instance internals cannot use the bare name. Inside an instance those are
the COMPONENT's class names, and both a component root and a page root
are called `root` — so a page `.root` rule would reach in and repaint it.
That was measured: a 120x60 card rendered 120x813, wearing the page
root's 40px padding and its `min-height: 100vh`.

So instance internals carry `inst_a024__root`, and the stylesheet carries
a matching prefixed copy of the component's rules — the same
`prefixCss` + `collectExpandedInstances` transform the HTML exporter
uses, so the two can't disagree about what a prefix looks like. This is
CSS Modules' job, done by hand for a canvas that has no module loader.

### `instanceId` is not the instance's class

`renderComponentSubtree` already threaded an `instanceId` for prop-edit
keying, and it is the raw canvas id (`a024`) — while `classNameFor` on an
instance yields `inst_a024`. Prefixing with the former produced
`a024__root` against a stylesheet saying `.inst_a024__root`, and nothing
matched. The instance's class is now threaded separately and explicitly,
because the two strings look similar enough to be confused again.

### Nested instances

They render as a placeholder on the canvas rather than being expanded, so
prefixes are only ever one level deep. `collectExpandedInstances` still
emits rules for nested ones; they simply go unused.

see docs/plans/canvas-preview-parity-plan.md

## Why the inline layer cannot be peeled back yet

The point of injecting the stylesheet is eventually to stop translating:
remove a property from `elementToStyle` and let the sheet supply it. That
is blocked, and by the same limitation as `@media` above.

The canvas resolves each element at the **active breakpoint**
(`resolveElementAtBreakpoint`) and renders the result inline. The injected
sheet has its `@media` blocks stripped, so it only ever carries the
desktop base. Remove `box-shadow` from the inline layer and a
breakpoint-specific shadow disappears from the canvas, because the only
thing that knew about it was the inline value.

So every property that can be breakpoint-overridden — which is most of
them — has to stay inline until the frame can evaluate media queries
itself. That means the iframe.

The order in the parity plan therefore wants revisiting: the iframe is
listed as an alternative scoping option, but it is really the
prerequisite for phase 3 rather than a nicety. Nothing meaningful can be
peeled without it.

## The component editor resolves media for a viewport

A component's frame is the component's own size (232px for an imported
sidebar), not a viewport. As container queries, every
`(max-width: 768px)` rule in its sheet fired in the editor while the
breakpoint said Desktop, and the inline styles, which follow the active
breakpoint, kept their desktop values. Half of each tablet rule applied:
labels offset by their tablet `left` / `top`, buttons centred.

The component editor has its own breakpoint control
(`CanvasSizeControl` in component mode): it sets the active breakpoint
without resizing the canvas. Entering the editor resets it to Desktop,
and a page or view gets back the breakpoint its canvas width matches
(`useActiveTarget`), so a component never shows a page's Tablet unasked.

So in the component editor `buildCanvasStylesheet` gets the active
breakpoint's width and `mediaForViewport` resolves each width-only block
for it: a block that matches is unwrapped, one that doesn't is dropped,
and a prelude it can't decide (`not`, `print`, `vw`) falls back to a
container query. Pages and views keep container queries: their frame is
the viewport.

# Bringing `<span>` into the canvas

## Why a span is different from a `<strong>`

Inline markup inside a text element is kept as verbatim JSX — a
fragment — rather than becoming boxes, because making a flex item of
every word-run destroys the line box (a measured 81x43 paragraph came
back 304x100). That is right for `<strong>`, `<em>`, `<sup>`, `<a>`:
the browser styles them, so a bare tag still looks like itself.

A `<span>` is the opposite. It has no appearance of its own —
everything it looks like comes from a class the import does not carry.
Emitted as a bare `<span>`, every bit of it is gone. On one page a
headline's highlighted word, a coloured pill with padding and a
radius, came across as `<span>busywork.</span>` and rendered as plain
text.

So the rule is not about tags, it is about whether anything survives
being written out bare. A span that differs from its parent on
anything visible — or that is not an inline box at all — becomes a
real element; one that adds nothing stays a fragment.

## Three things that had to be true

**A flex or grid container has no inline content.** `inlineContentOf`
decided "running text" from the tag alone, so a `display: flex` span
holding a logo's three parts was read as a sentence, and its children
were flattened to bare tags. A layout container's children are items it
lays out, whatever tags they happen to be.

**A host cannot hold both words and children.** The generator drops the
text when an element has children — that is the rule `needsTextChild`
exists for. So once one span in a run becomes an element, every text
run in that run has to become one too, and the host is left a pure
container whose children flow as a line. With no styled span in the
run nothing changes, which keeps the common case exactly where it was.

**A child of a text host is `position: absolute`.** Scamp's tree-shape
rule pins any child of a non-layout parent at 0,0, which would lift the
word out of its sentence. The typed `position: static` is the escape
hatch, and these children get it explicitly, along with `width: auto`
and `height: auto` so an inline box hugs its words instead of a
measured width deciding where they wrap.

## The round-trip bug underneath it

`parseCode` types a tag with element children and no text of its own as
a **rectangle**, and `generateCode` emits typography only for text
elements. So a heading whose words had moved into spans was written
with `font-size: 56px` once and regenerated without it: the file
rewrote itself on the first save and the heading fell back to 16px.

The fix is the same principle as `resolveInheritance` — put the
declaration on the element that renders the words. Each lifted run and
each styled span carries the host's typography, and the host, which can
no longer keep it, gives it up. `test/importReduce.test.ts` pins this
with a generate → parse → generate comparison on the real fixture.

## `display: inline-block` could not be written down

It was folded onto the same typed sentinel as `display: block`, and
since that sentinel is also the default, nothing emitted it back:
`display: inline-block` written into a CSS module disappeared on the
next save. Both are "not a flex or grid container", but only `block` is
what an element already does without saying so. `inline-block` now
falls through to `customProperties` like `inline` and `flow-root`
always did — which is what lets a highlighted word be a box that sits
in a line.

See also `docs/notes/import-inherited-typography.md`.

## The inline run was not text at all

`<span class="auth-wordmark"><span>Resova</span><b>iQ</b><sup>®</sup></span>`
lost two of its three parts.

`TEXT_TAGS` — the set that decides whether a tag becomes a text element —
listed `strong` and `em` but not `b`, `i`, `u`, `s`, `sub`, `sup`,
`mark`, `abbr`, `cite`, `q`, `kbd`, `del` or `ins`. Those became
rectangles, and **a rectangle carries no text**, so `<b>iQ</b>` was
emitted as `<b />`: the element was there, correctly tagged and
classed, with the word gone. An empty box is what the user saw.

It had never mattered before, because these tags only ever appeared
inside a verbatim inline run. Making a flex host's children into real
elements is what first routed them through `elementTypeFor`.

Two lists had to move together. `importReduce`'s `TEXT_TAGS` mirrors
`parseCode`'s, and the comment on it says so. Adding the tags to the
importer alone would have written `<b>iQ</b>` once and regenerated it
empty, because the parser would still have read it as a rectangle —
the same self-rewriting file as the typography bug above.

With them as text elements, each part keeps its own type: in the
fixture the `<b>` resolves to weight 900 against its 700 parent and
takes the brand colour, while the `<sup>` keeps its 10px. That is three
elements you can edit where there used to be one bare tag.

## `<em>`, `<a>`, and the rule that was about tags

The span fix was scoped to `<span>`, justified as "`<strong>` and `<em>`
survive as bare tags because the browser styles them". That holds only
while the page has not restyled them. On one page it had: an `<em>`
carrying a whole 10px small-print treatment — its own size, weight,
line-height, top margin and max-width — of which a bare `<em>` keeps
the italic and nothing else.

So the rule is now per tag rather than per span: `INLINE_TAG_AFFORDANCES`
lists what each tag brings for free, and anything visible beyond that
makes an element. `a` and `button` bring **nothing**, deliberately —
Scamp's own reset does `all: unset` on them, so even the default link
colour is gone by the time the page renders.

That last point is why an inline `<a>` had to become an element rather
than stay a fragment. As a bare fragment it got `all: unset; display:
block` from `theme.css`: grey instead of link-blue, and taking the whole
paragraph width on a line of its own. A fragment has nowhere to carry a
colour, so only an element with its own class can hold it.

## Two display values that could not be written down

`display: inline-block` was the first (above). `display: block` on an
inline tag was the second, and it hid the same way: the model's "not a
flex or grid container" sentinel is also its default, so it emits
nothing — which reads as `block` on a div and as `inline` on an `<em>`.
A block-level `<em>` was therefore inexpressible, and the imported
disclaimer flowed back into the sentence above it.

The generator now spells out `display: block` for an inline-by-default
tag, and only where it is observable: not for a flex or grid item, which
its parent blockifies, and not for an absolutely positioned box, which
is out of flow. Both exclusions matter — without them every `<span>`
element in every existing project would gain the declaration, which the
published contract-0 fixture caught immediately.

## The bug under all of it: a container could not keep its type

`generateCode` emitted typography only for text elements. `parseCode`
parsed it into typed fields regardless. So a container declaring
`font-size: 14px` for its children to inherit had it read, held, and
then dropped on the next save — the file rewriting itself smaller, and
every text child falling back a size. `color` had already been fixed
here for exactly this reason; the rest of the inherited set had not.

That single omission is what made the earlier workarounds necessary:
moving type onto the words, then stripping it from the host. Stripping
was itself wrong — a container's `font-size` and `line-height` set the
line box its inline children sit in, so removing them made one
paragraph seven pixels taller than the page it copied. With the
generator fixed, the container keeps what it declared, the words keep
their own copy, and nothing is lost either way.

Measured after: dev.resovaiq.com went to **100%** of elements within
2px of the source, scamp.club 86% → 89%, resovaiq.com 86% → 88%.

## Why a container must not be typed `text`

The last symptom of this work was the strangest: the elements were in
the layers panel, they were in the code panel, and the canvas drew
nothing.

`ElementRenderer` renders a text element's `text` and **ignores its
children**:

```ts
const children = isText ? (resolveText(...) ?? element.text ?? '') : expandChildren(...)
```

So a `<p>` typed `text` whose words had moved into a `<span>` and an
`<em>` rendered as the empty string it now held, and both children were
never mounted.

`parseCode` has guarded this for a long time — it upgrades a text-typed
tag with element children to a rectangle on the way in, and its comment
describes exactly this failure. But the guard is skipped when the class
name pins the type, and `text_` does. The importer named every `<p>`
`text_…`, so the guard could not fire and reopening the project did not
help either.

The reducer now types any text tag with element children as a
rectangle, and stops naming it `text`. That is also what `parseCode`
concludes, so the two agree and nothing shifts on a reload — a
type-drift check over the whole fixture pins it.

**Still divergent, and worth knowing.** `generateCode` emits `text`,
then fragments, then children for *any* element type; the canvas drops
children for text-typed ones. Nothing the importer or the parser
produces lands in that state now, so it is latent rather than live —
but a hand-written file with a `text_`-prefixed element that has
children, or any canvas interaction that puts a child inside a text
element, would show in the export and not on the canvas. Fixing it
means teaching the canvas the same text-then-fragments-then-children
order the generator uses.

## The canvas now renders what the file says

`generateCode` emits text, then inline fragments, then children
interleaved by `afterChildIndex`, for any element type. The canvas
rendered a text element's `text` and nothing else, and never rendered
inline fragments at all — so a `<strong>` inside a sentence was in the
file, in the layers panel as `Raw (1)`, and absent from the canvas.

`ElementRenderer` composes the same three things in the same order now.
Two things that took care:

**Fragments are verbatim source, so they have to be injected as
markup.** That is the position the svg renderer is already in, and it
takes the same precaution: `sanitizeInlineMarkup` runs DOMPurify over
an inline-only allowlist first. A fragment can come from a hand-written
project file, so it is not trusted input. The wrapper is
`display: contents` — the closest the canvas gets to the generator's
"emitted with no wrapper at all".

**A composed element is not editable in place.** `handleEditableBlur`
commits `textContent`, which would swallow every child's words into the
parent's `text`. An element with children or fragments no longer offers
contentEditable; a plain text element, which is the overwhelmingly
common case, is untouched and still renders as exactly its own string.

Pinned by a parity fixture, which measures the canvas against a browser
rendering the same files. Its sizes are pinned rather than left to the
type, because the two Chromium builds resolve `system-ui` differently —
the first version of the fixture failed on an 8px width difference in a
run of text, which is the harness's own documented limitation rather
than a bug.

**A note on how this was nearly mis-diagnosed.** The first run of that
fixture showed the fragment missing and the `<em>` computing `inline`,
and both looked like bugs in the new code. They were not: Playwright
launches the built bundle in `out/`, and the build predated the edit.
`npm run build` before an e2e run.

## A page header, and four separate faults in it

```html
<h1 class="page-title"><span class="ico"><svg…/></span>Live capture</h1>
<div class="eyebrow">Clinical iQ &gt; AI Recorder</div>
<a class="app-home-link"><svg…/><span>Home</span></a>
```

**A box whose only content is words lost them.** `elementTypeFor` calls
a `<div>` a rectangle, and the generator emits `text` for text elements
alone — so `<div class="eyebrow">…</div>` was written out empty, with
nothing in the report to say the words had gone. A tag Scamp reads as a
box whose only content is text IS a text element, and it is named
`text_…` so `parseCode` reads the same thing back.

**Lifted words went to the front.** A node holding both text and
element children has its text lifted into a child, and that child was
always pushed first — so an `<h1>` that reads icon-then-title came out
title-then-icon. The capture now records `textAfterChildIndex`, the
child the words followed, and the lifted child lands there.

**`inline-flex` collapsed.** Scamp's typed `display` knows `flex`,
`grid`, and a sentinel for neither, so `inline-flex` goes to
`customProperties` — correct on the page, but every rule asking "is
this a layout parent?" answered no. Its children took the tree-shape
default of `position: absolute`, dropped out of flow, and the row
measured 76x0. `effectiveDisplay` reads both, and the generator and the
canvas both ask it now.

**Content-box measurements were read as border-box.** `box-sizing` was
dropped at capture on the reasoning that Scamp's reset sets border-box
globally — true, but it means a page WITHOUT a border-box reset reports
its content size, and reading that back as a border-box size eats the
padding. A header measured 194px tall came out 146px with its contents
spilling: exactly its 24px of padding, twice. The capture converts to
border-box while it still has both numbers.

The block went from 60% of elements within 2px with three overflowing,
to 90% with none — the remainder being a `max-width: 60ch` that resolves
per font. resovaiq.com gained three points from the box-sizing fix
alone.

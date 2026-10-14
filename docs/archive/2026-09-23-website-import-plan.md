# Website import — Plan

Status: **for review.** Written 2026-09-23 against `main` at v0.8.0.

## Goal

**Import** opens a window, you paste a URL and navigate to the page you
want, and clicking **Import** turns what is on screen into a new view in
the open project — editable on the canvas, not a screenshot.

The measure of success is not fidelity. It is whether the result is
**worth editing**: a layer tree a person can read, styles the panel can
change, and an honest list of what didn't come across.

## The reframe: this is not a new parser

Scamp already has a complete "markup + CSS → element tree" pipeline —
`parseCode`. The importer should not be a second one.

```
  webview (the live page)
    │  capture script: DOM walk + style delta + asset manifest
    ▼
  CapturePayload            ← plain JSON, crosses IPC
    │  reducer (PURE, src/renderer/lib/)
    ▼
  ScampElement tree
    │  the existing path, unchanged
    ▼
  generateCode → files on disk → the view opens on the canvas
```

Only the middle box is new. The reducer is a pure function from a JSON
payload to an element tree, which means it lives in
`src/renderer/lib/`, is fully unit-testable per CLAUDE.md, and can be
developed against saved fixtures with no browser in the loop. That is
the whole de-risking strategy: **the hard part is testable offline.**

## What already exists

| Need | What it reuses | Gap |
|---|---|---|
| A window with a URL bar that loads a site | `src/main/previewWindow.ts` — a `BrowserWindow` with `webviewTag: true`, popup routing to the system browser, preload + `contextIsolation` | Needs an **Import** button and a second window kind; ~80% is there |
| CSS declaration → typed field | `lib/cssPropertyMap.ts` — `cssToScampProperty`, 56 typed properties | Already the exact direction needed |
| Declarations → a built element | `parseCode/apply.ts` — `makeBaseline` + `applyDeclarations` | Reusable as-is |
| Tag → `ElementType` | `parseCode/tsx.ts:318` (`img` → image, `TEXT_TAGS` → text, else rectangle) | Reusable as-is |
| What an element tree emits as HTML | `lib/generateHtml.ts` — the inverse mapping | Reference for what round-trips |
| Downloading an image into the project | `importImage` → `copyImage` — WebP conversion, dedup, `public/assets/` | Needs a URL source instead of a local path |
| Creating the destination | `pageOps.createPage`, `viewTemplate` | Reusable as-is |
| Telling the user what was lost | `lib/viewLint.ts` + the Next.js migration report | Same shape, new findings |

## The hard part, stated honestly

**Not** fetching the page. The reduction from an arbitrary DOM to
Scamp's constrained model. Four problems, in order of difficulty:

### 1. Computed styles are not authored styles

`getComputedStyle` resolves **every** property — 340+ per element. Dump
that into `customProperties` and every element carries 300 junk
declarations; the file is unreadable and the panel is useless.

You need the *delta*, which is two diffs, not one:

- **vs. the UA default for that tag.** Render a bare `<p>`, `<div>`,
  `<ul>` … off-screen **in the same document**, compute it, and diff.
  Doing it in-document rather than from a hardcoded table means the
  page's own reset CSS is accounted for automatically.
- **vs. the parent's computed value, for inherited properties.**
  `color` matching the parent is not an authored declaration.

This is the one piece where being wrong makes the whole feature
worthless, which is why it gets a fixture suite before anything else is
built.

### 2. A DOM is far deeper than a design

Real pages nest wrapper divs ten-plus levels for layout hooks and
utility classes. Imported 1:1 the layers panel is unusable.

A collapse pass: a container with **one** child, no background, border,
padding, shadow or non-default layout, contributes nothing and should
be merged into its child. Conservative by default — it is better to
leave a redundant wrapper than to break a layout.

### 3. Layout models that don't map

Flex maps cleanly. Grid maps to Scamp's grid fields. Beyond that:
floats, table layout, `position: sticky` inside scroll containers, and
transforms used for layout have no clean equivalent. These land in
`customProperties`, render correctly on the canvas, and are listed in
the report as not-panel-editable.

### 4. Things with no representation at all

Pseudo-elements (`::before` / `::after`) are the big one — extremely
common for icons, dividers and decorative shapes, and Scamp has no
model for them. Also: shadow DOM, `<canvas>`, JS-injected content that
appears after capture, and `<iframe>` contents.

Each is **detected and reported**, never silently dropped. A user who
knows the three icons didn't come across can add them; a user who
doesn't will think Scamp is broken.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| What gets captured | The **live DOM + computed styles** from the webview, not the HTML/CSS source | The user asked for "the html and css that is loaded" — the loaded page is the DOM after cascade, media queries and JS. Fetching source files would mean reimplementing the cascade, and would miss anything JS rendered. |
| Where the capture script runs | In the page, via `executeJavaScriptInIsolatedWorld` | Needs live `getComputedStyle`. The isolated world keeps the page's own globals from interfering and vice versa. |
| What crosses IPC | A serialized `CapturePayload`, size-capped | Keeps the reducer pure and the payload fixture-able. A cap because a large page can produce megabytes. |
| Where the reducer lives | `src/renderer/lib/importReduce.ts`, pure | CLAUDE.md requires full test coverage for `lib/`; a pure reducer is testable against saved payloads with no browser. |
| `customProperties` policy | An **allowlist** of visually-meaningful properties, unlike `parseCode`'s keep-everything | A hand-written file only contains what its author meant. A computed-style capture contains everything. The two need different rules. |
| What it creates | A **new view** (scamp) or page (nextjs/legacy), never an overwrite | An import is a starting point; destroying existing work would make it unusable for iteration. |
| Destination naming | Derived from the page `<title>`, deduped | Predictable, and avoids a modal before the user has seen the result. |
| Images | Downloaded into `public/assets/` through the existing `copyImage` | Gets WebP conversion, dedup and the assets convention for free. A remote URL that 404s later would silently rot the design. |
| Fonts | Detected, reported, and offered to Project Settings → Fonts | Scamp already manages `@import` lines there; an importer that writes them directly would fight that panel. |
| Tokens | Phase 3, not phase 1 | Extracting repeated colours and spacing into `theme.css` is what makes an import *editable* rather than a dead snapshot — but it is a separate problem from getting the tree right. |
| Breakpoints | Phase 4: re-capture at each project breakpoint width, diff, emit `@media` overrides | The model already supports it; doing it in v1 triples capture complexity before the basics are proven. |

## What real pages broke, and the fix

Phase 2 shipped working against one hand-written fixture page and fell
apart on the first two real sites (`scamp.club`, `resovaiq.com`): the
layout was, in Angie's words, "really bad on both". Three causes, in
order of how much damage they did.

**1. Scamp has no model for block flow, and the web's default IS block
flow.** Scamp emits `position: absolute; left: 0; top: 0` for a child
of a parent that is not a flex or grid container — in flex, a child is
in flow; outside one, it is pinned. Real pages are mostly plain block
containers, so importing them as-is pinned everything at the origin:
**303 of 541 rules** on one site, 72 of 257 on the other.

The fixture never showed it because I wrote the fixture, and I wrote it
flex-first the way I would build a page today. It had three block
containers with children. That is the fixture trap one level up: real
captures beat imagined ones, and *my* page is still an imagined one.

The fix is to translate rather than transcribe. A block container
stacking its children down the page IS `flex-direction: column` with
the default `align-items: stretch`; one whose children are all inline
is the row case. Absolute positioning fell to **4% on both sites**, and
what remains is genuinely sticky or absolute.

**2. `margin: 0 auto` computes to pixels.** The centring idiom — the
most common layout idiom on the web — arrives as `margin: 0px 120px`,
which pins the element to the width the capture happened at. Equal
non-zero side margins on an element that also caps its width is that
idiom with near-certainty, and is restored to `auto`.

**3. The root carried the viewport.** `document.body` reports the
window it was measured in, so every import arrived with `max-width:
1440px; min-height: 900px` on its root. The root's size is the
artboard's.

Two smaller ones: `min-width` / `min-height` compute to `0px` on a
block element and `auto` on a flex item, and only `auto` was treated as
"nothing set" — which put `min-height: 0px` on **296 of 541** rules.
And `text-align: start` and `list-style-type: disc` are initial values
that were being carried onto every root.

## Measuring fidelity, and what it costs

"Not quite a 1:1 copy" is not something you can fix. A ranked list of
which elements are off and by how much is, so
`scripts/import-fidelity.mjs` loads a page, captures it with every
element's box, reduces it the way the app does, renders the result back
through the HTML exporter, and compares the two geometries element by
element.

Two things had to be true before its numbers meant anything:

**The reducer records which captured node each element came from.**
Pairing them by position in the tree guessed wrong the moment anything
was collapsed, and an image was being compared against some unrelated
div.

**The oracle renders with the project's `theme.css`.** Without it, every
padded box measured exactly `2 x padding` too large — `box-sizing:
border-box` lives in that reset. The artefacts looked exactly like
importer bugs, and three "fixes" were made against them before the
pattern (a constant +66 on both dimensions) gave it away. This is the
mistake `docs/notes/parity-harness.md` explicitly warns about, in a
document that was read before the harness was written.

### What the numbers said

Measured on `scamp.club` (242 elements) and `resovaiq.com` (521):

| Rule for a container's measured width and height | scamp.club | resovaiq.com |
|---|---|---|
| Drop them all — "a computed value is not a decision" | 72% | 77% |
| Keep them all — a pixel snapshot | 92% | 93% |
| **Drop only what the layout reproduces** | **88%** | **91%** |

Phase 1's principle — drop every measured size, because a `flex: 1 1 0`
card's 442.656px width is the layout's answer and not the author's —
turned out to cost 20 points of fidelity. It is right about SOME of
those widths and wrong about the rest, and it had no way to tell them
apart.

The measured box tells them apart. An element whose width matches the
space its parent gave it was filling, and `stretch` reproduces that at
any width; one that is narrower chose to be, and the number is a
decision that has to be kept. That is why the capture now carries
rects: four numbers a node, and they are the difference between an
import that reflows and one that is frozen at 1440px.

### The remaining gap is inline content, not block flow

An earlier draft of this section asserted that 1:1 was blocked on Scamp
having no model for block flow, because flex does not collapse adjacent
vertical margins and block flow does. **That was a guess, and measuring
it showed it was wrong.** Of the elements still off by more than 2px,
the ones carrying vertical margins at all are **0 of 30** on
`scamp.club` and **5 of 46** on `resovaiq.com`. Margin collapsing is
not what is costing the last ten points, and block flow would buy
almost nothing on either page.

What the offenders were:

| | scamp.club | resovaiq.com |
|---|---|---|
| Inline content inside a text element | 19 of 30 | 16 of 46 |
| By tag | `a` 17, `li` 10, `br` 3 | `span` 16, `div` 13, `tr`/`tbody`/`table` 9, `a` 5, `b` 2, `kbd` 1 |

The dominant cause is **inline flow**: an `<a>` or `<span>` inside a
sentence is part of a line box, and the importer turns it into its own
Scamp element — a block in a flex row, with its own metrics. Scamp's
reset (`all: unset; display: block` on anchors) makes that worse.

**Scamp already had the mechanism and the importer was not using it.**
`inlineFragments` on a text element holds exactly this: loose text and
inline markup, kept in source order and emitted verbatim, which is how
a hand-written `<p>Hello <strong>world</strong></p>` round-trips today.

Done, and it was the largest single win of the work:

| | before | after |
|---|---|---|
| `scamp.club` | 88% | **100%** |
| `resovaiq.com` | 91% | **95%** |

The capture now records ordered inline content for a text-bearing tag
whose element children are all inline, and the reducer maps it onto
`text` + fragments — a leading text run becomes the element's `text`
and the rest become fragments, which is exactly the order the generator
emits. Elements dropped from 242 to 219 and 521 to 483, so the layers
panel got shorter as well as the layout more faithful.

A fragment's `source` is JSX-safe markup built by the capture, not the
page's `outerHTML`: it is emitted byte-for-byte into a `.tsx` file, so
`class=` would be a React error and page-specific attributes would be
noise. Only `href`, `target`, `rel`, `datetime`, `title` and `cite`
survive, on the tags where they mean something.

The trade, reported to the user rather than hidden: inline markup is no
longer separately selectable on the canvas. A link inside a sentence is
part of that sentence's text now. That is the correct shape — it is
what a hand-written view does — but it is a change from the previous
behaviour of making it its own element.

What is left on `resovaiq.com` is 13 `div`s and 9 table elements.
Tables Scamp genuinely cannot model and already reports.

The rest is tables (9 on `resovaiq.com`), which Scamp genuinely cannot
model and which are already reported as `unsupported-display`.

### On adding block flow to Scamp

Rejected for this plan, on two grounds beyond the measurement.

It would not be an addition but a reversal: `agent.md` states flex-first
as "the single most important layout rule in Scamp… the canvas, the
panel controls, and the round-trip parser are all built around flex as
the default container model." Changing that touches the element model,
the canvas renderer, the properties panel, `generateCode`, `parseCode`,
the parity harness, and every existing project.

And the importer would be one consumer of it, not its owner. A model
change designed inside an import plan gets designed for import's needs.
If block flow is ever wanted, it wants its own plan and its own
justification — which, on this evidence, it does not yet have.

## Phases

Each is independently shippable and independently useful.

### Phase 1 — The reducer, against fixtures. No UI. **(landed)**

Save three real pages' `CapturePayload` as fixtures (a marketing page,
a docs page, an app shell). Build `importReduce.ts` and its test suite.
Ship nothing to users.

Deliverable: `payload → element tree` with tests covering the style
delta, the collapse pass, tag classification, text wrapping, and each
"cannot represent" detection.

Why first: it is the only part that can fail in a way that kills the
feature, and it is the only part testable without a browser.

**What it cost to be wrong, and how often.** Every correction below
came from running the thing against a real browser's output; none of
them was visible from reasoning about it.

- The plan said to diff each element against a bare probe of the same
  tag in the source document. That answers the wrong question. The one
  that matters is "what must a Scamp module declare to reproduce this",
  and a page with no reset gets the UA's `<p>` margin for free — diff
  it away and the import loses its paragraph spacing, because Scamp's
  own reset zeroes it. Capture now never consults the source baseline.
- A `flex: 1 1 0` card computes `width: 442.656px`. Declaring it
  freezes the card. Roughly a third of captured properties turned out
  to be layout *results* rather than decisions — `border-*-color` on
  every element with no border, `transform-origin` derived from every
  box, `box-sizing` from the page's reset. Filtering them took the
  payload from 18 properties per node to 10.5.
- Dropping a computed size is not the same as deleting the
  declaration: the model's baseline then supplies a hardcoded 100px
  box. The size mode has to be set to `auto` explicitly.
- `collapse` ate the view's own root, because a root with one child
  and no styling looks exactly like a redundant wrapper.

The reducer reuses `makeBaseline` + `applyDeclarations` rather than
reimplementing the declaration → typed-field mapping, so an imported
element and a hand-written one cannot disagree about what
`padding: 16px` means.

**Still open at the end of phase 1**, and better decided with the
window in hand than guessed now:

- **Authored vs. computed sizes.** The conservative rule is "a node
  with children is sized by its content". The precise answer needs the
  authored rules, readable through `document.styleSheets` for
  same-origin stylesheets and blocked for cross-origin ones. Worth
  doing in phase 2 with the heuristic as the fallback.
- **Internal links** still carry the source page's absolute URL.
  They should become project-relative when the target is also
  imported.
- **Colour format.** Captured colours are `rgb(…)`; the panel and
  theme tokens are hex. Converting belongs with phase 3's token
  extraction.
- **The root's own layout.** The captured `<body>` rarely declares
  one, so children of the root land as absolutely positioned. The
  window's capture should probably give the root a flex column.

### Phase 2 — The window and the round trip. **(landed)**

A second window kind alongside the preview: URL bar, back/forward, an
**Import** button. The capture script. Payload → reducer → `createPage`
→ the view opens on the canvas.

Deliverable: paste a URL, navigate, click Import, get an editable view.

**What it is.** A third `BrowserWindow` beside the app and the preview
(`main/importWindow.ts`, `preload/import.ts`,
`renderer/import/ImportApp.tsx`), reached from **↧ Import a page…**
under the Pages sidebar. The capture runs in the import window's
renderer, because `executeJavaScript` on the `<webview>` tag is what
reaches the live document; the payload goes through main to the app
window, which owns the project, the reducer and the generator. The
import window never sees a file — it hosts a third-party page, so it
has the smallest preload in the app.

An import creates a **view**, through `createComponent({ kind: 'view' })`
— one call that writes the files and the route together, so there is no
window in which a half-made view exists on disk. The name comes from
the page title and is deduped, so a second import of the same page
lands beside the first rather than on top of it.

**Two things went wrong, and both were the same shape as bugs this
month's release fixed:**

- `createPage` is the *legacy* path. In a framework project it answers
  "A Scamp-format project has no pages; add a view instead." Written
  from the mental model of pages rather than views — the same mistake
  that made Replace image dead on every framework page.
- The `<webview>` tag's methods, `executeJavaScript` among them, only
  exist once it has emitted `dom-ready`. Before that the element is in
  the DOM and the call is not, which presents as a button that does
  nothing at all. Import is now gated on `dom-ready`, and the guard
  reports rather than returning silently.

Neither was findable by reading. Both took an e2e test that drives the
real windows.

**Verified** by `test/e2e/import/import-window.spec.ts` against all
three project formats: the button opens the browser, the browser reads
the local fixture page, a view appears on disk with the page's semantic
tags and its three images, the styles are in the module rather than
inline, and the report names the decorative `::before` it could not
bring across. A second import of the same page creates `…2`.

### Phase 3 — Assets and tokens. **(landed)**

Images downloaded through `copyImage`. Repeated colours and spacing
lifted into `design/theme.css` as tokens, with module CSS referencing
them. Fonts detected and offered.

Deliverable: an import whose colours change from the theme panel.

**Tokens, done.** `lib/importTokens.ts` is pure and tallies every
colour that is actually in effect, names the ones used more than once,
and rewrites the elements to reference them; the import then merges
them into `design/theme.css`. An imported view references
`var(--color-accent)` rather than the same literal forty times, which
is the difference between a design and a snapshot.

Three decisions worth keeping:

- **Named by role, not by hue.** `--color-text` says what it is for;
  `--color-slate-700` says what it looks like, which stops being true
  the moment someone changes it. The most-used colour in a role takes
  that role's name.
- **The accent is claimed before the background.** A strongly saturated
  colour on two elements is a button, not the ground the page sits on —
  and `--color-background` is the first thing someone would try to
  change. Only above 0.35 saturation, so a grey never becomes an accent.
- **In effect, not merely present.** The model gives every element a
  `borderColor` of `#000000` whether or not it has a border, so counting
  the field blindly named black the most popular colour on every page
  ever imported. Same class of mistake as the computed-style filtering
  in phase 1, and it showed up the same way: a value that is there
  without being a decision.

A token name the project already uses is suffixed rather than
redefined — someone's `--color-accent` means what they said it means.

**Images, done.** `import:fetchImage` in main downloads one remote
image and hands the bytes to the existing `copyImage`, which already
converts to WebP when that is smaller, dedupes, and names the file — an
importer that wrote its own copy would drift from all three.

It runs AFTER the view exists, and each failure is a returned error
rather than a throw: an import pulling forty images must not lose the
other thirty-nine because one host was down, and a view that exists
with three missing pictures beats no view at all. Refused: anything
that is not `http(s)`, not an image content-type, or over 20MB. Both
`<img src>` and `background-image: url(...)` are rewritten to the local
asset.

**Fonts, done.** Type is most of a page's character, and an import that
silently falls back to Helvetica looks nothing like what it copied —
with nothing in the file to say why. Each family gets a different
answer, so each is asked about separately:

| | |
|---|---|
| Already installed | Left alone. Embedding a face the user has is noise. |
| On Google Fonts | Embedded — one `@import` covering every family, since `css2` takes repeated `family=` params. |
| Neither | Named in the report: *install X — not on Google Fonts and not on this machine.* |

Three things make it accurate rather than approximate:

- **Only the head of the stack is a decision.** `getComputedStyle`
  returns `Fraunces, "Fraunces Fallback", Georgia, serif`; the rest is
  the author's fallback chain, which the browser applies anyway. A
  `… Fallback` entry is what Next.js emits for a locally
  metric-matched face and is never installable.
- **Google's `css2` endpoint is its own oracle** — 200 with a
  stylesheet for a family it has, 400 for one it does not. More
  reliable than shipping a list that goes stale, and it is the same URL
  that gets embedded.
- **System stacks are never asked about.** `-apple-system`, `Segoe UI`,
  `Arial`, `Georgia` and friends are what an OS already answers.
  Telling someone to install Arial would be absurd, and Google returns
  200 for `Helvetica Neue` — which it does not actually serve — so
  filtering first is what stops a wrong embed.

The weight range `300;400;500;600;700;800` is requested rather than the
default, because a page with a bold heading and a light caption needs
both and the default would flatten them.

### Phase 4 — Fidelity and the report. **(landed)**

Re-capture at each breakpoint width and emit the overrides. The import
report: what was collapsed, what landed in `customProperties`, which
pseudo-elements were dropped, which assets failed.

Deliverable: an import you can trust, because it tells you where it
lied.

**The report.** Findings are grouped by kind, counted, given a few
locations, and — the part that makes it readable — split into LOSSES
and TRANSLATIONS. Turning a block container into a flex column changes
the file and changes nothing you can see; dropping an icon loses an
icon. Losses sort first, so one dropped `::before` is not buried under
two hundred collapsed wrappers. The import window opens the report
automatically when anything was lost, and leaves it folded when nothing
was.

Every label is written for someone who did not read the code: "3
decorative ::before/::after elements dropped — icons, dividers,
counters", not "pseudo-element: 3". A finding kind nobody described
still gets a line rather than being silently dropped.

**Breakpoints.** The importer re-reads the page at each of the
project's narrower widths and folds the differences in as breakpoint
overrides, so an imported view is responsive rather than correct at one
size.

Two things this required:

- **A structural path on every captured node** (`div>nav:0>ul:1`).
  Node ids are walk order, which is useless across captures — a mobile
  menu appearing shifts every id after it. A path holds as long as the
  structure does, and when the structure genuinely differs the path
  simply does not match, which is the right answer: an element that
  exists at only one width has no override to give. Those are counted
  and reported, because Scamp has no way to say "hidden below 768px".
- **`flex: none` alongside the width when resizing the webview.** The
  guest viewport follows the element's size, which is what makes the
  page's own media queries fire — but the webview is a flex item with
  `flex: 1 1 auto`, so grow beat the width and the page never actually
  narrowed. It failed silently: two captures arrived, identical to the
  base, and produced no overrides.

A width that fails to capture costs one breakpoint's overrides, not the
import. The base capture never depends on the narrow ones.

**What the first real test of it found.** Three bugs, and the worst was
silent in the most literal way — switching the canvas to tablet or
mobile showed a blank page.

The narrow capture was being diffed against the base's styles AFTER
this module had translated them. Base read `display: flex` (put there
by the block-flow translation), the narrow capture read `display:
block`, and Scamp's "not a layout container" sentinel is the string
`none` — so every block container on the page acquired `display: none`
at tablet and mobile. The diff was measuring its own work. Both sides
now go through one `normalizedStyles`, which is a correctness
requirement rather than a tidy-up.

Ten "image could not be fetched" errors for things that were never
images: the `url()` regex stopped at the first quote or paren, and an
inline SVG data URI contains both. `url("data:image/svg+xml;utf8,<svg
xmlns='…'>")` captured a fragment that then resolved into a perfectly
fetchable 404. Quoted forms are matched to their own closing quote now,
and fragments, `data:` and `blob:` are never treated as files.

And every `<li>` on the page was reported as an unsupported table
layout — `list-item` was in the unsupported set. It is an ordinary
block that also draws a marker, the flow translation handles it, and
Scamp models `list-style` directly. Nineteen false alarms on one page,
which is how a report stops being read.

## What this will not do

Stated so the feature is judged against the right bar:

- **Pixel-perfect reproduction.** The output is a starting point.
- **Interactive behaviour.** No JS, no state, no event handlers.
  Hover styles come across; a dropdown's open state does not.
- **Whole sites.** One page per import.
- **Authentication-walled pages** beyond whatever the window's session
  happens to hold.
- **Legal clearance.** Importing a page you don't own is the user's
  call, the same as it is in a browser's devtools or a Figma plugin.
  Worth one line in the docs; not a gate in the product.

## Risks

| Risk | Mitigation |
|---|---|
| The reduction produces an unusable tree and the feature is abandoned late | Phase 1 proves it against real fixtures before any UI exists |
| Payload size on a large page | Cap it, and report the cap rather than truncating silently |
| Capture script breaks on a hostile or unusual page | It runs isolated, wrapped, and a failure reports rather than throws |
| Import becomes a silent-failure machine, like the five `activePage` bugs this release fixed | Every unrepresentable thing is a report entry. That is a phase-4 deliverable but the detection is built in phase 1. |
| Scope creep toward "a browser" | The window does URL, navigate, import. No tabs, no bookmarks, no devtools. |

## Open questions for review

1. **Is a view the right destination**, or should an import land
   somewhere staged — a scratch view the user promotes — so a bad
   import doesn't clutter Pages?
   no just create a view, users can always delete it if they dont like it.
2. **How aggressive should the collapse pass be?** Conservative leaves
   wrapper noise; aggressive risks breaking layouts. I lean
   conservative and would rather tune it against fixtures than guess. - conservative
3. **Is partial import worth it in v1** — the user picks an element in
   the window and imports only that subtree? It is a much better fit
   for "I want this hero section" and avoids the whole-page depth
   problem, but it needs element-picking UI in the window. this can be a feature for later
4. **Should phase 1 ship behind a flag** so real payloads can be
   gathered from real use before the UI is finalised? no

## Done when

- [ ] A designer pastes a URL, navigates, clicks **Import**, and a new
      view opens on the canvas with a layer tree they can read.
- [ ] Colours and spacing come from `theme.css` tokens, so changing the
      theme changes the import.
- [ ] The import report names everything that didn't come across.
- [ ] `importReduce.ts` has full coverage per CLAUDE.md, including the
      unhappy paths: empty page, single element, 5000 elements, a page
      that is one `<canvas>`.

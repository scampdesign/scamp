# Import parity log

Measured comparisons between an imported page and the page it came from,
newest first. One entry per cause, not per symptom.

The format is borrowed from BuilderIO/agent-native's `PARITY-LOG.md`; the
reasoning is in [`../agent-native-review.md`](../agent-native-review.md).

## How to write an entry

Five lines, in this order. Skip none of them — the missing one is always
the one someone needs later.

1. **Measured.** What the source page does, with the method named and real
   numbers. "Fraunces 500/60px, `letter-spacing: -1.2px`, text 988.41px in
   a 977px box" — not "the heading was too wide".
2. **Before.** What Scamp did, with the repro.
3. **Cause.** One sentence naming the actual code.
4. **Fix.** The file, **and the test that fails without it**.
5. **Re-run.** The numbers after.

### Status vocabulary

Use these literally, so the log can be skimmed for what is still open.

| Status | Means |
|---|---|
| `FIXED` | Cause found, fix shipped, re-measured |
| `NOT REPRODUCED` | Looked, could not make it happen — say what you tried |
| `DEFERRED` | Real, understood, not now — say what it needs |
| `NOTICED (not fixed)` | Seen in passing, not chased. No shame in these |
| `NOT MATCHED, DELIBERATELY` | We know, and we are choosing differently |
| `RETRACTION` | An earlier entry here was wrong |
| `HARNESS` | The measuring tool was the problem, not the importer |

`RETRACTION` and `HARNESS` are the two that make the rest trustworthy. A
log with no retractions in it is a log nobody is checking.

---

## FIXED — line icons import as solid black blobs

**Measured.** `resova-health6` in the website-import project. Of its 36
inline svgs: 26 carry a `fill`, **none carries a `stroke`**, and 10 carry
no paint at all. Those 10 are the line icons, and each one's paths hold
their paint inline:

```jsx
<path d="M6 11.5a6 6 0 0 0 12 0…" style={{ fill: 'none', stroke: 'currentcolor', strokeWidth: '1.6' }} />
```

**Cause.** `style={{ … }}` is JSX. The canvas injects `svgSource` as
HTML through `dangerouslySetInnerHTML`, and `buildHtmlExport` writes it
into an HTML document — and in HTML that is an attribute named `style`
whose value is `{{`, which is not CSS and is discarded. The path then
takes the SVG default: **fill black, no stroke.** Measured on the real
markup:

| form | computed fill | computed stroke |
|---|---|---|
| JSX style object — what we write | `rgb(0, 0, 0)` | `none` |
| HTML `style` attribute | `none` | `rgb(8, 145, 178)` |
| presentation attributes | `none` | `rgb(8, 145, 178)` |

**This is the third instance of one class of bug**, and that is the
finding worth keeping. `svgSource` is stored in JSX spelling and then
rendered as HTML in two places that are not React:

1. `stopColor` → `stopcolor`, gradients rendered black
   ([import-svg-as-file.md](import-svg-as-file.md))
2. camelCase SVG tag names, saved by the HTML parser's own fix-up table
   — which is why the markup *looked* right and only the paint was wrong
3. `style={{ … }}` → an inert attribute, line icons rendered black

**Suggested fix, smallest first.** Convert paint-carrying inline styles
into presentation ATTRIBUTES at reduce time —
`fill="none" stroke="currentColor" stroke-width="1.6"`. Those are valid
in HTML *and* in JSX, need no case folding, and keep `currentColor`
working, so the icons stay recolourable. Measured above as correct in
both forms.

**Fixed, both halves.**

**The capture no longer writes paint inline.** Paint-carrying
declarations move onto presentation attributes before `svgSource` is
taken — `fill="none" stroke="currentColor" stroke-width="1.6"` — which
are valid in HTML *and* in JSX, need no case folding, and keep
`currentColor` working so the icon stays recolourable. Measured on
resovaiq.com: 37 svgs captured, **0 still carrying an inline style**.
Anything that is not paint is left where it was; a transform is not
this function's business.

**And the class is retired.** `svgSourceToHtml` is the inverse of
`svgSourceToJsx`, and the two consumers that are not React now use it —
the canvas's `dangerouslySetInnerHTML` and `generateHtml`'s export.

Storing HTML instead, as first suggested, would have been wrong:
`svgSource` is JSX *by contract*, because a hand-written `<svg>` in a
file already contains JSX and has to round-trip byte-for-byte. The gap
was never the storage, it was two readers pretending JSX was HTML.

The inverse needs a list, which is the part worth knowing. It cannot
simply un-camel every name: `strokeWidth` came from `stroke-width` and
must go back, while `viewBox` and `gradientUnits` are spelled that way
in SVG itself and lowercasing them breaks the attribute. Measured on the
real markup, before and after:

| | computed fill | computed stroke |
|---|---|---|
| JSX injected as HTML | `rgb(0, 0, 0)` | `none` |
| converted back | `none` | `rgb(8, 145, 178)` |

---

## FIXED — insets: a hidden skip link painted a bar down the page

**Measured.** gainwix.com hides its "Skip to content" link the ordinary
way: `position: absolute; top: -100px; left: 16px`, 146x50, background
`rgb(19, 17, 28)`, `z-index: 1000`. Off the top of the viewport until
focused. Nearly every accessible site has one.

**Before.** The import painted a dark bar ~160px wide down the left edge
of the page for 4533px, over the text. `import-fidelity.mjs` named it
first: `skip_link_0001 <a> 146x50 → 146x4533`.

**Cause.** Insets read back from `getComputedStyle` as USED values, so an
element with `top: -100px` reports all four. Emitting both of an opposing
pair does not position a box, it stretches it between them:
`5383 − (−100) − 949.6 ≈ 4533`. `captureScript.ts` had a filter for
exactly this and ran it only on `::before` / `::after` styles.

**Fix.** `dropResolvedInsets` in `src/shared/captureScript.ts`, now called
for every positioned element.

Two attempts, and the first one is the interesting one:

- **Rejected — guess which inset the author wrote.** Keep the smaller
  absolute value, then only prune a lopsided pair. Gained 5.2 on gainwix,
  **lost 1.7 on resovaiq**, A/B'd by stashing the change. Its two biggest
  new clusters had no `position` and no insets, so both were consequences
  of an ancestor moving that was never identified.
- **Shipped — do not guess.** With a size on that axis, ONE inset already
  fixes both edges: `left + width` determines `right`. The other is
  redundant by construction, and dropping it reproduces the measured
  position exactly. With no size the pair IS the size, so both stay. Auto
  margins on both sides is the centring idiom and is left alone.

**Re-run.** gainwix 86.51% → **93.42%**; resovaiq 95.11% → 95.11%;
vercel 95.01% → 95.01%. Better than the heuristic where it mattered and
nothing lost anywhere else, which is what says a rule is right rather than
tuned. `skip_link_0001` is gone from the geometry offender list.

Full detail: [`import-positioned-insets.md`](import-positioned-insets.md).

---

## FIXED — a variable font rendered too wide, so every heading wrapped early

**Measured.** scamp.club sets its headings in Fraunces 500/60px,
`letter-spacing: -1.2px`, `font-variation-settings: "SOFT" 100`, in a
977px box. Same string, same size, three ways:

| | text width |
|---|---|
| Google URL asking for `wght` only | 988.41px — wraps |
| Google URL naming all four axes | 956.41px — fits |
| the site's own headline box | 977px |

**Before.** 24 geometry offenders, **all height-only**, each exactly one
line taller than its source, box widths matching to the pixel.

**Cause.** Google **instances** a variable font to whatever axes the
stylesheet URL names. `googleFontsUrlFor` asked for `wght` alone, so every
other axis froze at its default — and Fraunces defaults to `opsz` **14**.
A 60px headline was being set in 14px-optical glyphs, ~7% wider. One
wrapped headline pushes every section below it down the page, which is how
a page 94% correct by geometry looks 40% wrong by pixels.

**Fix.** `googleFontsUrlFor(families, axesByFamily?)` in
`src/renderer/lib/importFonts.ts` names every axis across its full range.
Axes arrive as an argument, following the rule the file already states
about facts it cannot know. Main fetches Google's public metadata once per
resolution. Tests in `test/importFonts.test.ts`, including one pinning the
axis ORDER — registered axes alphabetically then custom — because any
other order is a 400 from Google, and a 400 is a silent fallback rather
than an error anyone sees.

**Re-run.** scamp.club pixels 58.57% → 72.01%, geometry 89% → 94%, height
+359px → +35px.

**Scope.** 158 of Google's ~1950 families have an axis beyond weight.

Full detail: [`import-variable-fonts.md`](import-variable-fonts.md).

---

## HARNESS — the pixel harness deleted its own screenshots

`scripts/import-pixels.mjs` resolved its esbuild bundle cache and its PNG
output to the same `.pixels-tmp`, and the cleanup on exit removed both.
The symptom was indistinguishable from the screenshots never being taken.
Split into `.pixels-tmp/bundles` and `.pixels-tmp/shots`.

Recorded because a harness fault that looks like a product fault is the
most expensive kind of wrong turn available here.

---

## HARNESS — the pixel harness skipped a step the app runs

`extractTokens` sits between reducing and generating in the real import,
lifting repeated colours into theme tokens. The harness went straight from
`reduceCapture` to `generateCode`, so it was scoring a pipeline nobody
runs.

Now tokenises and renders against a theme declaring the tokens. **The
score did not move** — gainwix stayed at 93.42% — which is the useful
part: tokens resolve correctly through the export path, so wrong colours
reported on the CANVAS are not coming from there.

---

## FIXED — per-side values the panel can't edit, left for the agent to fold

**Measured.** The same dashboard, captured fresh and reduced, then run
through `lintView`: 305 elements, **179 findings**, 149 of them
`side-not-typed` (`padding-top` with no `padding-right`,
`border-right-*` alone). The cleanup agent spent 68 edits and about 2.5M
tokens folding them by hand. The rest of the CSS repeated itself:
`gap: 8px; column-gap: 8px; row-gap: 8px`, and every `position:
relative` box carried `right: 0px; bottom: 0px`.

**Before.** `foldShorthands` folded a set only when all four sides were
present, on the reasoning that a missing side would be invented.

**Cause.** The capture leaves out every value equal to its initial
value, so a missing side IS known: `0px` for padding, margin, border
width and radius, and no paint for a border side with no width. The gap
shorthand was captured alongside both its longhands. And Chromium
reports all four insets of a relative box (`0px` when none was set, the
end as the start negated when one was).

**Fix.** `importReduce.ts`: `foldShorthands` fills missing sides from
their initial value, folds border style and colour to the one value the
painted sides share, and keeps `gap` alone when both axes match (or the
axes alone when they differ). `captureScript.ts`: a relative box keeps
only a non-zero start inset. Tests in `test/importReduce.test.ts`
("folds a set with sides missing", "a one-sided border", "writes a gap
once"), and the app-shell fixture for the relative insets.

**Re-run.** **29 findings** (all `not-panel-editable`), down from 179.
Pixels unchanged: dashboard 85.77 → 85.83, gainwix.com 93.39,
linear.app 88.27, vercel.com 95.59.

---

## FIXED — a dashboard laid out by named grid areas stacked its columns

**Measured.** A clinic dashboard (resovaiq, served locally at
`/dashboard`) is `.dp-root { display: grid; grid-template-areas: "nav
centre panel"; grid-template-columns: var(--size-sidebar) minmax(0, 1fr)
var(--size-panel) }`, with each column placing itself by name
(`grid-area: nav`). `scripts/import-pixels.mjs` against a frozen copy of
the captured page (scripts stripped, styles inlined, `<base>` at the dev
server, because headless Chromium is shown the onboarding screen
instead): **49.66%** of pixels match.

**Before.** The sidebar rendered at x=600, with the main column and the
right panel overlapping it. Three smaller losses on the same page: every
button and avatar collapsed onto its label, the top-right icon buttons
lost their width, and the logo read "Resova iQ iQ".

**Cause.** Four, in two files.
1. `grid-template-areas` was not in `CAPTURED_PROPERTIES`, so the
   children's `grid-column: nav` named lines that didn't exist and each
   landed in an implicit track after the grid.
2. `dropComputedSizes` dropped the height of every text element, and a
   flex box that centres its label in 40px (a button, an avatar) chose
   that height.
3. It dropped a width equal to the parent's as "filling" whatever the
   parent's layout. A flex item in a row is never stretched across, so
   an icon button as wide as the wrapper hugging it is its own 40px.
4. In `captureScript.ts`, a `display: none` span inside a run of text (the
   logo's short form) was turned back into its words.

**Fix.** `importCapture.ts` (areas), `importReduce.ts`
(`parentStretchesWidth`, `centresItsWords`), `captureScript.ts` (hidden
spans leave the run). Tests: the new "filling depends on how the parent
lays out" and "a control keeps the height" groups in
`test/importReduce.test.ts`, and a real-browser fixture,
`test/fixtures/import/pages/app-shell.html`, with the four cases.

**Re-run.** **85.77%**. The columns, controls and logo match. No
regression elsewhere: gainwix.com 93.39 → 93.39, linear.app 88.19 →
88.26, vercel.com 95.59 → 95.59.

---

## NOTICED (not fixed) — a text box keeps its measured width with no slack

**Measured.** On the same dashboard, after the fix above, most of the
remaining 14% is one cascade. The banner summary line wraps its last
word ("…need you"), the banner grows 22px, and the schedule card below
shifts down with it, a 142,000-pixel cluster. The source's line is 541px
in a 550px box. "Allergy: None recorded" and "Last visit: Oct 1 · In
person" in the side panel wrap the same way.

**Not the font.** The import substitutes Google's Inter for the site's
own `InterVariable.woff2`, and measured in the source page Google's is
narrower (529.3px vs 541px), not wider.

**Next to check:** the measured width the reducer pins on a text
element, which is rounded up by at most a pixel. Any difference in
metrics, letter-spacing rounding or `font-variant-numeric: tabular-nums`
(not captured) leaves no room. Also seen: in an inline run,
"DOB Dec 12, 1991 · MRN 9001" comes out as "· DOB Dec 12, 1991 MRN 9001".

---

## DEFERRED — the spaces around an inline span are lost

**Measured.** gainwix.com's hero is
`An AI studio for what works <span class="gradient-text">alongside</span> AI.`
Its child nodes are exactly three: `TEXT "An AI studio for what works "`,
the span, `TEXT " AI."` — both boundary spaces live on the text runs.

**Before.** The canvas and the export both render `worksalongsideAI.`
Same on both sides, so not a canvas bug.

**Cause.** Two halves, and only one is in the importer.

The reducer split each text run into a sibling element and trimmed each
one, because a styled span becomes an element and "a host with children
cannot also hold words". That half is fixed: runs now collapse their
whitespace the way CSS does and keep the space at a run's edge, trimming
only the outermost edges as a line box would.

It has **no effect**, because of the second half: `makeBaseline` in
`parseCode/apply.ts` does `raw.text.trim()` on every text element, and
`parseCode` shares it. The model has nowhere to keep a leading or
trailing space, and the generateCode ↔ parseCode round trip depends on
that being true.

**Deferred**, because fixing it is a change to the two core functions
rather than to the importer. Planned in
[`../archive/2026-09-29-inline-spans-plan.md`](../archive/2026-09-29-inline-spans-plan.md), whose
Phase 2 closes it — and which also builds what the bug is really a
symptom of: styling a range of text inside a text element.

**The acceptance test already exists.** Three `it.fails` cases in
`test/importReduce.test.ts`, in the parity harness's `knownGap` style:
the suite stays green while the divergence is recorded, and the day
Phase 2 lands they flip to failing and have to be updated.

---

## NOT REPRODUCED — "the canvas looks nothing like the site

**Measured.** `scripts/canvas-oracle.mjs`, the third oracle, built for
exactly this report. Three screenshots of gainwix.com, canvas captured at
1440x5384 with zoom pinned to 1.000:

| | match |
|---|---|
| source ↔ export | 93.42% |
| source ↔ canvas | **92.98%** |
| export ↔ canvas | **95.93%** |

The canvas is within half a point of the export. Wrong background colours
are not reproduced at all: queried live, the canvas root is 5383px tall
with `rgb(250, 250, 252)` — gainwix's own body colour — and the tokens
resolve correctly on the frame (`--color-text: #13111c`,
`--color-background: #e8e6f0`, `--color-9: #fafafc`).

**What the canvas DOES cost**, from `export ↔ canvas`: every line of text
is ghosted by about a pixel, the whole canvas is 1px taller than the
export, and the footer block differs more than anything else. Worth
chasing, and not what was reported.

**So the report stands unexplained**, and the difference is in the setup,
not the page. This oracle writes generated files into a FRESH project and
opens it. A real import goes through the app into an EXISTING project,
which differs in at least three ways worth testing next:

1. **`canvasWidth`.** The capture is taken at 1440 and this oracle pins
   the project to 1440. A project whose canvas is 1200 renders a design
   laid out for 1440 inside a narrower frame — which would look nothing
   like the site, and is the leading candidate.
2. **Token collision.** An existing theme already holding `--color-text`
   and `--color-background` triggers the `-imported` rename, which this
   oracle never exercises because its theme is the template's.
3. **Timing.** Images download after the view opens, so a canvas looked
   at early is missing them.

**Ask before chasing further:** what is the project's canvas width, and
was the project new or existing?

---

## HARNESS — the canvas oracle reported a catastrophic bug that was its own

First run of `canvas-oracle.mjs` on gainwix: `source ↔ canvas` **20.67%**,
with one cluster of 5.85M pixels — `1440x4080 at 0,1312` — showing the
page correct to y=1312 and **solid black** below. It looked exactly like
the reported bug, and it was entirely the harness.

The window was 1400px tall and the canvas 5383px. Playwright's element
screenshot cannot paint what was never on screen, so everything past the
viewport came back black. The giveaway was in the numbers all along: the
black starts at 1312, which is 1400 less the app chrome.

The DOM said so too — root 5383px tall, correct background — which is why
querying the live canvas beat reasoning about the screenshot. Fixed by
sizing the window to the canvas before capturing.

Two smaller ones from the same build: the crash-reporting consent prompt
covers the whole app on a fresh `userData` dir, so the canvas never
appeared behind it and a selector timeout said nothing about why; and a
hand-rolled project directory the app would not open at all, fixed by
using `projectTemplate` as the e2e fixtures do. Both were found by
screenshotting the window on failure instead of trusting the timeout —
which is now what the script does.

---

## NOTICED (not fixed) — the canvas is not measured by anything

Both harnesses compare the source page against the **exported HTML**. A
user looking at an imported page in Scamp is looking at the **canvas**,
which is a different renderer, and no test compares those two.

A report of wrong background colours on an imported gainwix page could not
be settled because of this. Three candidate causes were ruled out with
evidence — token extraction (score unchanged), the `-imported` rename
remap gap (`importTokens` never writes to `customProperties`), and
`color(srgb …)` syntax (passed through, still renders). One remains
untested: gainwix's page background sits on `<body>`
(`rgb(250, 250, 252)`) with `<main>` transparent, and if the import roots
below `<body>` that background has nowhere to live.

**Superseded** by `scripts/canvas-oracle.mjs` — see the entry above. The
gap this described is closed; what it was chasing is not.

---

## NOT MATCHED, DELIBERATELY

- **`display: contents`, and tables with a `rowspan`.** No equivalent in
  the model. Elements arrive, layout does not. Graded `lost` and reported.
  Any other table is now translated into a grid table and graded
  `approximated` — on a 3-column patient list with a caption, a `colspan`
  footer and collapsed borders, geometry went from 9 elements off (the
  table 720x213 → 720x546, every row stacking its cells) to 25 of 25
  within 2px, and pixels to 99.99%. see `docs/archive/2026-10-05-tables-plan.md`
- **`<canvas>`, `<iframe>`, `<video>`.** Drawn by something other than
  CSS. Masked in the pixel harness, with the masked area printed, because
  diffing them measures nothing.
- **"Hidden below this width."** Scamp can apply per-breakpoint overrides
  but cannot say an element is absent at a narrower width.

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

## DIAGNOSED — line icons import as solid black blobs

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

**The fix behind the fix.** Store `svgSource` as HTML and convert to JSX
only in the generator, where the output actually is React. Today the
conversion happens in the reducer and every consumer that is not React
has to undo it — which none of them does. That would retire this whole
class rather than its third instance.

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
[`../plans/inline-spans-plan.md`](../plans/inline-spans-plan.md), whose
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

- **Tables and `display: contents`.** No equivalent in the model. Elements
  arrive, layout does not. Graded `lost` and reported.
- **`<canvas>`, `<iframe>`, `<video>`.** Drawn by something other than
  CSS. Masked in the pixel harness, with the masked area printed, because
  diffing them measures nothing.
- **"Hidden below this width."** Scamp can apply per-breakpoint overrides
  but cannot say an element is absent at a narrower width.

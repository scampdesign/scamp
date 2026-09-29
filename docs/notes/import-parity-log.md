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

Needs a third oracle: source ↔ canvas. `test/e2e/parity/` is the shape to
copy, including its rule that the oracle must not import from `src/`.

---

## NOT MATCHED, DELIBERATELY

- **Tables and `display: contents`.** No equivalent in the model. Elements
  arrive, layout does not. Graded `lost` and reported.
- **`<canvas>`, `<iframe>`, `<video>`.** Drawn by something other than
  CSS. Masked in the pixel harness, with the masked area printed, because
  diffing them measures nothing.
- **"Hidden below this width."** Scamp can apply per-breakpoint overrides
  but cannot say an element is absent at a narrower width.

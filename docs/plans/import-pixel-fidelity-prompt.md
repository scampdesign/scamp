# Prompt: drive the importer to pixel fidelity

A prompt for Claude Code. Fill in the site list in step 1, then start a
session with:

> Follow `docs/plans/import-pixel-fidelity-prompt.md`.

Everything below the line is addressed to the agent.

**Note:** Point it at a handful of sites, not twenty. Each one is a full
measure-diagnose-fix loop against a real network page, and the value is in
the fixes, which come from reading diffs carefully rather than from
covering more URLs.

---

## What you are doing

Scamp's website importer reads a live page and writes a Scamp view. It is
close — geometry is 89-100% within 2px depending on the page — but
"close" is measured today only by comparing element boxes. Boxes can be
right while colour, weight, shadow, gradient, background, border, image
and stacking are wrong, and none of that is currently measured at all.

Build a pixel-diff harness, then use it in a loop to raise fidelity,
fixing the importer and the canvas until each site's rendered import
matches its source to **99% of pixels** or until you can show why the
remainder is not fixable.

Read `docs/plans/website-import-plan.md` and
`docs/notes/parity-harness.md` before you start. The importer's own
accounting of what it knowingly loses is in
`src/renderer/lib/importReport.ts` — that list is the boundary of what a
diff can fairly ask for.

---

## 1. The sites

Fill this in before starting. Say what each one is here to stress, because
that decides which fixes matter.

| URL | What it stresses |
|---|---|
| | |
| | |
| | |

Keep them stable and public. A page behind a login, a cookie wall, or an
A/B test is not a fixture — it is a different page on each load, and you
will spend the loop chasing the difference between two loads rather than
the difference the importer caused.

---

## 2. What already exists — do not rebuild it

- **`scripts/import-fidelity.mjs`** — the geometry harness. Captures with
  the real `captureScript`, reduces with the real `reduceCapture`,
  generates with the real `generateCode`, renders through
  `buildHtmlExport`, and compares every element's box against its source
  box. Pairing is exact: `reduced.sourceNodes[elId]` says which captured
  node each element came from, so nothing is matched by guesswork. Read
  this file first — the pixel harness is a sibling of it, and most of the
  setup you need is already solved in it.
- **`test/e2e/parity/`** — canvas-versus-browser geometry parity, with
  fixtures and a harness. See `docs/notes/parity-harness.md`.
- **`sharp`** is already a dependency and can read a PNG to a raw pixel
  buffer. A pixel diff is about twenty lines on top of that. **Do not add
  `pixelmatch`, `pngjs`, `looks-same`, or similar** — CLAUDE.md forbids a
  dependency for something achievable in ~20 lines.

## 3. Build `scripts/import-pixels.mjs`

A sibling of the geometry harness, taking the same arguments.

It must:

1. Screenshot the **source** page, full page, at a fixed viewport
   (1440x900) and `deviceScaleFactor: 1`.
2. Capture and reduce that **same page instance** — see the determinism
   rules below for why this is not optional.
3. Render the generated view and screenshot it identically.
4. Diff the two with `sharp`, per channel, with a small per-channel
   tolerance for antialiasing.
5. Report, per site: the percentage of matching pixels, a diff PNG written
   under a gitignored directory, and — this is the part that makes it
   useful — **the bounding boxes of the largest diff clusters, ranked by
   area**, each with the Scamp element under it where one can be found.

Point 5 is the whole design. A percentage is not actionable; the existing
harness says the same thing in its header comment and it is the reason
that harness is worth running. "94.1%" tells you nothing. "one 900x240
cluster over `hero_0a3f`, and 40 small clusters along every text baseline"
tells you there is one layout bug and one font-weight bug.

Add the pixel score to `import-fidelity.mjs`'s output too, or the two
measurements drift apart and only one gets run.

## 4. Determinism rules

Break any of these and the harness will invent bugs that you will then
spend the loop "fixing". The geometry harness carries three separate
comments about times this exact class of mistake produced a wrong
conclusion, so treat this section as load-bearing.

- **Screenshot the source from the same page instance you captured
  from.** Capture, then screenshot, without reloading. Reload between the
  two and a rotating hero, a lazy image, or a randomised testimonial
  guarantees a diff that is nobody's bug.
- **Render the import the way the app does:** the project's `theme.css`
  (it carries the universal `box-sizing: border-box` and the block-margin
  reset) and the page's own fonts, resolved through
  `fontsNeededBy` / `googleFontsUrlFor`. Without the fonts you are
  measuring a fallback typeface, whose metrics differ, which reads exactly
  like the importer getting every height wrong.
- **Wait properly on both sides:** `waitUntil: 'networkidle'`, then
  `document.fonts.ready`, then the importer's own `prepareFn` settle on
  the source.
- **Freeze motion on both sides** — paused animations, no transitions, no
  caret, and `prefers-reduced-motion` — or you are diffing two moments.
- **Hide scrollbars**, and use identical viewport and scale factor on both
  sides.
- **Mask what the importer already declares lost**, rather than chasing
  it: `<canvas>`, `<iframe>`, `<video>`, and anything
  `importReport.ts` marks `lost: true`. Every mask must be **listed in the
  output with its area** — a silent mask is how a harness reports 99% and
  means nothing.

## 5. Rules you may not break to move the number

The exit condition is a number, and the fastest ways to move a number are
all cheating. Explicitly forbidden:

- Special-casing a URL, domain, class name, or site-specific value
  anywhere in `src/`.
- Widening the diff tolerance, changing the viewport, or lowering the
  bar to make a site pass.
- Adding a mask for anything the import report does not already declare
  lost.
- Excluding an offending element from the measurement.

Every fix must be explainable as a general rule about CSS, layout, or the
capture — "a filling `px` grid column should become `fr`", not "this site
needs this". If the only available improvement is site-specific, **stop
and say so**; that is a real finding about the importer's limits and it is
worth more than a fake 99%.

## 6. The loop

Per site, one cause per iteration so the effect is attributable:

1. Measure. Record the score.
2. Take the **largest** diff cluster.
3. Diagnose it to a cause in the capture, the reducer, the generator, or
   the canvas. Read the source element's computed styles and the generated
   CSS side by side; `DUMP=<class>` in the geometry harness prints exactly
   this pair and is the fastest way in.
4. Fix the cause. Add a test if it touches `src/renderer/lib/`.
5. Re-measure. If the score did not move, you fixed something else —
   say so rather than keeping the change silently.

Keep a table of score per iteration per site, so a plateau is visible
rather than inferred.

**Stop when any of these is true**, and write up which:

- The site is at **99%** or better.
- Two consecutive iterations each improved it by **less than 0.5%**.
- The entire residual is inside declared masks or explained by a
  documented limit.

A plateau is a result. Write what the residual is, why it is not
reachable, and what it would take — do not keep grinding. Ask for a
per-site iteration budget if one has not been given.

## 7. Importer or canvas — which oracle answers which

Three different comparisons, and picking the wrong one wastes hours:

| Comparison | Tests | Cost |
|---|---|---|
| source ↔ exported HTML | capture, reducer, generator, exporter | seconds, plain node |
| source ↔ **canvas** | the above **plus** `ElementRenderer` | minutes, needs Electron and a built bundle |
| canvas ↔ exported HTML | canvas against the exporter | `test/e2e/parity/`, already exists |

**Work in the first row.** It is a node script against `.ts` sources and
it iterates in seconds. Only reach for the canvas when a defect does not
reproduce in the export — then it is a canvas bug by elimination, and
`test/e2e/parity/` is where it belongs as a regression test.

When you do test the canvas, respect the parity harness's rule: **the
oracle must not import from `src/`.** An oracle sharing code with the
thing it checks can agree with it while both are wrong. Do not diff the
canvas against `buildHtmlExport` output and call it verification of the
canvas.

## 8. Repo discipline that will bite you

- **The shim trap, with one exception in your favour.** Every `.ts` has a
  committed `.js` shim, and Vite and Vitest prefer the shim — so an edit
  to `importReduce.ts` does nothing in the app or in e2e until you run
  `npx tsc --build tsconfig.web.json --force` (and
  `tsconfig.node.json --force` for main-side edits). **The exception:**
  `import-fidelity.mjs` bundles the `.ts` files directly through esbuild,
  so it sees your edits immediately. That asymmetry is a trap in both
  directions — a fix that shows up in the harness and not in the canvas is
  usually a stale shim, not a canvas bug.
- **Never regen shims while `npm run dev` is running.** It reloads store
  modules mid-session and drops the open project's in-memory state.
- **e2e runs the built bundle in `out/`.** `npm run build` first or you
  will diagnose against stale code. This has already cost a wrong
  conclusion twice.
- The `generateCode` ↔ `parseCode` round trip must keep passing. It is the
  most important contract in the repo.
- No `any`. Anything in `src/renderer/lib/` needs meaningful tests, and a
  new test must fail without its fix — check that it does.
- If you change behaviour a `docs/notes/` file describes, update the note
  in the same commit.

## 9. What to leave behind

- `scripts/import-pixels.mjs`, documented at the top the way the other
  scripts are: what it does, how to run it, and what its output means.
- A note under `docs/notes/` recording the final score per site, every
  mask and why it is fair, and the diagnosis of each residual.
- Tests for every reducer or generator fix.
- One commit per cause, with the before and after score in the message. A
  commit that says "hero was 240px too tall because a filling px grid
  column was not converted to fr; scamp.club 91% → 96%" is the artefact
  that makes the next round cheap.

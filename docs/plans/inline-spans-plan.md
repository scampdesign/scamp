# Inline spans: styling a range of text

Select some words inside a text element, change their style, get a
`<span>` around exactly those words. And, from the same change: an
imported `works <span>alongside</span> AI.` stops arriving as
`worksalongsideAI.`

These are one problem. The importer bug is what a missing feature looks
like from the outside.

---

## What Scamp can represent today

A text element holds a single `text` string. There is a second
mechanism — `inlineFragments` — added for import, which can put markup
between an element's children:

```ts
inlineFragments: Array<
  | { kind: 'text'; value: string; afterChildIndex: number }
  | { kind: 'jsx'; source: string; afterChildIndex: number }
>
```

`ElementRenderer` composes `text`, then fragments and children by
`afterChildIndex`, and **disables `contentEditable` when it composes**
(`isComposed`). So today a text element is either editable *or* has
inline structure, never both.

Two consequences, and the second is the one that bites:

- **There is no model for "this range of the text is styled".** A
  fragment is `jsx` — an opaque string — not a styled range with its own
  properties. Nothing can select it, and the properties panel has nothing
  to show for it.
- **A text element's text is trimmed.** `makeBaseline`
  (`parseCode/apply.ts:191`) does `raw.text.trim()` for every text
  element, and `parseCode` shares it, which is what keeps the round trip
  stable. So a leading or trailing space has nowhere to live.

That second one is the whole import bug. `works <span>alongside</span>
AI.` captures as three runs — `"…works "`, the span, `" AI."` — and the
reducer already computes them correctly with both spaces. `makeBaseline`
then trims them off. There are three `it.fails` tests in
`test/importReduce.test.ts` recording exactly this.

---

## The shape to build

**A text element's content becomes a list of runs, not a string.**

```ts
type TextRun = {
  text: string;
  /** Absent for the unstyled majority of runs. */
  style?: {
    color?: string;
    backgroundImage?: string;   // gradient text
    fontWeight?: number;
    fontStyle?: string;
    textDecorationLine?: string;
    /** Anything else, as CSS. Keeps the model open. */
    customProperties?: Record<string, string>;
  };
  /** A run can be a link without being a separate element. */
  href?: string;
};
```

A text element holds `runs: TextRun[]`. A single unstyled run is the
common case and should cost nothing — see Phase 1.

**Why runs rather than child elements.** The importer currently turns a
styled span into a *sibling element*, which is what forces the
"container cannot also hold words" rule, which is what splits the text,
which is what loses the spaces. Runs keep the sentence one element.
They also match what a person means: `alongside` is not a box inside the
headline, it is three words that are a different colour.

---

## Phases

Each one ships on its own and leaves the round trip green.

### Phase 1 — runs in the model, one run in practice — **DONE**

Add `runs` beside `text`. A text element with plain text has exactly one
run and behaves identically; `text` becomes a derived convenience
(`runs.map((r) => r.text).join('')`).

- `generateCode` emits a single run exactly as it emits `text` today, so
  every existing file is byte-identical.
- `parseCode` reads one `{children}` string into one run.
- The round-trip invariant is the acceptance test, unchanged.

**Stop here and make sure nothing moved.** This phase is deliberately
invisible.

**Landed 2026-09-29.** `src/renderer/lib/textRuns.ts` with 31 tests,
`ScampElement.runs?` (absent means one unstyled run of `text`), and
`generateCode` emitting through `textFromRuns(runsOf(el))`.

Nothing writes `runs` yet, which is the point. Verified beyond the
suite: gainwix.com generated before and after the change is
**byte-identical**, 81,809 bytes of TSX and 65,154 of CSS.

What it front-loads is the part later phases cannot be written without —
`splitAt` over joined-text offsets (what a DOM selection reports),
`applyStyleToRange`, `mergeRuns`, and `styleOfRange`, which returns the
shared style AND the list of properties that are mixed. That last one is
the Phase 4 panel's answer to showing red for a red-and-blue selection.

### Phase 2 — whitespace survives — **DONE**

With runs in place, `makeBaseline`'s trim becomes wrong rather than
load-bearing: trim the *element's* first and last run at their outer
edges only, and leave interior boundaries alone.

- `generateCode` emits a leading or trailing space as `{' '}` in JSX,
  which is the standard way to keep one, and `parseCode` reads it back.
- The three `it.fails` tests in `importReduce.test.ts` flip to passing
  and their `it.fails` comes off. That is the acceptance test, and it
  already exists.

**The import bug is fixed at the end of this phase**, before any UI
exists.

**Landed 2026-09-29.** The trim MOVED rather than went away: it now
lives in the TSX parser, which is the only place that knows the
whitespace came from the generator's own indentation. `makeBaseline` no
longer trims, so the importer's text keeps its spaces.

The generator writes an edge space as `{' '}` — not whitespace, so it
survives being indented onto its own line — and the parser decodes it
*after* trimming. `test/textEdgeWhitespace.test.ts` pins both
directions, including that ordinary text gains no token.

gainwix.com's hero now renders `works alongside AI.` where it read
`worksalongsideAI.`

One correction to the rule as written above: trim at the line's own
edges means the first and last ITEM, not the first and last text run.
Using text runs collapsed the gap in `<b>a</b> <i>b</i>` to nothing —
that run is the only text, so it counted as both edges and lost the
space that IS its content.

### Phase 3 — render styled runs

`ElementRenderer` renders runs as `<span>`s with their styles. A text
element with multiple runs is still a text element — not composed, not
`isComposed`, so it keeps `contentEditable`.

This is where the parity harness earns its keep: a fixture with styled
runs, canvas against browser, geometry compared. A run must not change
where any word sits.

### Phase 4 — select a range and style it

The feature as asked for.

- On a text element in edit mode, a selection within the text enables
  the typography and colour controls.
- Committing a change splits the runs at the selection boundaries and
  applies the style to the covered runs.
- Adjacent runs with identical styles merge on commit, or the model
  accumulates junk runs as someone works.
- The properties panel shows the selection's style, and **mixed values
  need a state**: two runs with different colours must not display as
  one of them. Agent-native's parity log records Figma showing
  "Click + to replace mixed content" for this; the panel needs its own
  answer, decided before the control is built.

### Phase 5 — the importer stops splitting

`inlineToFragments` becomes `inlineToRuns`: a styled span in a captured
run becomes a styled run rather than a sibling element. The
"container cannot also hold words" split goes away for the inline case,
and `inlineFragments`' `jsx` kind can be retired once nothing produces
it.

---

## Decisions to make before Phase 4

**What a run may carry.** Colour, weight, style, decoration and a link
are clearly in. Anything that affects *layout* — margin, display, width —
is not a run, it is an element, and the panel has to refuse it rather
than write CSS that does nothing. That boundary needs to be explicit in
the model, or the panel will offer controls that silently do not apply.

**What happens on Enter.** A styled run at the caret: does typing
continue the style or leave it? Every editor answers this and users
notice the answer.

**Undo granularity.** One style change over a selection is one undo step,
including the run splitting. The history already works per page; run
edits must not become three steps.

---

## What not to do

**Don't reuse `inlineFragments`' `jsx` kind for this.** It is an opaque
string. Nothing can select it, style it, or show it in the panel, and it
is exactly why the current import produces text nobody can edit. It was
right for "keep this markup intact"; it is wrong for "these words are
different".

**Don't make a styled range a child element.** That is the current
behaviour and the cause of the bug this plan opens with.

**Don't skip Phase 1's invisibility.** A model change that also changes
output cannot be told apart from a regression by any test in the repo.

---

## Where this bites the importer today

`docs/notes/import-parity-log.md` should get an entry when Phase 2 lands.
The measurement already exists: gainwix.com's hero reads
`worksalongsideAI.` in both the canvas and the export, against
`works alongside AI.` on the page.

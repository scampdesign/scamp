# Inline tags inside a sentence

A text element's words are a list of runs (see
[../archive/2026-09-29-inline-spans-plan.md](../archive/2026-09-29-inline-spans-plan.md)). Until
2026-10-12 a run could only be a styling `<span>`. Any other inline tag in
a sentence — `<em>`, `<strong>`, a link — was kept as a JSX fragment, and
a fragment is placed relative to the element's *children*, not within its
words. So `Hello <em>world</em> again` was saved as
`Hello  again <em>world</em>`, and opening a page was enough: Scamp
rewrites an agent-written file into its canonical form on load.

## Runs now carry tags and markup

`TextRun` (`@lib/textRuns`) has two more fields:

- **`tag`** — one of `INLINE_RUN_TAGS` (`em`, `strong`, `b`, `i`, `code`,
  `mark`, `sub`, `sup`, …). `<em>world</em>` is `{ text: 'world', tag:
  'em' }`, and `<em className={styles.x__r1}>` is the same with a style.
- **`markup`** — inline markup Scamp doesn't model (attributes, nested
  tags, a binding like `<em>{name}</em>`), kept verbatim. `text` is its
  words, so everything that reads the sentence still works. A markup run
  is never split, styled, or merged.

`runFromMarkup(source)` decides which: an `INLINE_RUN_TAGS` tag holding
only words (string literals like `{' '}` allowed, no other braces) is a
tagged run; anything else is markup.

## Where it's read and written

| | |
|---|---|
| **Parse** (`parseCode/tsx.ts`) | An unclassed tag in a text element is recorded as a `markup` piece in source order. When the element has no element children, the pieces become runs and the JSX fragments are dropped. Adjacent text chunks are joined first: htmlparser2 splits words at an entity, and each chunk would otherwise be its own run. |
| **Generate** (`generateCode/tsx.ts`) | A run is written as its tag (or `span`), with a run class only when it has style of its own (a `span` always keeps its class, or it would read back as markup), and markup as written. CSS rules are written only for runs with style. |
| **Canvas** (`ElementRenderer.tsx`, `renderRun`) | Both the page renderer and the instance renderer draw a tagged run with its tag and markup sanitized in place. |
| **Export** (`generateHtml.ts`, `runsHtml`) | Writes runs in order. Before this the export wrote a text element's plain words and dropped styled runs entirely. |
| **Import** (`importReduce.ts`) | A captured sentence of words and inline markup, with no element in it, becomes runs. As fragments it was written one per line, which also lost the spaces around them. |

## Not covered

A text element that also holds element children (an `<em>` with its own
`data-scamp-id`, say) still writes its words first and its children
after. That shape is rare, and fixing it means positioning the element's
own words between children rather than as one string.

The panel still styles a selection with a `<span>`; making a selection an
`<em>` would be a new control.

Tests: `test/inlineRunTags.test.ts`.

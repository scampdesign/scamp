---
title: View lint — what a file lost on the way in
related:
  - src/renderer/lib/viewLint.ts
  - src/renderer/lib/canvasSnapshot.ts
  - src/main/mcp/tools.ts
  - src/main/mcp/protocol.ts
---

# View lint — what a file lost on the way in

A view can parse perfectly and still arrive degraded. The parser never
throws away what it can't model — unknown CSS goes to
`customProperties`, an expression outside the binding grammar is kept
verbatim, an undeclared token is passed through to the browser — so
every one of those cases produces a complete, correct-looking element
tree. `lintView` is the difference between "it parsed" and "it arrived
intact".

This matters because of what we told agents to do. The MCP server's
instructions said to confirm a write with `scamp_get_element_tree`,
which reports ids, classes, and tags. For the whole class of failures
below, that tree looks perfect.

## The case that motivated it

`src={photo.src}` on an `<img>` parsed to the literal string
`"__scamp_bind__:photo.src"` — Scamp's own pre-tokenizer marker,
leaked into a typed field because `src` skipped the binding decode.
The canvas rendered a dead URL, and a regeneration wrote the marker
back into the TSX. See `docs/notes/view-bindings.md` for the fix and
`docs/plans/agent-framework-gap-report.md` for how it was found.

The `marker-leaked` rule exists so the next typed field that bypasses
`decodeBinding` is caught the first time anyone checks a view, rather
than by reading a rendered page and wondering why an image is broken.
It is a self-check on the parser, not a check on the author's file —
its hint says so.

## The rules

| Kind | Fires when | Why it isn't noise |
|---|---|---|
| `marker-leaked` | A typed field or attribute still holds `BIND_MARK` | Always a parser bug; never something an author can write |
| `binding-not-parsed` | An attribute value is a verbatim `{expr}` | Renders, round-trips, but the Data tab can't show it and the props type doesn't declare it |
| `not-panel-editable` | A `customProperties` key that `isMappedProperty` knows | The mapper refused the VALUE — a typed control exists and went blank |
| `side-not-typed` | A per-side longhand of a typed shorthand | `border-bottom` renders and drops out of the panel; naming the shorthand is the actionable part |
| `undeclared-token` | `var(--x)` with no declaration in `theme.css` | Resolves to nothing at render time |
| `raw-text-fragment` | Non-whitespace text directly in a container | Not selectable, not editable, clutters the layers panel |
| `repeat-rows-differ` | Sample rows disagree on their fields | The row type comes from the first row; later rows render blanks |
| `missing-sample` | A bound prop with neither sample nor literal | Renders empty on the canvas, which reads as a broken binding |
| `table-structure` | A table, section or row holds something a browser won't leave there | The HTML parser moves it in the exported page, while the canvas — built without that parser — shows it in place |
| `table-cell-width` | A cell in a grid table has a width of its own | The column owns it; two widths disagree the moment either changes |
| `table-rowspan` | A cell carries `rowSpan` > 1 | Each `<tr>` is one row of the table's grid, so it can't span |
| `table-repeated-style` | Every row repeats one `border-bottom`, or every cell one `padding` | The per-row duplication tables exist to remove; the hint gives the one derived rule Scamp reads as the table's setting |

A row's `border-bottom` is exempt from `side-not-typed`. Its advice —
"write `border` with all four sides" — is wrong for a table row, whose
divider belongs on the table; `table-repeated-style` says that instead.
see `docs/plans/tables-plan.md`

What the rules deliberately DON'T report is the larger set: a property
with no typed field at all. `aspect-ratio`, `object-fit`, `overflow`,
`text-transform` and friends land in `customProperties` because that is
where they belong, and `agent.md` tells agents to write them freely. A
linter that flagged those would be ignored within a day, which is worth
more than the handful of extra findings.

`isMappedProperty` is what separates the two, so the split stays
correct as `cssPropertyMap` grows. `TYPED_SHORTHAND_FOR` is checked
first, because `border-top-width` is both a side AND mapped, and "write
`border-width`" is more use than "this value didn't parse".

A boolean attribute never produces `missing-sample`. Its sample IS its
presence, and the bag stores present as `''` — so both present and
absent are complete samples, and an emptiness check reads the wrong
thing. `disabled={!canStart}` on the contract fixture was the false
positive that made the point; the rule skips `BOOLEAN_ATTRIBUTES`.

## Two ways in

`scamp_check_view` is the whole report for one page, view, or
component, and `scamp_check_project` runs it on all of them. `scamp_get_view_props` also
carries a `warnings` field holding the same findings, because that is
the call an agent makes before writing a route — and the props type can
read as complete and correct while a binding behind it is already gone,
which is precisely what the `<img>` src bug did. Both run the same
`lintView`, so they can't disagree.

## Shape and ordering

Findings carry the element id AND the class name: the id is how the
other MCP tools address an element, the class is how an agent finds the
line in the file. They come back in document order rather than
element-map order, so a list of them reads down the file.

`lintView` is pure and takes the parsed tree, never the source text.
That is deliberate — it reports what the canvas will actually show,
which is the question an agent is really asking. It does mean the
linter can't say anything about the file's formatting, and it can't
distinguish a value the author wrote from one a canvas edit produced.
Neither has come up.

## Where it's wired

`getViewCheck` in `canvasSnapshot.ts` resolves the same names
`scamp_get_view_props` takes (view name, component name, or a view
page's route slug) and answers from the store's component trees, so an
agent that just wrote a view can check it without first working out
what Scamp calls the thing. `answerSnapshotTool` dispatches it; the
renderer's `mcpResponder` needs no change, since it routes every
snapshot tool generically.

The tool descriptor in `main/mcp/tools.ts` is what tells an agent when
to reach for it, and `SERVER_INSTRUCTIONS` in `protocol.ts` now points
at `scamp_check_view` for verifying work rather than at
`scamp_get_element_tree`. Those two strings are the whole of the
feature as far as an agent is concerned; `test/mcpTools.test.ts` asserts
them like behaviour.

## Every page, not only the open one

`scamp_check_view` and `scamp_check_project` are answered by
`syncBridge/agentChecks.ts`, over the agent-edit channel (15s, not the
2s read): it reads the project from disk when asked, parses every page,
view, and component, and swaps in the live canvas for the open one, so
unsaved edits count. Reading fresh is the point — the `componentTrees`
cache only rebuilds on a project re-read, which an outside edit to a
closed view doesn't always cause (macOS reports it as a change), and it
never held plain pages. `lib/projectCheck.ts` is the pure part: run
`lintView` over the targets, keep the ones with findings, and resolve a
name (exact, a view's route slug, then case-insensitive). The headless
runner has no disk, so it answers from its snapshot trees
(`getProjectCheck` in `canvasSnapshot.ts`).

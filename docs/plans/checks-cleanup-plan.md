# Checks that mean something

Status: in progress, 2026-10-13. Check a box when the item is merged.

Running `scamp_check_project` on an imported project returned 423
findings, and an agent asked to fix them refused, rightly: every one of
them renders correctly, and "fixing" most would change the layout.

| Count | Flagged | Why |
|---|---|---|
| 333 | `display: inline` / `inline-flex` | The panel models only block, flex, grid |
| 50 | Table structure | False alarm: an instance of a component whose root is `<tr>`/`<th>` reads as a `<div>` |
| 22 | `margin: … auto` | Spacing fields hold px or a token, not `auto` |
| 12 | `display: contents` | Same as the first row |
| 2 | `box-shadow: var(--shadow-card)` | The shadows control reads only explicit layers |
| 2 | `display: list-item` | Same as the first row |
| 1 | `tabIndex={-1}` | Correct as written |
| 1 | `text-align: -webkit-center` | Correct as written |

Two causes. The checker reports "breaks the page" and "the panel has no
control for this value" the same way (`not-panel-editable` in
`viewLint.ts`), so an agent reads valid CSS as an error. And the panel
really can't edit some common values.

## 1. Separate problems from notes

- [x] Done — `severity` on every finding (`severityOf` in `viewLint.ts`); `scamp_check_project` returns `problems`, `notes`, `withFindings`, `withNotesOnly`, and `aboutNotes`; `scamp_check_view` returns `findings` and `notes`; the Checks badge counts problems and lists notes under **Edit in CSS**; post-edit feedback and `scamp_get_view_props` warnings are problems only.

Every finding gets a `severity`:

- **`problem`**: the page renders or exports wrong, or something is
  unreachable: a leaked marker, a binding kept as text, an undeclared
  token, loose text, rows that disagree, a missing sample, every table
  rule.
- **`note`**: renders correctly, but the panel can't show it in a
  control — edit it in the CSS panel: `not-panel-editable`,
  `side-not-typed`.

Then:

- `scamp_check_project` counts and lists problems first; notes go in a
  separate `notes` list per target, with a line saying they're valid CSS
  to leave alone.
- `scamp_check_view` returns `findings` (problems) and `notes`.
- The **Checks** section's count is problems only; notes show under an
  **Edit in CSS** heading.
- The Scamp Agent's post-edit feedback reports problems as before and
  notes as "edit in CSS" lines, not "Check:".
- Tool descriptions and `agent.md` say notes aren't to be "fixed" by
  rewriting the value.

## 2. Table false alarm

- [x] Done — `lintView` takes `componentRootTags`; the table-structure rule reads an instance as its component's root tag. Passed by the MCP checks, the snapshot answers, and the Checks section. The agent's post-edit feedback doesn't have the trees, so it still reads an instance as a `<div>` there.

`lintView` takes each component's root tag. An instance is checked as
its component's root tag — a `<tr>` component inside a `<tbody>` is a
row, as the exported page draws it.

## 3. More display values in the panel (plan)

- [ ] Done

The model has `display: 'none' | 'flex' | 'grid'` (`'none'` meaning
block). Every other value stays in `customProperties` as raw CSS: it
renders, but the panel can't show or change it, and the checker flags
it. Imports bring these values constantly.

### Model

One new optional field beside `display`, for how the box sits in its
parent:

```ts
displayOuter?: 'inline' | 'inline-block' | 'contents' | 'list-item';
```

| CSS | `display` | `displayOuter` |
|---|---|---|
| `block` (default) | `none` | — |
| `inline` | `none` | `inline` |
| `inline-block` | `none` | `inline-block` |
| `contents` | `none` | `contents` |
| `list-item` | `none` | `list-item` |
| `flex` | `flex` | — |
| `inline-flex` | `flex` | `inline` |
| `grid` | `grid` | — |
| `inline-grid` | `grid` | `inline` |

Flex and grid accept only `inline`. Splitting it this way keeps every
existing "is this a flex or grid container?" check correct with no
change — `inline-flex` is a flex container.

### Where it reaches

- **Parse** (`cssPropertyMap.ts` `display`): the table above in reverse.
  Values not in it (`flow-root`, `table-*`, `ruby`, …) still go to
  `customProperties`.
- **Generate** (`generateCode/declarations.ts`): emit the combined
  keyword. Same string as today, so files don't change meaning; the
  declaration may move from the end of the rule to its typed position on
  the first save, which is a cosmetic diff.
- **`effectiveDisplay.ts`**: read the typed fields; drop the
  `customProperties['display']` special case.
- **Panel** (`LayoutSection.tsx`): the layout mode picker stays block /
  flex / grid; add a **Display** select beside it — Block, Inline, Inline
  block, Contents, List item for block; Block / Inline for flex and grid.
- **Canvas** (`elementToStyle.ts`, `ElementRenderer.tsx`): render the
  combined keyword. `contents` has no box of its own, so it can't be
  clicked on the canvas; select it in the layers panel. Worth a line in
  the user doc.
- **Import** (`importReduce.ts`): already writes these values; they
  arrive typed with no change.
- **Agent** (`agentEdits.ts`): goes through the same property map.

### Tests

- Round-trip each row of the table, alone and with flex/grid props.
- Unknown values still preserved verbatim.
- `effectiveDisplay` answers flex for `inline-flex`, grid for
  `inline-grid`.
- An existing file with `display: inline-flex` in the custom block
  reads, saves, and reads back to the same model.
- E2E: pick **Inline** for a text element, the file says
  `display: inline`, the Checks note is gone.

### Risks

- The first save of an imported page may reorder its `display` line.
- `contents` on the canvas: no box, no hover outline.

## 4. `auto` in margins

- [ ] Done

`SpaceValue` gains `{ kind: 'auto' }` for margins only (padding can't be
auto). Spacing fields accept and show `auto`; generate and parse round
trip it. Clears the 22 `margin: … auto` notes.

## 5. A shadow as one token

- [ ] Done

The shadows control accepts `box-shadow: var(--token)` as a single
token value, shown like a color token. Clears 2 notes.

## 6. Leave correct values alone

- [ ] Done

`tabIndex={-1}` and `text-align: -webkit-center` are right as written.
If either still shows after 1, add it to an allow-list in `viewLint.ts`
rather than build a control.

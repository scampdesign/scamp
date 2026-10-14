# Edit every selected element at once

Status: **phase 1 built**, 2026-10-14. Phase 2 (Mixed) is not started.

Story: "Edit every selected element at once", the first bug in
`docs/backlog-open.md`.

> Selecting multiple elements and applying color, border or size
> changes. The changes would be reflecting on only one component (1st
> selected item only)

## Why it happens

The panel is built around one element:

- `UiPanel` and `PropertiesPanel` read `selectedElementIds[0]`, the
  first element you selected, and pass it to every section as
  `elementId` (`UiPanel.tsx:35`).
- Each section reads that element with `useResolvedElement(elementId)`
  and writes with `patchElement(elementId, …)` or
  `patchCustomProperties(elementId, …)`. Background, Border, Size,
  Spacing, Typography, and Layout all do this.
- Nothing reads the rest of the selection. The one exception is Export.

So the first element changes, the others don't, and nothing on screen
says why.

## What we can build on

- **Routing per element.** `applyPatchWithAxisRouting`
  (`store/canvas/patchRouting.ts`) already sends a change to the right
  place: the base, the active breakpoint's override, or the active
  state's override. Calling it per element gives every selected element
  its own correct override.
- **History.** `commitElementsToHistory` takes a list of
  `elementIds`, so one undo step can cover every element changed.
- **The text-runs Mixed handling** (`styleOfRange` in
  `lib/textRuns.ts`) is the model for showing "these disagree".

## The approach

### 1. One store action that patches many elements

```ts
patchElements: (
  ids: ReadonlyArray<string>,
  patchFor: (resolved: ScampElement, el: ScampElement) => Partial<ScampElement> | null
) => void;
```

- **One write.** It runs inside a single `set()`, applies
  `applyPatchWithAxisRouting` to each element, and commits one history
  entry over all the ids it changed.
- **A function, not a fixed patch.** `patchFor` returns each element's
  own patch, worked out from that element. This matters for
  `customProperties`:
  - Today `patchCustomProperties` merges into the *first* element's map
    and writes the whole map back.
  - Fanned out unchanged, that would copy the first element's custom
    CSS onto every element.
  - Instead, each element merges the change into its own map.
- **Same guards as `patchElement`.** It does nothing while a snapshot
  preview is showing, and it clears the duplicate-declaration flag for
  each element it touches.

### 2. A pure rule for what fits which element

New file `src/renderer/lib/multiEdit.ts`, fully tested.

`fitPatch(el, patch, ctx)` drops the keys that don't apply to an element
and returns what's left, or null when nothing is left:

| Keys | Apply to |
|---|---|
| Typography (font family, size, weight, line height, letter spacing, text align, and so on) | Text and input elements |
| Container layout (`display` as flex or grid, direction, gap, alignment, grid template) | Not text, not input |
| `x`, `y` | Not the root; not children of a flex parent |
| Margin | Not the root |
| Anything but width and height | Not component instances (the page owns only an instance's size, see `docs/notes/components-data-model.md`) |
| Identity and content (`name`, `tag`, `text`, `attributes`, `svgSource`, `selectOptions`, and the rest of `BASE_ONLY_PATCH_FIELDS`) | The first element only, never fanned out |

The last row stops a rename from giving five elements the same class
name.

### 3. Sections write through one hook

```ts
// store/hooks/usePanelPatch.ts
const { patchElement, patchCustomProperties } = usePanelPatch();
```

- **Same signatures** as the store actions, so each section changes one
  line, the line where it gets `patchElement`.
- **When it fans out:** if the element being patched is the one the
  section reads from, and more than one element is selected, it calls
  `patchElements(selectedIds, el => fitPatch(el, patch, …))`.
- **Otherwise** it calls through to `patchElement` as today.
- **Callers outside the panel are unaffected.** The canvas, the agent,
  text editing, and the layers panel keep calling `patchElement`
  directly.
- **The reset-at-breakpoint action** (`resetElementFieldsAtBreakpoint`)
  gets the same treatment, so "reset to desktop" resets the whole
  selection.

### 4. The panel shows what fits any selected element

- **A section shows if it fits at least one selected element.** Today
  the first element's type decides which sections show.
- **Each section reads from the first selected element it fits.** For a
  rectangle and a text element, Typography reads from the text
  element.
  - `UiPanel` works out a per-section `elementId`.
  - The sections themselves keep taking a single `elementId`, unchanged.
- **A one-line header**, "3 elements selected", appears at the top of
  the panel. You can see the panel is acting on all of them before you
  change anything.
- **Sections that stay first-element-only:**
  - Element (name, tag, attributes, and link)
  - Position (see question 1)
  - Image source
  - Table style
  - Data

  Each gets a hint: "Applies to the first selected element."

### 5. Mixed values

`useMixedFields(sectionElementId)` compares the resolved values of the
selected elements that fit the section, at the active breakpoint and
state, and reports which keys disagree.

- **The controls those six sections use gain `mixed?: boolean`:**
  `ColorInput`, `NumberInput`, `PrefixSuffixInput`, `EnumSelect`,
  `SegmentedControl`, `FourSideInput`, and the font picker.
- **When `mixed` is true:**
  - Text fields are empty, with the placeholder **Mixed**.
  - Segmented controls show no choice.
  - A color swatch shows **Mixed**.
- **Typing into a Mixed field sets every element**, through step 3.
- **Lists** (Shadows, Filters, Transitions, Animation) use Figma's rule.
  When the lists differ, the section shows **Mixed** and a **+**, and
  adding a row replaces every list with that one row. When the lists
  are equal, editing a row edits it in all of them.

### 6. Live preview

`controls/livePreview.ts` styles the DOM directly during a slider drag,
by element id, before the store commits. It needs to style every
selected element that fits, or a drag would show one element moving and
then snap the rest into place when you let go.

## Phases

### Phase 1: the change reaches every element — **built**

This fixes the bug as reported. It covers steps 1 to 4, and step 6.

- With several elements selected, a change in Background, Border, Size,
  Spacing, Typography, or Layout lands on every element it fits.
- Each change is one undo step.
- At a breakpoint or in a state, each element gets its own override.
- The panel says how many elements are selected.
- Fields show the first element's values, as today.

### Phase 2: Mixed

Step 5: fields that disagree read **Mixed**, and the list sections get
the replace-on-add rule.

## Tests

### Unit tests

`test/multiEdit.test.ts` covers:

- **`fitPatch`:** every row of the table, a patch that fits nothing
  (returns null), and identity keys dropped.
- **`patchElements`:**
  - one history entry for three elements
  - a breakpoint routes each element into its own override
  - a state does the same
  - `customProperties` merged per element, with element B's custom CSS
    kept
  - nothing written during a snapshot preview
- **`useMixedFields`:** values that agree, values that differ, and a
  value that's only set at the breakpoint.

### End to end

`test/e2e/properties-panel/multi-select.spec.ts` covers:

1. Select two rectangles and change the background. Both CSS blocks
   change, and one **Undo** restores both.
2. Select a rectangle and a text element and change the font size. Only
   the text element's block changes.
3. Select two elements with different border widths. The field reads
   **Mixed**, and typing `2` sets both. (Phase 2)
4. At the tablet breakpoint, change the padding on two elements. Both
   blocks get the change inside the `@media` rule.
5. Rename with two selected. Only the first element is renamed.

## What phase 1 built

Three changes from the plan:

- **No new store action.** `patchElements` turned out to be
  unnecessary. The history store already has transactions, so
  `store/selectionPatch.ts` calls the existing `patchElement` (or
  `patchCustomProperties`) for each selected element inside one
  transaction. That gives one undo step, each element's own breakpoint
  or state routing, and custom CSS merged into each element's own map.
  The fit rule is `lib/multiEdit.ts` (`fitPatch`, `leadFor`,
  `SECTION_FITS`).
- **Fits per section, not per key.** Each section passes its fit
  (`SECTION_FITS.typography`, `.layout`, `.display`, `.size`, `.box`).
  `fitPatch` also drops an element's own fields (name, tag, text, SVG
  source, and so on) for every element but the one the section read,
  and drops margin for the root.
- **Single-element sections are hidden, not hinted.** With two or more
  elements selected, `MultiSelectionPanel` shows Typography, Size,
  Layout, Display, Spacing, Background, Border, Visibility, and Export,
  under a "N elements selected" line. The rest only show for one
  element:
  - Element, Position, Image, Table style, and SVG edit one element's
    own things. SVG colors rewrite the icon's source, so they can't be
    copied across.
  - Shadows, Filters, Transform, Transitions, and Animation are lists,
    which wait for phase 2's Mixed rule.

Live preview (`controls/livePreview.ts`) styles every selected element
the section fits.

Not covered yet, for phase 2:

- The override dot's reset and a section's eye toggle act on the first
  element only.
- A patch a section computes from the first element writes that
  element's values for every key in it. For example, the column gap
  field writes both gaps, so the row gap follows too.

Tests: `test/multiEdit.test.ts` (16 cases) and
`test/e2e/properties-panel/multi-select.spec.ts` (background plus undo,
typography reaching only text, and tablet overrides).

## Not in scope

- **Resizing or moving several elements on the canvas** with the
  handles. Dragging a multi-selection already works; resizing a group
  is a separate feature.
- **Relative changes**, such as "add 4px to each".
- **Agent and MCP edits.** They already take a list of elements.

## Questions for you

1. **Should Position fan out?** Figma sets every selected element to the
   same X and Y. That stacks them, and for elements in different
   parents the same numbers land in different places on screen. I've
   left Position on the first element only. Say if you want Figma's
   behaviour.
2. **Which sections should show for a mixed selection?** The story says
   Typography with a rectangle and a text element applies to the text
   element. That means showing a section if *any* selected element fits
   it. Figma shows only what *every* selected element shares. I've
   followed the story; say if you'd rather have Figma's rule.

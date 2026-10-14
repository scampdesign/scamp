# Plan — Visual Layout controls (flex alignment grid + CSS grid builder)

## Context

The Layout section (`src/renderer/src/components/sections/LayoutSection.tsx`) drives an
element's flex/grid layout entirely through **native dropdowns and free-text inputs**:

- Flex alignment is two `EnumSelect` dropdowns (`alignItems`, `justifyContent`).
- A CSS grid is defined by two opaque free-text fields (`gridTemplateColumns`,
  `gridTemplateRows`) — the user has to hand-type `1fr 1fr 200px`.

This is slow and unintuitive compared to Figma. We're adding two more **visual** controls:

1. **Flex alignment**: a Figma-style clickable **3×3 alignment grid** for the 9 packed
   positions, sitting *above* the existing Align/Justify dropdowns. The dropdowns stay to
   carry the values a 3×3 grid can't express (`space-between`, `space-around`, `stretch`).
2. **CSS grid builder**: a **quick N×M matrix picker** to create a grid fast, plus a
   **per-track chip editor** (size + type, add/remove) with a **proportional preview**, and
   a **text fallback** for templates too complex to model structurally.

Both keep the store's existing string/enum fields — no schema change. The new logic that
needs it is isolated in pure `@lib/` modules so it's fully unit-tested (per CLAUDE.md).

Confirmed decisions: alignment = **3×3 grid + keep dropdowns**; grid = **quick picker +
track editor** (full build).

---

## Feature A — Flex alignment 3×3 grid

### A1. Pure mapping helper — `src/renderer/lib/alignmentGrid.ts` (NEW, tested)

The 3×3 grid maps a cell `(col 0-2, row 0-2)` ↔ `{ alignItems, justifyContent }`, with axis
assignment flipping by `flexDirection`:

- **row**: horizontal axis = `justifyContent` (main), vertical axis = `alignItems` (cross).
- **column**: vertical axis = `justifyContent` (main), horizontal axis = `alignItems` (cross).

Only the *packed* triples map: `justifyContent ∈ {flex-start, center, flex-end}` and
`alignItems ∈ {flex-start, center, flex-end}`. Exports:

```ts
export const cellToFlexAlign = (
  col: 0|1|2, row: 0|1|2, direction: FlexDirection
): { alignItems: AlignItems; justifyContent: JustifyContent };

// null when the current value is space-*/stretch (no packed cell → no active dot;
// the dropdowns carry it). Used only for the highlight, not the preview.
export const flexAlignToCell = (
  alignItems: AlignItems, justifyContent: JustifyContent, direction: FlexDirection
): { col: 0|1|2; row: 0|1|2 } | null;
```

Types come from `@lib/element` (`AlignItems`, `JustifyContent`, `FlexDirection` in
`src/renderer/lib/element/types.ts:51-58`).

### A2. Control — `src/renderer/src/components/controls/AlignmentGrid.tsx` (NEW)

Props: `{ direction: FlexDirection; alignItems: AlignItems; justifyContent: JustifyContent;
onChange: (patch: { alignItems: AlignItems; justifyContent: JustifyContent }) => void }`.

- Renders a square box with **9 clickable cells** and a **live preview** of 3 small bars
  positioned from the *actual* `alignItems`+`justifyContent` (including `space-*`/`stretch`),
  orientation flipping with `direction` — this is the Figma-like "see where children land"
  cue. Draw with divs/SVG; no new dependency.
- Clicking a cell → `onChange(cellToFlexAlign(col,row,direction))` (one atomic patch,
  packing both axes — expected Figma behavior).
- Active-cell highlight via `flexAlignToCell` (none when a distribution/stretch value is set;
  the dropdowns still show the real value).
- Styling: reuse the theme tokens already used by `Controls.module.css` (`--bg-input`,
  `--border`, `--radius-sm`, `--accent`, `--bg-hover`, `--text-secondary`); wrap in the
  existing `Tooltip` (`../controls/Tooltip`). Add an `AlignmentGrid.module.css`.

### A3. Wire into `LayoutSection.tsx` (flex branch, lines 222-250)

Add a `<Row label=""><AlignmentGrid direction={element.flexDirection}
alignItems={element.alignItems} justifyContent={element.justifyContent}
onChange={(patch) => patchElement(elementId, patch)} /></Row>` **above** the existing
Align/Justify `EnumSelect` row. Keep both dropdowns unchanged. No change to the `fields`/
`cssProperties` arrays (same fields).

> Optional future reuse (out of scope): the same widget could drive grid-container
> `alignItems`×`justifyItems`, but those use `GridSelfAlign` (`start/center/end`) — a
> separate value vocabulary — so defer.

---

## Feature B — Visual CSS grid builder

### B1. Pure parse/serialize — `src/renderer/lib/gridTemplate.ts` (NEW, tested)

The store keeps `gridTemplateColumns`/`gridTemplateRows` as opaque CSS strings
(`ScampElement`, `types.ts:456-457`), round-tripped verbatim by generate/parse. This module
is a *lens* over simple templates only:

```ts
export type GridTrack =
  | { kind: 'fr'; value: number } | { kind: 'px'; value: number }
  | { kind: 'percent'; value: number } | { kind: 'auto' }
  | { kind: 'min-content' } | { kind: 'max-content' }
  | { kind: 'raw'; source: string };            // minmax()/fit-content()/var()/calc() — kept verbatim

export const parseGridTemplate = (template: string): GridTrack[] | null;
export const serializeGridTemplate = (tracks: GridTrack[]): string;
export const makeFrTracks = (n: number): GridTrack[];   // n × {kind:'fr',value:1}, for the quick picker
```

- `parseGridTemplate`: tokenize respecting parens (reuse the paren-aware `tokenize` approach
  from `controls/FourSideInput.tsx:36-52`). Map each token to a `GridTrack`; unrecognized but
  self-contained tokens (`minmax(...)`, `fit-content(...)`, `var(...)`, `calc(...)`) become
  `raw` chips (still add/removable). A single whole-string `repeat(N, <simple list>)` expands
  to N tracks. Return **`null`** only for structurally un-modelable input — named lines
  `[...]`, `subgrid`, or a partial/nested `repeat` — which triggers the text fallback.
- `serializeGridTemplate`: join tracks with single spaces (`1fr`, `200px`, `25%`, `auto`,
  `raw.source`). Empty → `''`. Quick picker writes explicit `1fr 1fr 1fr` (not
  `repeat(3,1fr)`) so each track stays individually editable — intended.
- Invariant test: `parse → serialize → parse` is stable for simple templates.

### B2. Control — `src/renderer/src/components/controls/GridTemplateEditor.tsx` (NEW)

Props: `{ columns: string; rows: string; onChange: (patch: { gridTemplateColumns?: string;
gridTemplateRows?: string }) => void }`. Sections:

1. **Quick N×M matrix**: a small inline grid (up to ~6×6). Hover highlights an N×M region and
   shows "N × M"; click → `onChange({ gridTemplateColumns: serialize(makeFrTracks(N)),
   gridTemplateRows: serialize(makeFrTracks(M)) })` (one patch).
2. **Columns track list**: `parseGridTemplate(columns)` → a chip per track. Chip = compact
   **type dropdown** (`EnumSelect`: Fr / Px / % / Auto / Custom) + **`NumberInput`** (hidden
   for Auto/Custom) + remove "×"; a trailing "+" appends `{kind:'fr',value:1}`. Any edit
   re-serializes → `onChange({ gridTemplateColumns })`. If parse returns `null`, render the
   existing `PrefixSuffixInput` text field + a "Complex template — editing as text" note (and
   an optional "reset to simple tracks" affordance).
3. **Rows track list**: identical, writing `gridTemplateRows`.
4. **Proportional preview**: a horizontal strip showing relative column widths (fr-weighted;
   px/auto best-effort) — pure visual from the parsed tracks.

Reuse: `EnumSelect`, `NumberInput`, `PrefixSuffixInput` (all in `../controls/`), `Tooltip`,
and the `usePopover` hook (`src/renderer/src/hooks/usePopover.ts`) if the matrix is a popover
(inline is fine too). Add a `GridTemplateEditor.module.css`; the unused `.fourSideExpanded`
grid scaffolding in `Controls.module.css:597-618` is a styling reference.

### B3. Wire into `LayoutSection.tsx` (grid branch, lines 251-274)

Replace the two Cols/Rows `PrefixSuffixInput` rows with a single
`<GridTemplateEditor columns={element.gridTemplateColumns} rows={element.gridTemplateRows}
onChange={(patch) => patchElement(elementId, patch)} />`. Keep the C-gap/R-gap
`SpaceValueInput`s and the align/justify-items dropdowns (lines 275-310) unchanged. `fields`/
`cssProperties` arrays are unchanged.

> Grid-*item* placement (`gridColumn`/`gridRow`/`alignSelf`/`justifySelf`) lives separately in
> `sections/SizeSection.tsx:322-361` and is **out of scope** here (a drag-to-span cell picker
> is a possible future phase).

---

## Files at a glance

| File | Change |
|---|---|
| `src/renderer/lib/alignmentGrid.ts` | NEW pure helper (A1) |
| `src/renderer/lib/gridTemplate.ts` | NEW pure parse/serialize (B1) |
| `src/renderer/src/components/controls/AlignmentGrid.tsx` (+`.module.css`) | NEW control (A2) |
| `src/renderer/src/components/controls/GridTemplateEditor.tsx` (+`.module.css`) | NEW control (B2) |
| `src/renderer/src/components/sections/LayoutSection.tsx` | Wire both controls in (A3, B3) |
| `test/alignmentGrid.test.ts`, `test/gridTemplate.test.ts` | NEW required lib tests |

No store, IPC, generateCode, or parseCode changes — existing fields and their round-trip are
reused as-is.

## Sequencing

1. **Feature A** end-to-end (helper → control → wire → `alignmentGrid.test.ts`). Smaller,
   high value, independently shippable.
2. **`gridTemplate.ts` + `gridTemplate.test.ts`** (the parse/serialize foundation).
3. **`GridTemplateEditor.tsx`** (quick picker → track chips → preview → text fallback) → wire.
4. Polish + manual verification.

## Verification

- **Unit (required, gates commits touching `src/renderer/lib/`)**: `npm run test:unit`.
  - `alignmentGrid.test.ts`: `cellToFlexAlign`/`flexAlignToCell` for both `row` and `column`
    (assert the axis flip), and `null` for `space-*`/`stretch` inputs.
  - `gridTemplate.test.ts`: fr/px/%/auto/min-content/mixed; `minmax()`/`var()`/`calc()` → `raw`
    chip; `repeat(3,1fr)` → 3 tracks; named-lines/`subgrid` → `null`; `serialize` output; and
    the `parse → serialize → parse` round-trip invariant.
- **Integration (optional but recommended)**: extend `test/integration/sync.integration.test.ts`
  pattern — a `serializeGridTemplate` output written to disk survives `generateCode` →
  `parseCode` unchanged (confirms no round-trip regression).
- **Shim regen (required before manual/app testing)**: these are `.ts`/`.tsx` edits under
  `src/renderer/**`, and Vite/Vitest read the committed `.js` shims. **Stop `npm run dev`
  first**, then `npx tsc --build tsconfig.web.json --force`. (Do NOT regen while the dev
  server is running.)
- **Manual in-app** (`/run` or `npm run dev` after regen):
  - Flex element → the 3×3 grid appears above the dropdowns; clicking cells moves children on
    the canvas and updates the CSS panel; picking `space-between`/`stretch` in the dropdowns
    still works and the grid preview reflects it; behavior flips correctly for row vs column.
  - Grid element → quick N×M picker creates the grid; track chips change sizes/types and
    add/remove; proportional preview tracks the values; a hand-typed complex template (e.g.
    `repeat(2, [c] 1fr)`) shows the text fallback; the saved file round-trips (reopen matches).
- **E2E**: out of scope for this build (per CLAUDE.md, E2E is post-POC and the user runs the
  full Playwright suite manually); a focused `test/e2e` spec can be added later.

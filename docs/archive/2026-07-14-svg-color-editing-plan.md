# SVG Colour Editing & Resize Improvements — Plan

Backlog: `docs/backlog-6.md` story #3. Status: **proposed** — for review.
Builds on the shipped `docs/archive/2026-06-30-svg-improvements-plan.md` (inline render,
sanitize, drop/paste, element-level fill/stroke).

## Goal

Make imported SVGs behave like pasted ones: render inline (editable), let the
user **edit each colour inside the SVG** (not just one element-level fill),
resize with a **viewBox-locked ratio by default**, and **reload** when the
source file changes on disk.

---

## What already exists (reuse, don't rebuild)

- **Inline SVG model + render**: `ScampElement.svgSource` (+ `fill` / `stroke`
  / `strokeWidth`), rendered inline by `ElementRenderer`, round-tripped by
  `generateCode`/`parseCode` (verbatim `svgSource`).
- **Sanitize/normalize lib**: `src/renderer/src/lib/svg.ts` — `sanitizeSvg`,
  `sanitizeSvgInner`, `prepareSvgForInsert`, `isSvgMarkup` (DOMPurify + DOM
  parsing; DOM-dependent so it lives under `src/lib`, tested in
  `test/svg.test.ts`).
- **Drop already inlines SVGs**: `useDropInsert` branches on `image/svg+xml`,
  runs `prepareSvgForInsert`, and calls the `createSvgElement` store action
  (inline when ≤ `INLINE_SVG_MAX_BYTES`, else `<img>`).
- **Image import (the gap)**: the **image tool** (`useDrawInteraction`) and
  **ImageSection** picker go `chooseImage` → `copyImage` → `<img src>` with **no
  SVG detection** — so a `.svg` picked here becomes an opaque `<img>`. This is
  the "imported SVG" story #3 upgrades.
- **Ratio lock (story #1)**: session `ratioLocks: Record<id, number>` +
  `toggleRatioLock`. Reuse for the SVG default.
- **Current colour handling — the key tension**: `prepareSvgForInsert` today
  **strips** every shape's `fill`/`stroke` (`stripShapePaint`) and hoists the
  root paint to element-level `fill`/`stroke`, so the whole icon recolors from
  ONE control. Great for monochrome icons; it **destroys multi-colour info**,
  which is exactly what story #3's per-colour editor needs. See design §2.

---

## Design

### 1. Imported SVG → inline (image-import paths)

Add an SVG branch to the two picker paths that currently make `<img>`:
`useDrawInteraction` (image tool) and `ImageSection` (src picker).

- When the chosen file is `*.svg`: **copy it to `public/assets`** as today
  (keeps the on-disk reference for reload, per the story) AND read its text,
  run `prepareSvgForInsert`, and create an inline `createSvgElement` carrying
  both `svgSource` and `src` (the asset ref). Over the inline size threshold →
  keep the `<img>` fallback.
- New IPC to read a file's text (`asset:read-text` or reuse an existing
  read) — `copyImage` returns the copied path; we read that back as UTF-8.
- Store the asset reference on the svg element (`src`) so reload (§4) has a
  file to watch. `generateCode` still emits inline `<svg>`; `src` is
  design-tool metadata (like canvas size), not written into the TSX — confirm
  (open question 4).

### 2. SVG Colours — per-colour editing (the core new feature)

**Preserve colours on import** instead of stripping them, then surface every
unique colour as a swatch. This is the central change (open question 1).

- **Import change**: gate the destructive `stripShapePaint` /
  `dropInvisibleShapes` so multi-colour SVGs keep their paint. Monochrome icon
  sets (Lucide/Tabler) already use `currentColor`, so they naturally surface a
  single `currentColor` swatch — unifying the mono and multi cases.
- **New pure helpers** in `src/lib/svg.ts` (DOM-based, tested in
  `test/svg.test.ts`):
  ```
  extractSvgColors(svgSource): { colors: string[]; hasCurrentColor: boolean }
    // unique colours from fill / stroke / color presentation attributes AND
    // inline style props, in first-seen order; `currentColor` flagged
    // separately. Skips `none` and url(#…) paint-server refs.
  replaceSvgColor(svgSource, from, to): string
    // rewrite every occurrence of `from` (attr + style) to `to`.
  ```
- **New "SVG Colours" sub-section** (in `SvgSection` or a sibling, shown for
  `tag === 'svg'`): one `ColorInput` per extracted colour; changing it calls
  `patchElement({ svgSource: replaceSvgColor(...) })` so every occurrence
  updates and the canvas re-renders. Reuses the existing colour picker +
  theme tokens.
- **`currentColor` swatch**: rendered as a special entry that edits the
  element's CSS `color` (via the existing `fill`/`color` field) rather than
  `svgSource` — matching the story. The current element-level **Fill** control
  effectively becomes this swatch; **Stroke width** stays as an element field.
- **Round-trip**: colour edits live entirely in `svgSource` (already
  round-tripped verbatim), so no `generateCode`/`parseCode` change is needed
  for the colour list itself.

> Trade-off to accept: an SVG whose colours were *already stripped* by the old
> import (existing projects) shows only the `currentColor` swatch — its
> concrete colours are gone from the source. New imports preserve them. This is
> acceptable and doesn't regress existing recolouring.

### 3. viewBox-locked ratio by default

- `createSvgElement` sets `ratioLocks[newId] = width / height` (from the
  parsed `viewBox`, falling back to intrinsic width/height) so a freshly placed
  SVG scales proportionally out of the box (story #1's lock). The user can
  unlock via the existing ratio toggle.
- No model change — the lock is session UI state, exactly as story #1 built it.

### 4. Reload on external SVG file change

- The imported svg element stores its asset path (`src`, §1). Watch the
  project's `public/assets` for changes (chokidar — the sync bridge already
  runs a watcher for TSX/CSS; extend it to the assets dir, or add a small
  dedicated watcher).
- On a change to a watched, referenced `.svg`: surface a non-blocking prompt
  (`SVG file updated externally. [Reload SVG] [Keep current]`). Reload reads
  the file, re-runs `prepareSvgForInsert`, and replaces `svgSource` — with a
  clear warning that in-Scamp colour edits are lost.
- **Most involved / least certain piece** — recommend it as the last phase and
  possibly its own follow-up (open question 5).

---

## Pure/tested helpers (mandatory coverage)

In `src/lib/svg.ts` (DOM-based, jsdom-tested like the existing functions):
- `extractSvgColors` — attrs + style, dedup, `none`/`url()` skipped,
  `currentColor` flagged, malformed input safe.
- `replaceSvgColor` — replaces attr + style occurrences, leaves unrelated
  colours and `none` untouched, case-insensitive hex.
- Import preservation: `prepareSvgForInsert` no longer strips multi-colour
  paint (new assertions on a two-colour fixture).

---

## Files to touch

| Area | Files |
|---|---|
| Colour lib | `src/renderer/src/lib/svg.ts` (extract/replace, preserve-on-import) + `test/svg.test.ts` |
| Panel | `components/sections/SvgSection.tsx` (+ `.module.css`) — colour list + currentColor swatch |
| Import (picker) | `canvas/interactions/useDrawInteraction.ts`, `components/sections/ImageSection.tsx` — SVG branch |
| Store | `store/canvas/factories.ts` / `slices/elementsCreate.ts` — `createSvgElement` sets ratio lock + `src`; `canvasSlice`/`ui` if needed |
| IPC | `src/main/ipc/` asset-read-text + channel const in `shared/ipcChannels.ts`, payload type in `shared/types.ts` |
| Reload | sync-bridge / watcher for `public/assets`; a small reload-prompt UI |
| Docs | `docs/user_docs/` SVG docs; update `docs/notes/svg-recolor.md` (strip → preserve) |

No change to `generateCode`/`parseCode` for colours (all in `svgSource`); the
`src`-metadata question (4) is the only possible codegen touch.

---

## Testing

- **Unit (`test/svg.test.ts`)**: `extractSvgColors` (multi-colour, dedup,
  style vs attr, `none`/`url()` skipped, `currentColor`), `replaceSvgColor`
  (attr+style, no over-match), preserve-on-import.
- **E2E (`test/e2e/canvas/` or `elements/`)**: import a `.svg` via the image
  tool → inline `<svg>` appears (not `<img>`); the SVG Colours list shows N
  swatches; changing one recolours the canvas and rewrites the class-free
  `svgSource` in the written TSX; a fresh SVG is ratio-locked (edge handles
  hidden). Reload path if included.

---

## Phasing (each independently shippable)

1. **Colour lib** — `extractSvgColors` / `replaceSvgColor` + preserve-on-import
   change + tests. Pure, unblocks the UI.
2. **SVG Colours panel** — swatch list + `currentColor` swatch.
3. **Imported-SVG-inline** — image tool + ImageSection SVG branch (+ asset-read
   IPC).
4. **Ratio-lock default** — `createSvgElement` seeds the viewBox ratio (small).
5. **Reload-on-change** — asset watcher + prompt (largest; optional follow-up).

---

## Open questions for review

1. **Preserve vs strip colours on import** — the plan **stops stripping** so
   multi-colour SVGs keep their paint and every colour is editable (monochrome
   icons still collapse to one `currentColor` swatch). Alternative: keep the
   strip for monochrome and only preserve when >1 colour is detected (more
   code, backward-identical for icons). Recommendation: **preserve** — simpler
   and matches the story. OK? yeah lets go with preserve.
2. **Element Fill control vs colour swatches** — fold the existing element-level 
   **Fill** into the `currentColor` swatch (recommended), or keep both Fill and
   the colour list side by side? Stroke width stays element-level either way. lets go with your rec.
3. **Gradient / `<defs>` colours** — the previous plan listed gradients as a
   non-goal. Real multi-colour illustrations use `stop-color`. Include
   `stop-color` in `extractSvgColors` (recommended, cheap) or leave gradients
   uneditable for now? lets go with your rec.
4. **`src` metadata in TSX** — store the asset reference for reload as
   design-tool metadata only (NOT emitted into the inline-`<svg>` TSX,
   recommended), or emit a `data-…` attr so it round-trips through the file? lets make it round trip
5. **Reload-on-change scope** — include phase 5 in this story, or ship phases
   1–4 (the editing + inline + ratio value) now and treat file-watch reload as
   a fast follow? Recommendation: **1–4 now, 5 as a follow-up** — it needs new
   asset-dir watching and has the most edge cases. lets do it all

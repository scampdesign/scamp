# Plan — SVG handling improvements

## Problem

SVG support in Scamp is minimal and awkward:

- An SVG isn't a first-class thing you can add. It's an element whose
  **tag** is switched to `svg` (in the Element section), with the raw
  markup pasted into a **Source textarea**. There's no insert flow.
- The canvas renders it as a **placeholder rectangle** — you can't see
  the artwork while you design (`ScampElement.svgSource` is stored but
  never injected; see `src/renderer/lib/element/types.ts:364` and
  `docs/user_docs/elements.md:70`).
- You can't edit SVG **fill / stroke** visually. The only controls are
  the raw Source textarea and whatever you hand-write into
  `customProperties`.
- Dropping a `.svg` file inserts it as an `<img src="…">` (it matches
  `image/*` in `useDropInsert`), so it isn't inline and its color can't
  be edited.
- **Cmd+V** only pastes Scamp's internal element clipboard
  (`useCanvasKeyboardShortcuts.ts:131` → `pasteElement()`); it never
  reads the OS clipboard, so you can't paste an icon copied from a
  browser or design tool.

### What already exists (reuse these)

- **Data model**: `svgSource?: string` on `ScampElement`
  (`element/types.ts:364`); the `attributes` bag; `customProperties`.
- **Codegen round-trip**: `generateCode/tsx.ts:143` emits
  `<svg …>{svgSource}</svg>` verbatim; `parseCode/tsx.ts` slices the
  inner source back out (suppressing nested events so svg children don't
  become canvas elements). This already round-trips byte-for-byte — keep
  that guarantee.
- **Insert path**: `useDropInsert` (OS file drop) → `window.scamp.copyImage`
  IPC (`main/ipc/imageOps.ts`) → `createImage` action
  (`elementsCreate.ts:138`) → `makeImage` factory (`factories.ts:100`).
  The SVG insert flow mirrors this.
- **Panel**: `UiPanel.tsx` composes per-type sections; `ImageSection.tsx`
  is the template for a new SVG section. Sections write via
  `patchElement`.
- **Element section** already exposes the tag switcher + Source textarea
  (`sections/ElementSection.tsx`).

So the codegen and storage already handle SVG; the gaps are **rendering,
visual editing, and the insert/paste flows** — plus the cross-cutting
need to **sanitize and normalize** untrusted SVG markup.

---

## Goals & scope

**Primary goals (from the request)**
1. Edit SVG **fill**, **stroke**, and **stroke width** from the Visual
   panel.
2. **Drag-and-drop** an `.svg` file from the OS into the canvas.
3. **Paste (Cmd+V)** an SVG (or image) into the canvas.

**Additional improvements proposed for this plan** (see Open questions
for which to include)
4. **Render the real SVG on the canvas** (inline, sanitized) instead of a
   placeholder — needed for 1–3 to feel usable.
5. **Sanitize** SVG markup before injecting it into the canvas DOM
   (strip `<script>`, event handlers, external/remote refs). Required for
   security since markup arrives from drop / paste / agents.
6. **Normalize on import** so the visual Fill/Stroke controls actually
   take effect — convert hardcoded `fill`/`stroke` on shapes to
   `currentColor` / remove them so the element-level CSS cascades.
7. **`currentColor` + theme tokens** for fill, so an icon's color can
   track a design token (ties into the existing color picker).
8. **Inline-vs-reference** decision for dropped/pasted SVGs, with a size
   threshold (inline small icons; reference large illustrations as
   `<img>`), plus an **"Inline this SVG"** action to convert an
   `<img src="*.svg">` into an editable inline element.
9. **viewBox-aware sizing** (`preserveAspectRatio`) so scaling behaves.

**Non-goals (this pass)**
- Per-shape / per-path editing (selecting one `<path>` inside the SVG and
  styling it individually). Element-level fill/stroke only.
- A vector drawing/pen tool. Scamp consumes SVGs; it doesn't author paths.
- An icon library / built-in icon picker (could be a follow-up).
- SVG animation authoring (SMIL / CSS keyframes on internal shapes).
- Editing gradients/filters defined inside the SVG `<defs>`.

---

## Design decisions / open questions (decide before building)

These are the calls that shape the work — flagged for review:

1. **Fill/stroke storage — typed fields vs `customProperties`.**
   - (a) Add typed `fill`, `stroke`, `strokeWidth` to `ScampElement` and
     thread them through `defaults.ts` / `generateCode` / `parseCode`
     (like `borderColor`). First-class binding, clean round-trip, but
     touches the two core functions and their mandatory tests.
   - (b) Write `fill` / `stroke` / `stroke-width` into `customProperties`
     verbatim. Much less code; weaker panel state (parsing values back
     out of the bag) and no default-omission.
   - **Recommendation: (a)** for first-class controls — it's the pattern
     borders already use. yep go with a.

2. **Make fill/stroke controls SVG-only, or general?** `fill`/`stroke`
   are valid on any element but only meaningful for SVG/text. Recommend
   gating the new section on `tag === 'svg'` for now. yep agreed.

3. **Inline vs reference for dropped/pasted SVGs.** Inline (`svgSource`)
   is required for fill editing but bloats the TSX for large
   illustrations. Recommend: **inline when the markup is ≤ N KB**
   (e.g. 12 KB) or low element-count, else copy into `public/assets` and
   insert as `<img>` (with the "Inline this SVG" escape hatch). Confirm
   the threshold. agreed

4. **Normalization aggressiveness.** To make Fill work, do we
   (a) strip `fill`/`stroke` attrs from shapes, (b) rewrite them to
   `currentColor`, or (c) leave the source untouched and only apply CSS
   (which silently fails on hardcoded fills)? Recommend **(b)
   `currentColor`** — least destructive, makes `fill`/`color` cascade
   work, and is reversible-looking in the source. agreed.

5. **Paste source of truth.** On Cmd+V, when the internal element
   clipboard is empty, read the OS clipboard. If it holds SVG (an
   `image/svg+xml` item or text starting with `<svg`), insert inline; if
   a raster image, save to assets and insert `<img>`. Confirm this
   precedence (internal element clipboard still wins when set). agreed.

6. **Security posture.** Sanitize on every ingestion path (drop, paste,
   AND `parseCode`, since agent-written SVG is untrusted). Hand-roll a
   small allowlist sanitizer in `lib/` (pure, testable) vs. add a
   dependency (DOMPurify). Recommend **hand-rolled allowlist** to keep
   the bundle lean (CLAUDE.md: avoid deps for ~20-line jobs) — though SVG
   sanitization is more than 20 lines, so this is a genuine call. yeah we cna import dom purify.

---

## Architecture changes

### 1. Canvas rendering — show the real SVG (`ElementRenderer.tsx`)

Replace the placeholder with the sanitized markup. For a `tag === 'svg'`
element, render an `<svg>` whose inner HTML is the **sanitized**
`svgSource` via `dangerouslySetInnerHTML`, sized by the element box and
styled by its class (so `fill`/`stroke` cascade). Keep the element
selectable/movable exactly as today (the chrome layer sits above it).

- Sanitize at render time too (defense in depth) using the shared
  sanitizer (below), so even a malicious file already in the project
  can't execute on the canvas.
- Pointer events on the inner SVG must not steal canvas interactions —
  set `pointer-events: none` on the injected content; the element wrapper
  keeps `data-element-id` for hit-testing.

### 2. Shared SVG lib (`src/renderer/lib/svg.ts`) — pure + fully tested

Per CLAUDE.md, `lib/` is mandatory-coverage. New pure functions:

```
sanitizeSvg(raw: string): string
  // allowlist tags/attrs; drop <script>, <foreignObject>, on* handlers,
  // href/xlink:href to non-data/external URLs, <style> @import, etc.

normalizeSvgForEditing(raw: string): { inner: string; viewBox?: string;
  width?: number; height?: number }
  // extract inner source (between <svg …> and </svg>), pull out viewBox /
  // intrinsic width/height for sizing, and rewrite hardcoded
  // fill/stroke on shapes to `currentColor` (decision 4b).

isSvgMarkup(text: string): boolean
  // cheap check: trimmed text starts with `<svg` (case-insensitive).
```

Parsing: a small tolerant tokenizer is enough (we already slice svg by
index in `parseCode/tsx.ts`); avoid a full XML DOM dependency. These are
the riskiest pieces, so they get the most unit tests (malformed input,
nested `<svg>`, comments, CDATA, namespaced attrs, script-injection
attempts).

### 3. Visual panel — `SvgSection` (`sections/SvgSection.tsx`)

New section, rendered from `UiPanel.tsx` when `element.tag === 'svg'`
(add `const isSvg = element.tag === 'svg'`), mirroring `ImageSection`:

- **Fill** — color control (reuses the existing color picker + theme
  tokens; supports `currentColor` and `none`).
- **Stroke** — color control.
- **Stroke width** — numeric (px).
- (stretch) **Fill rule**, **opacity** already covered by the generic
  Visibility/opacity section.

Each writes via `patchElement` to the typed fields (decision 1a) or
`customProperties` (1b). The section reads current values to populate the
controls.

### 4. Drag-and-drop SVG (`useDropInsert.ts`)

Branch on `file.type === 'image/svg+xml'` (or `.svg` extension) **before**
the generic `image/*` path:

- Read the file's text (IPC: `svg:read-file` or reuse a file-read IPC),
  `sanitizeSvg` + `normalizeSvgForEditing` it.
- If under the inline threshold (decision 3): `createSvgElement` (new
  action) at the drop point with `tag:'svg'`, `svgSource`, and box size
  from the SVG's intrinsic/viewBox dimensions (clamped to parent).
- Else: fall back to the existing `copyImage` → `<img>` path.
- Keep the current raster `image/*` behavior untouched.

New store action `createSvgElement(input)` + `makeSvg` factory
(`factories.ts`), analogous to `createImage`/`makeImage`. Add to the
`CanvasState` type and the slice's `Pick<…>` union.

### 5. Paste (`useCanvasKeyboardShortcuts.ts` + clipboard IPC)

Extend the Cmd+V handler: if the internal element clipboard is empty
(decision 5), read the OS clipboard.

- Add a main-process clipboard IPC (`clipboard:read`) returning
  `{ kind: 'svg' | 'image' | 'text' | 'empty'; … }` using Electron's
  `clipboard.readImage()` / `readText()` / `readBuffer('image/svg+xml')`.
- SVG → sanitize/normalize → `createSvgElement` at viewport centre (or
  last cursor point).
- Raster image → write the PNG buffer into `public/assets` (new IPC, akin
  to `copyImage` but from a buffer) → `createImage`.
- Text that is SVG markup → same as SVG.

### 6. "Inline this SVG" action (Element/Image section)

A button on an `<img src="*.svg">` element that reads the referenced
file, sanitizes/normalizes it, and converts the element in place to an
inline `tag:'svg'` element (so fill becomes editable). Optional —
include if Open question 8 is accepted.

### Data model summary

- `svgSource` — already exists; now also written by the insert/paste
  flows (sanitized) and editable via the Source textarea.
- `fill`, `stroke`, `strokeWidth` — new typed fields (decision 1a) added
  to `DEFAULT_RECT_STYLES` (default `currentColor` / `none` / `0`),
  emitted by `generateCode` only when non-default, parsed by `parseCode`,
  preserving the round-trip invariant.

---

## Edge cases

- **Malicious / malformed SVG** — sanitizer strips scripts and handlers;
  a parse failure yields a safe empty/placeholder render, never a throw.
- **Hardcoded fills** — `normalizeSvgForEditing` rewrites them to
  `currentColor` so the Fill control works; document that an SVG with
  per-shape colors won't be uniformly recolorable (element-level only).
- **No viewBox / no intrinsic size** — fall back to `DEFAULT_IMAGE_SIZE`
  and `preserveAspectRatio` so it doesn't render 0×0.
- **Huge SVGs** — inline threshold routes them to `<img>`; note the cap.
- **Round-trip stability** — emitted `fill`/`stroke` must be omitted when
  default; the existing `svgSource` verbatim guarantee must hold (the
  normalize step happens at **import**, not on every regen).
- **`currentColor`** — fill follows the CSS `color` property; ensure the
  color control can set `color` (or `fill` directly) coherently.
- **Component instances / nested svg** — an `<svg>` inside a component is
  opaque on the page (unchanged); editing happens in the component editor.
- **Pasting into a flex parent** — created element gets x/y reset / flows
  like any other insert (mirror image-insert behavior).

---

## Files to touch

- `src/renderer/lib/svg.ts` — **new**: sanitize / normalize / detect
  (pure, fully unit-tested).
- `src/renderer/lib/element/types.ts` — `fill` / `stroke` / `strokeWidth`
  fields (if decision 1a).
- `src/renderer/lib/defaults.ts` — defaults for the new fields.
- `src/renderer/lib/generateCode/*` + `parseCode/*` — emit/parse the new
  fields; keep the `svgSource` verbatim path.
- `src/renderer/src/canvas/ElementRenderer.tsx` — render sanitized inline
  SVG instead of the placeholder.
- `src/renderer/src/components/sections/SvgSection.tsx` (+ `.module.css`)
  — **new**; wire into `UiPanel.tsx`.
- `src/renderer/src/canvas/interactions/useDropInsert.ts` — SVG branch.
- `src/renderer/src/components/projectShell/useCanvasKeyboardShortcuts.ts`
  — OS-clipboard paste branch.
- `src/renderer/store/canvas/factories.ts` + `slices/elementsCreate.ts` +
  `canvasSlice.ts` — `makeSvg` + `createSvgElement` action + type.
- `src/main/ipc/` — clipboard read IPC; svg-file read / buffer-to-assets
  IPC; channel constants in `src/shared/ipcChannels.ts`; payload types in
  `src/shared/types.ts`.
- `docs/user_docs/elements.md` (or a new `svg.md`) — update the SVG docs.

---

## Tests

**Unit (mandatory — `lib/`):** `test/svg.test.ts`
- `sanitizeSvg`: strips `<script>`, `on*` handlers, external `href`,
  `<foreignObject>`, `<style>@import`; preserves shapes/paths/groups;
  handles malformed input without throwing.
- `normalizeSvgForEditing`: extracts inner source; pulls viewBox /
  width / height; rewrites hardcoded `fill`/`stroke` → `currentColor`;
  leaves `currentColor`/`none` alone; nested-`<svg>` and comment cases.
- `isSvgMarkup`: positive/negative/whitespace/case.

**Round-trip (the two core functions):** extend the existing generate →
parse invariant for an svg element carrying `fill`/`stroke`/`strokeWidth`
and `svgSource` — values reproduce exactly; `svgSource` stays byte-for-byte.

**E2E (`test/e2e/canvas/`):**
- Drop an `.svg` file onto the canvas → inline `<svg>` element appears,
  written TSX contains `<svg>` with the source.
- Change Fill in the panel → CSS `fill:` (or `color:`) lands on the class
  and the canvas recolors.
- Paste SVG markup (seed the clipboard) → element inserted.
- Negative: a `<script>`-laden SVG is sanitized (no script in output /
  no execution).

---

## Phasing

Each phase is independently shippable.

1. **lib/svg.ts** (sanitize / normalize / detect) + unit tests. No UI —
   pure, fully testable in isolation, and unblocks everything.
2. **Canvas rendering**: inline sanitized SVG in `ElementRenderer`
   (replaces the placeholder). Immediate visible value for existing svg
   elements.
3. **Visual panel**: `SvgSection` (fill / stroke / stroke-width) + the
   typed model fields + round-trip tests.
4. **Drop**: `.svg` file → inline element (`useDropInsert`,
   `createSvgElement`, IPC).
5. **Paste**: OS-clipboard SVG / image via Cmd+V (clipboard IPC).
6. **Polish**: inline-vs-reference threshold, "Inline this SVG", docs,
   E2E.

---

## Cross-references

- `docs/css-backlog.md` has adjacent items worth coordinating: the
  `drop-shadow()` filter (shadows that follow an SVG's shape) and
  `clip-path` accepting `path()` / `url(#id)` references. Out of scope
  here but they share the "non-rectangular element" theme.
- Existing SVG export already works (`sections/ExportSection.tsx`) and is
  unaffected.

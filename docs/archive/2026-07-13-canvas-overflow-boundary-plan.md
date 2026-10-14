# Canvas Overflow & Boundary Visibility — Plan

Backlog: `docs/backlog-6.md` story #2. Status: **proposed** — for review.

## Goal

Make the canvas viewport boundary legible when content overflows it, and let
the user clip content at the edge to design against a specific viewport size
(especially for mobile styling on a desktop-origin layout). All of this is
**canvas UI only** — it never touches the CSS output or project files.

---

## What already exists (reuse, don't rebuild)

- **`canvasOverflowHidden: boolean`** in `ProjectConfig` (scamp.config.json).
  Wired through `CanvasSizeControl` as an "Overflow hidden" checkbox and
  applied in `Viewport` as `overflow: hidden` on the frame. This is the seed
  of the "Clip content" toggle — it just needs renaming + per-preset storage.
- **Breakpoint presets + custom width** live in the same `CanvasSizeControl`
  popover (`config.breakpoints`, `config.canvasWidth`). Selecting a preset
  sets both the canvas width and the active breakpoint.
- **Frame sizing** (`Viewport.tsx`): the frame is a fixed `width: canvasWidth`
  with `min-height` that grows with content (`reservedHeight`). Component mode
  already passes an explicit `canvasHeight`; page mode does not.
- **Export** (`ExportSection.tsx` + `exportCapture.ts`): page export captures
  the `[data-testid="canvas-frame"]` node at its `offsetWidth`/`offsetHeight`.
  Because `offsetWidth` is the frame's fixed `canvasWidth` (overflowing
  children extend past it but don't change it), **horizontal overflow is
  already clipped in exports today** — the only gap is vertical (fixed height).

---

## What's new

The five sub-features below map to the story's sections. Suggested as phases so
you can review/descope; each is independently shippable.

### Phase A — Horizontal overflow indicator

When content extends past the canvas width **and clip is off**, show a faint
**amber dashed vertical line at the frame's right edge** plus a small label
`+ 240px overflow`.

- **Measurement** — a pure helper `overflowExtent(scrollSize, clientSize)` in
  `lib/` returns `max(0, scrollSize - clientSize)`. `Viewport` measures the
  frame's horizontal overflow as `frame.scrollWidth - frame.clientWidth` inside
  the existing frame `ResizeObserver` (it already observes the frame for
  height). `scrollWidth` reports overflowing descendants even when
  `overflow: hidden`, so the number is available in both clip states.
- **Render** — a new `CanvasBoundaryOverlay` component, rendered as a sibling
  of the frame inside `Viewport`'s `frameShell` (NOT inside the frame), so it:
  (a) scales/positions with the frame but (b) is excluded from export. Mark it
  `data-canvas-chrome="true"` for belt-and-suspenders with the export filter.
  The dashed line sits at `x = canvasWidth`; the label hangs just inside/right
  of it. Amber = a new `--warning`/`--overflow` token in the app theme
  (`styles/theme.css`) — not a raw hex (per CLAUDE.md).
- Shown only when `overflowX > 0` **and** clip is off for the active preset.

### Phase B — "Clip content", saved per canvas-size preset

Rename the toggle to **"Clip content"** and make it **per-breakpoint**: turning
it on at Mobile stays on for Mobile but not Desktop (unless also enabled there).

- **Storage change**: replace the single `canvasOverflowHidden: boolean` with
  `canvasClipByBreakpoint?: Record<string, boolean>` keyed by breakpoint id.
  - Page mode reads `clip = canvasClipByBreakpoint[activeBreakpointId] ?? false`
    and the toggle writes that key.
  - **Custom widths** (no matching preset) drop the active breakpoint to
    `desktop` already (existing `handleCustomChange`), so they read/write the
    `desktop` key — acceptable and consistent.
  - **Component mode** has no breakpoints — keep a single boolean for it. Option:
    keep `canvasOverflowHidden` solely for component mode, or store component
    clip per-component. Recommendation: keep `canvasOverflowHidden` as the
    component-mode flag, add the new map for page mode. (See open question 1.)
  - **Migration**: seed `canvasClipByBreakpoint.desktop` from a legacy
    `canvasOverflowHidden === true` on load so existing projects don't lose the
    setting. Keep the old key readable for one release (same pattern as prior
    config migrations).
- **Wire-up**: `Viewport` takes the resolved `clip` boolean (already has the
  prop as `canvasOverflowHidden` — rename to `clipContent`). `CanvasSizeControl`
  reads/writes the active breakpoint's entry.

### Phase C — Canvas height: fixed-height toggle + vertical boundary

- **Vertical boundary rule** — when clip is on, draw a subtle **horizontal
  amber rule at the natural document height** (`frame.scrollHeight`) so the
  user sees where content actually ends. Rendered by the same
  `CanvasBoundaryOverlay`.
- **Fixed height** — add `canvasHeight?: number` + `canvasFixedHeight?: boolean`
  (page-level) to `ProjectConfig`. A "Fixed height" toggle + numeric input in
  the `CanvasSizeControl` popover (page mode). When on, `Viewport` uses
  `canvasHeight` as the frame height (reusing the component-mode `canvasHeight`
  path) instead of growing with content; when content exceeds it, show the
  **vertical overflow indicator** (`+ Npx overflow`) the same way as horizontal.
  - Single page-level height vs per-preset height: recommend single for v1
    (the story doesn't ask for per-preset height). (See open question 2.)

### Phase D — Export respects clip

- Horizontal is already clipped (export width = frame `offsetWidth` =
  `canvasWidth`). Verify with a manual export of an overflowing layout.
- **Fixed height**: when `canvasFixedHeight` is on, page export should capture
  `canvasHeight` rather than the content `offsetHeight`. `readSize` in
  `ExportSection` currently returns `offsetHeight`; make it clamp to the fixed
  height when the frame is in fixed-height mode (the frame's own `offsetHeight`
  will already equal the fixed height if we set `height` rather than
  `min-height`, so this may need no code change — verify).

---

## Pure helpers (tested, per the `lib/` mandate)

- `overflowExtent(scroll: number, client: number): number` — `max(0, scroll − client)`.
- `formatOverflowLabel(px: number): string` — `"+ 240px overflow"` (and a
  hidden/`''` case for `0`).
- `resolveClip(map, breakpointId): boolean` — `map?.[breakpointId] ?? false`,
  plus a migration helper `seedClipFromLegacy(legacyBool)`.

Keeping these pure isolates the arithmetic/lookup from the DOM-measuring
component and satisfies "everything in `src/renderer/lib/` is fully tested."

---

## Files touched (by phase)

| Phase | Files |
|---|---|
| A | `lib/canvasOverflow.ts` *(new: overflowExtent, formatOverflowLabel)* + test; `canvas/CanvasBoundaryOverlay.tsx` *(new)* + css; `canvas/Viewport.tsx` (measure scrollWidth, render overlay); `styles/theme.css` (amber token) |
| B | `shared/types.ts` (`canvasClipByBreakpoint`, migration); `shared/projectConfig.ts` (resolve/seed helpers) + test; `components/CanvasSizeControl.tsx` (rename + per-preset read/write); `canvas/Viewport.tsx` + `CanvasArea.tsx` (pass resolved clip) |
| C | `shared/types.ts` (`canvasHeight`, `canvasFixedHeight`); `CanvasSizeControl.tsx` (toggle + input); `Viewport.tsx` (fixed-height frame + vertical indicator); `CanvasBoundaryOverlay.tsx` (vertical rule) |
| D | `components/sections/ExportSection.tsx` (fixed-height capture) — verify-first |

No `parseCode`/`generateCode`/CSS-output changes anywhere — every setting is a
canvas viewing concern persisted only in `scamp.config.json`.

---

## Testing

- **Unit (lib)**: `overflowExtent` (zero, positive, negative→0), `formatOverflowLabel`,
  `resolveClip` (missing key, present true/false), `seedClipFromLegacy`.
- **Integration**: `projectConfig` round-trip with the new fields; legacy
  `canvasOverflowHidden` migration seeds the desktop clip entry.
- **Manual QA** (warn before shim regen if the dev server is running): draw an
  element past the canvas edge → amber line + `+Npx` appears; toggle Clip
  content → content clips and the indicator hides; switch Mobile↔Desktop → clip
  state is remembered per preset; enable Fixed height → frame stops growing and
  the vertical overflow shows; export PNG with overflow → only the canvas area
  is captured; export with fixed height → output is exactly the fixed size.

---

## Open questions for review

1. **Component-mode clip** — keep the single `canvasOverflowHidden` boolean for
   the component editor (recommended, minimal churn) and add the per-breakpoint
   map only for page mode? Or unify both under the new model? ill go with your recommendation
2. **Fixed height scope** — one page-level `canvasHeight` (recommended), or
   per-breakpoint height like clip? The story only asks for a single fixed
   height "to simulate a specific screen size." Ill go with your rec
3. **Indicator visibility** — show the horizontal overflow indicator only when
   clip is OFF (per the story), or always show it (dimmed) so the user still
   sees how much is being clipped when clip is ON? Story implies off-only;
   recommendation: off-only for the amber line, but keep the vertical
   natural-height rule visible when clip is ON. ill go with your rec
4. **Phasing** — implement all four phases in one pass, or land A+B first (the
   core "see and clip the boundary") and follow with C+D (fixed height +
   export)? Recommendation: A+B first — they deliver the main value; C+D are a
   natural follow-up. go with all four.

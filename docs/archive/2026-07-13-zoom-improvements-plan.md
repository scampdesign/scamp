# Zoom Improvements Plan

Status: **implemented** (2026-07-13).

## Goals (from the request)

1. **Show the real zoom percentage on hover.** Default canvas state is
   "Fit". Today the zoom control literally reads `Fit` and its tooltip
   never tells you what percentage that resolves to. On hover we want to
   surface the actual effective percentage (e.g. `Fit · 67%`).
2. **Stop toolbar tooltips clipping off the top of the window.** Tooltips
   currently always render *above* their trigger. The top toolbar
   (`ProjectHeader`: zoom, Code, Terminal, Preview) sits flush against the
   window's top edge, so its tooltips get cut off. They should flip below.
3. **Trackpad pinch-to-zoom** on the canvas.
4. **Cmd/Ctrl + mouse-wheel zoom** on the canvas.

---

## How zoom works today

- **State** lives in the canvas store (`store/canvas/slices/ui.ts`):
  - `userZoom: number | null` — `null` = "fit to container width", a
    number = explicit scale (`1` === 100%).
  - Actions: `zoomIn` / `zoomOut` walk the discrete `ZOOM_STEPS` ladder
    (`[0.25 … 4]`, defined in `store/canvasSlice.ts`), `resetZoom` sets
    `userZoom` back to `null`, `setZoom(n | null)` sets it directly.
  - Keyboard: `useCanvasKeyboardShortcuts.ts` binds Cmd/Ctrl `+` / `-` /
    `0` to those actions.

- **The effective/fit scale is computed *inside* `Viewport.tsx`, not in the
  store.** `Viewport` measures the scroll container's `clientWidth`, derives
  `fitScale = min((clientWidth - 2·FRAME_FIT_INSET) / frameW, 1)` in a
  `ResizeObserver`, and sets `scale = userZoom ?? fitScale`. It applies
  `transform: scale(scale)` from `top left` on the frame, and the enclosing
  **artboard scroll container owns scrolling** (`CanvasArea` →
  `styles.artboardScroll`, ref `artboardScrollRef`, passed to `Viewport`
  as `scrollContainerRef`).

  → **Consequence:** `ZoomControls` (which only reads `userZoom`) has no way
  to know the real percentage when `userZoom === null`. This is the root
  reason ask #1 needs a store change.

- **Tooltip** (`controls/Tooltip.tsx`) portals to `document.body`, positions
  itself at `translate(-50%, calc(-100% - 10px))` — i.e. **always above**,
  centered. It clamps **horizontally** to the viewport but has **no vertical
  clamp/flip**, so triggers near the top clip.

- **No wheel handling exists** anywhere on the canvas today.

---

## Proposed changes

### 1. Surface the effective scale in the store

Add a store field so any UI can read what the canvas is *actually* scaled to,
regardless of fit-vs-explicit mode.

- New state in `ui.ts`: `fitScale: number` (default `1`) + a setter
  `setFitScale(n: number)`.
- `Viewport` calls `setFitScale(next)` in the same `useLayoutEffect` that
  currently sets local `fitScale` state. (Keep the local state too, or read
  it back from the store — either works; writing to the store is the new
  requirement.)
- Add a derived selector / helper for the **effective scale**:
  `effectiveScale = userZoom ?? fitScale`. This is the single number both
  the label and the wheel handler anchor on.

> Alternative considered: have `Viewport` write the final `scale` directly to
> the store as `effectiveScale`. Rejected — `userZoom` already lives in the
> store, so writing only `fitScale` keeps a single source of truth for each
> input and derives the rest. Avoids a feedback loop where `Viewport` both
> reads and writes the same scale.

### 2. Zoom control: show the real percentage

In `ZoomControls.tsx`:

- Read `userZoom` **and** `fitScale`; compute `effectivePct =
  Math.round((userZoom ?? fitScale) * 100)`.
- Button label stays context-appropriate: `Fit` when `userZoom === null`,
  else `${pct}%` (unchanged visible text so the toolbar doesn't jump).
- **Tooltip** on the label becomes dynamic and carries the real number:
  - Fit mode: `Fit · ${effectivePct}% — click to reset (Ctrl/Cmd+0)`
  - Explicit mode: `${effectivePct}% — click to fit (Ctrl/Cmd+0)`
- `aria-label` updated to match so the number is exposed to a11y too.

This satisfies "on hover I want to see the actual percentage" without
changing the resting label from `Fit`.

### 3. Tooltip: flip below when there's no room above

Make `Tooltip.tsx` auto-flip instead of only ever rendering above. This is a
**generic** fix so every top-toolbar tooltip (zoom + Code + Terminal +
Preview) benefits without per-call changes.

- Track a `placement: 'top' | 'bottom'` in state.
- In the existing post-mount `useLayoutEffect` (which already measures the
  tooltip and clamps horizontally), also check vertical room:
  `if (triggerRect.top < tipHeight + GAP) → placement = 'bottom'`.
- Position + the fade-in `@keyframes` need a bottom variant:
  - top (today): `transform: translate(-50%, calc(-100% - 10px))`, anchored
    at `triggerRect.top`.
  - bottom: anchor at `triggerRect.bottom`, `transform: translate(-50%, 10px)`.
- Add an optional `placement?: 'top' | 'bottom' | 'auto'` prop defaulting to
  `'auto'` so a caller *can* force a side, but the top toolbar just relies on
  auto-flip.
- Tooltip CSS (`Tooltip.module.css`) gains a `.bottom` modifier + a
  `tooltipFadeInBottom` keyframe (mirror of the existing one, translating
  down instead of up).

> Scope note: the bottom element `Toolbar` sits at the bottom of the canvas;
> its tooltips-above already have room, and auto-flip leaves them unchanged.

### 4. Trackpad pinch + Cmd/Ctrl-wheel zoom

Both gestures arrive as `wheel` events:
- **Trackpad pinch** → `wheel` with `e.ctrlKey === true` (the browser
  synthesizes `ctrlKey` for pinch), small `deltaY`.
- **Cmd/Ctrl + mouse wheel** → `wheel` with `e.ctrlKey`/`e.metaKey` true,
  larger notched `deltaY`.

Both should map to the **same** continuous-zoom handler; plain scroll (no
modifier) must keep scrolling the artboard untouched.

**Where:** attach inside `Viewport.tsx`, because it already holds
`scrollContainerRef` (the element that scrolls), `frameRef` (for cursor
anchoring), and the current `scale`. Add a `useEffect` that registers a
**non-passive** `wheel` listener (`{ passive: false }`) on
`scrollContainerRef.current` so `preventDefault()` can suppress the browser's
default pinch-zoom / scroll.

**Handler logic:**

```
onWheel(e):
  if not (e.ctrlKey || e.metaKey): return        // let normal scroll happen
  e.preventDefault()
  const old = userZoom ?? fitScale                 // current effective scale
  // Exponential feels linear to the hand; tune ZOOM_SENSITIVITY (~0.01).
  const next = clamp(old * Math.exp(-e.deltaY * ZOOM_SENSITIVITY),
                     MIN_ZOOM, MAX_ZOOM)
  setZoom(next)
  // Cursor anchoring — keep the point under the pointer fixed:
  //   logicalX = (e.clientX - frameRect.left) / old
  //   after scale change, adjust scrollLeft so logicalX*next stays under
  //   the cursor. Same for Y. (see math below)
```

- **New constants** (in `canvasSlice.ts` alongside `ZOOM_STEPS`):
  `MIN_ZOOM = 0.1`, `MAX_ZOOM = 4`. The discrete `ZOOM_STEPS` ladder stays a
  subset used by buttons/keyboard; continuous wheel zoom is clamped to this
  wider range.
- **Cursor anchoring math** (frame uses `transform-origin: top left`):
  ```
  rect = frameRef.getBoundingClientRect()
  logicalX = (e.clientX - rect.left) / old
  logicalY = (e.clientY - rect.top)  / old
  // after React commits `next`, shift scroll so the same logical point
  // sits back under the cursor:
  container.scrollLeft += logicalX * (next - old)
  container.scrollTop  += logicalY * (next - old)
  ```
  Because scale application and the scroll adjustment happen in different
  frames (state → re-render → transform), do the scroll correction in a
  `useLayoutEffect` keyed on `scale`, using the last wheel point stashed in a
  ref. (Documented as a `docs/notes/` entry if it grows past a couple lines.)
- **Throttling:** trackpad pinch fires many events; setZoom on every event is
  fine (Zustand + React batch), but consider `requestAnimationFrame`-coalescing
  if profiling shows churn. Start simple, measure.

---

## Files touched

| File | Change |
|---|---|
| `store/canvas/slices/ui.ts` | add `fitScale` state + `setFitScale`; default `1` |
| `store/canvasSlice.ts` | add `fitScale`/`setFitScale` to `CanvasState`; add `MIN_ZOOM`/`MAX_ZOOM` consts; optional `selectEffectiveScale` selector |
| `canvas/Viewport.tsx` | write `setFitScale`; add non-passive wheel listener + cursor-anchored continuous zoom |
| `components/ZoomControls.tsx` | read `fitScale`; dynamic percentage in label tooltip + aria-label |
| `controls/Tooltip.tsx` | auto-flip top/bottom; optional `placement` prop |
| `controls/Tooltip.module.css` | `.bottom` modifier + bottom fade-in keyframe |

No IPC, no `src/renderer/lib/` pure-function changes → the `lib/` test
mandate isn't triggered, but see testing below.

---

## Testing

- **Tooltip flip** — the vertical-room decision is testable logic. If we
  extract `resolvePlacement(triggerRect, tipHeight, viewportH)` as a small
  pure helper, add unit tests (room above → `top`; near top edge → `bottom`).
- **Wheel → zoom mapping** — extract the delta→scale step
  (`nextZoomFromWheel(old, deltaY)` with clamp) as a pure helper in `lib/` and
  unit-test it (zoom in, zoom out, clamp at `MIN_ZOOM`/`MAX_ZOOM`, fit-mode
  anchor). Keeping it pure keeps the gesture math out of the component and
  satisfies the "test everything in `lib/`" rule.
- **Manual QA** (per CLAUDE.md, warn before regen if dev server is running):
  pinch in/out on a trackpad; Cmd/Ctrl+wheel on a mouse; plain scroll still
  scrolls; cursor stays anchored while zooming; tooltips on the top toolbar
  render fully below the trigger; zoom label tooltip shows the live percentage
  in both fit and explicit modes.

---

## Open questions for review

1. **Label text in fit mode** — keep resting label as `Fit` (percentage only
   in the tooltip), or switch the label itself to `Fit 67%`? Plan assumes the
   former (no layout jump); easy to change. no change to the label.
2. **Continuous vs. snap** — should Cmd/Ctrl+wheel do *continuous* zoom (as
   proposed) or snap along the discrete `ZOOM_STEPS` ladder like the buttons?
   Trackpad pinch really wants continuous; mouse wheel could go either way.
   Recommendation: continuous for both, consistent + simplest. yes lets go with continuous.
3. **Min zoom floor** — `MIN_ZOOM = 0.1` proposed. Fit can already resolve
   below `0.25` for very wide canvases, so the continuous floor must be below
   the ladder's `0.25`. Confirm `0.1` is low enough / not too low. yes thats fine.
4. **Cursor anchoring** — worth the extra `useLayoutEffect` complexity, or is
   simple center-anchored zoom acceptable for v1? Recommendation: ship cursor
   anchoring; it's the expected feel and the math is contained. yes lets do cursor anchoring

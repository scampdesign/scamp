# Plan — Component canvas sizing (match source, resize, hug-to-content)

## Goal

Three related improvements to the **component editor's** artboard:

1. **Match on creation** — when a component is created from a page element, the
   component editor's canvas should open at that element's *rendered* size, even
   if the element uses `stretch`/percentage sizing.
2. **Resize handles** — the component artboard should have draggable resize
   handles.
3. **Double-click to hug** — double-clicking a handle resizes the artboard to
   tightly fit (hug) its content.

## What already exists (from investigation)

This request is smaller than it looks — most plumbing is in place:

- **Per-component canvas size is already stored** in `scamp.config.json` as
  `componentCanvas[name] = { width, height }` (`src/shared/types.ts:242,245`),
  falling back to `DEFAULT_COMPONENT_CANVAS_SIZE = 480×320` (`types.ts:281`).
  It's read on open in `CanvasArea.tsx:182-195` (→ Viewport width/height) and
  `useProjectStoreSync.ts:93-100` (→ `setCanvasMinHeight`).
- **Resize handles already exist** — four corner handles on the component
  artboard (`Viewport.tsx:489-516`), gated on `onResize && isRootSelected`.
  Dragging commits to `componentCanvas[name]` via `CanvasArea.tsx:204-218` →
  `onProjectConfigChange` → `writeProjectConfig` IPC. Page mode passes no
  `onResize`, so no handles there.
- **Content-extent is already measured** — `measureFrame` computes
  `content = { right, bottom }`, the furthest rendered element edge in logical
  px (`Viewport.tsx:246-265`).

So the three gaps are:

1. The convert flow **never seeds** `componentCanvas[name]`, so new components
   open at the 480×320 default (`handleConvertToComponent`,
   `useInstanceFlows.ts:114-150`; `replaceSubtreeWithInstance` copies the source
   element's sizing verbatim but nothing records its *pixel* size).
2. The handles only show when the **root element is selected** — not
   discoverable when you first open a component (root isn't auto-selected).
3. **No double-click handler** exists on any handle, and `measureFrame`'s
   `content` is floored by `frame.clientWidth/clientHeight` (so it can only
   grow, never shrink to hug).

---

## Phase 1 — Seed canvas size from the source element on convert

**Where:** `handleConvertToComponent` in
`src/renderer/src/components/projectShell/useInstanceFlows.ts:114-150`.

**Change:**
1. **Before** `state.replaceSubtreeWithInstance(elementId, name)` runs (which
   removes the subtree from the page), measure the source element while it's
   still mounted on the page canvas:
   ```ts
   const node = document.querySelector(`[data-element-id="${elementId}"]`);
   const width  = node instanceof HTMLElement ? node.offsetWidth  : undefined;
   const height = node instanceof HTMLElement ? node.offsetHeight : undefined;
   ```
   `offsetWidth/Height` are logical (scale-independent) px, so this captures the
   true rendered size even for `stretch`/`%` elements (same technique as
   `useCanvasGeometry.ts:47-70`).
2. After the component is created, write the measured size into project config
   (same shape as `CanvasArea.tsx:208-215`), clamped to
   `MIN/MAX_COMPONENT_CANVAS_DIM` (20 / 4000):
   ```ts
   componentCanvas: {
     ...(projectConfig.componentCanvas ?? {}),
     [name]: { width: clampDim(width), height: clampDim(height) },
   }
   ```

**Wiring:** `useInstanceFlows` currently takes `onProjectChange` (components
list) but not the config setter. Add `projectConfig` + `onProjectConfigChange`
to its args (both already available in `ProjectShell`), or write directly via
`window.scamp.writeProjectConfig`. Prefer threading `onProjectConfigChange` so
in-memory config stays in sync (avoids a reload race).

**Result:** a component converted from a 1440-wide stretch hero opens on a
1440-wide canvas; its `width: 100%` root then renders at 1440 and matches the
page. A converted 320×200 card opens at 320×200.

**Scope note:** this applies to **convert-from-element only**. "New component
from scratch" keeps the 480×320 default (open question #4).

---

## Phase 2 — Hug-to-content on double-click

**New measurement primitive.** `measureFrame`'s `content` is floored by the
frame's own `clientWidth/Height` and includes the root element (which fills the
frame), so it can't shrink. Add a tight-content measurement that ignores the
root and isn't floored by the frame:

```ts
// Returns the tight bounding box of the root's descendants, in logical px.
// null when there's no non-root content (empty component).
const measureContentSize = (): { width: number; height: number } | null
```
- Iterate `frame.querySelectorAll('[data-element-id]')`, **skip** `id="root"`.
- Union each node's `getBoundingClientRect()` (scaled back by `appliedScale`,
  as `measureFrame` does) into a max right/bottom from the frame origin.
- Add the root's `padding-right` / `padding-bottom` so the hug includes the
  root's own padding (open question #3).
- Clamp to `MIN_COMPONENT_CANVAS_DIM`.

**Wire double-click on the handles.** In `Viewport.tsx:489-516`, add
`onDoubleClick` to each of the four handle divs:
```ts
onDoubleClick={() => {
  const fit = measureContentSize();
  if (fit && onResize) onResize(fit.width, fit.height);
}}
```
`onResize` already persists to `componentCanvas[name]`, so a hug is durable and
undoable via config history like a drag. This is also the first path that
commits the *measured* height as the stored height (today content growth past
the min-height is never written back).

**Stretch caveat (documented, not solved):** if a top-level child is itself
`stretch`/`100%`, its rendered width equals the canvas, so hug can't shrink that
axis (a stretch box is "as wide as its container" by definition). Hug still
works on height and on fixed/auto/hug-width content. This is inherent and worth
a one-line note in the user doc.

---

## Phase 3 — Make the handles discoverable

The handles already work but are hidden until the root is selected, which reads
as "there are no handles" when you first open a component.

**Option A (recommended):** in the component editor, show the artboard handles
whenever `activeComponent` is set (not gated on `isRootSelected`) — the artboard
*is* the component, so its handles should always be present. Keep the
page-mode behavior unchanged (no handles).

**Option B:** auto-select the root element when a component opens, so the
existing `isRootSelected` gate lights up the handles.

Either way, add a `title`/tooltip on the handles noting the double-click-to-hug
shortcut (they currently say `title="Drag to resize"` → e.g.
`"Drag to resize · double-click to fit content"`).

---

## Files to touch

| Area | File |
|---|---|
| Seed on convert | `src/renderer/src/components/projectShell/useInstanceFlows.ts` (+ pass config setter from `ProjectShell.tsx`) |
| Clamp helper | reuse `MIN/MAX_COMPONENT_CANVAS_DIM` (`src/shared/types.ts`); small `clampDim` local or in `lib/bounds.ts` |
| Hug measurement + dblclick | `src/renderer/src/canvas/Viewport.tsx` (add `measureContentSize`, `onDoubleClick` on handles) |
| Handle visibility + tooltip | `src/renderer/src/canvas/Viewport.tsx` (gate + `title`) |
| Docs | `docs/user_docs/components.md` (canvas sizing / hug), `docs/notes/` if a note is warranted |

## Testing

- **Unit (`lib/`, if a pure helper lands there):** a `clampDim` and/or a pure
  "tight bounds from a list of rects" function (if I extract the math out of the
  DOM walk) — test empty list, single rect, overlapping rects, min clamp.
- **E2E (`test/e2e/components/`):**
  - Convert a fixed-size element → open the component → assert the artboard
    frame width/height match the source (read `componentCanvas` from the written
    `scamp.config.json`, or assert the frame's box).
  - Convert a stretch/full-width element → component canvas ≈ page width (not
    480).
  - Draw content smaller than the canvas, double-click a handle → canvas shrinks
    to the content bounds; assert new `componentCanvas[name]`.
  - Handles visible on component open (Phase 3).

## Open questions for review

1. **Handle visibility (Phase 3)** — always show artboard handles in the
   component editor (Option A, recommended), or auto-select the root on open so
   the existing gate lights up (Option B)? yes option A
2. **Hug axis** — should double-click hug **both** width and height
   (recommended), or should each corner/edge hug only its own axis? yes both is good
3. **Root padding in hug** — include the root's own `padding` in the hugged
   size (recommended, so the component keeps its breathing room), or hug tight
   to the outermost child edges? yes if the root has padding applied, or margin respect those
4. **Scope of "match on creation"** — only convert-from-element (recommended),
   or should "new component from scratch" also change (e.g. a smaller default)? I think only on convert from element. the other updates in thisproject like handle visibiliy and double click to hug take care of components built from scratch.
5. **Very wide stretch sources** — converting a 1440-wide stretch element seeds
   a 1440-wide component canvas. Confirm that's desired (it matches the page),
   vs. clamping to something smaller with the root still `width:100%`. yes that is whats desired, if its 1400 wide when converted thats what the canvas size should be, but remember the canvas size is not the component sizing so the component might still have width:100% on its root.
6. **Hug on the page canvas?** — this plan scopes handles + hug to the component
   editor (where they already live). Do you also want a hug affordance on the
   page artboard, or leave the page as-is (grows with content, panel-sized)? no we dont need it on the page canvas right now.

# Locked Aspect Ratio Resize — Plan

Backlog: `docs/backlog-6.md` story #1. Status: **proposed** — for review.

## Goal

Let a user lock an element's width:height ratio so that changing one
dimension scales the other proportionally — both from the WYSIWYG Size panel
and from the canvas corner handles. Lock state is **session-only UI state**,
per element, never written to CSS / the element model / disk.

---

## How sizing & resize work today

- **Element model** (`lib/element/types.ts`): each element has
  `widthMode` / `heightMode` (`'fixed' | 'stretch' | 'fit-content' | 'auto'`),
  `widthValue` / `heightValue` (px numbers), and `widthCustom` /
  `heightCustom` (verbatim non-px strings). Only `fixed` mode emits a concrete
  px value the ratio can be computed against.
- **Panel** (`components/sections/SizeSection.tsx`): two rows, each a
  `PrefixSuffixInput` (`W` / `H`) + an `EnumSelect` mode dropdown. Commits go
  through `sizePatchForWidth` / `sizePatchForHeight` → `patchElement`. Both are
  pure-ish local helpers that parse the typed CSS length and build a patch.
- **Canvas resize** (`canvas/interactions/useResizeInteraction.ts`): a pointer
  state machine driven by 8 handles (`nw n ne e se s sw w`). `onMove` computes
  `dx/dy`, adjusts `x/y/w/h` per handle, clamps via `clampToParent`
  (`lib/bounds.ts`, `MIN_SIZE = 20`), and calls `resizeElement` — which forces
  **both axes to `fixed`**.
- **Handles** are rendered by `SelectionOverlay.tsx` (a pure presentational
  component: a `HANDLES` array → `data-handle` divs). Hit-testing keys off
  `data-handle` in `canvasHitTest.isResizeHandle`. The overlay is shown for a
  single selection that isn't the page root or a flex child.
- **Precedent for per-element transient maps**: `cssDuplicates:
  Record<string, ...>` already lives in the store keyed by element id — the
  ratio-lock map follows the same shape.

---

## Design

### 1. Lock state — store map, session-only

Add to the UI slice (`store/canvas/slices/ui.ts` + `CanvasState`):

```ts
/** Per-element locked aspect ratio (width / height), session-only. A
 *  present entry = locked; the number is the frozen ratio captured when
 *  the lock was enabled. Never persisted. */
ratioLocks: Record<string, number>;

toggleRatioLock: (id: string) => void;   // capture ratio on enable, delete on disable
clearRatioLock: (id: string) => void;    // used by auto-disable
```

- `toggleRatioLock(id)` reads `elements[id]`; if unlocked, it captures
  `ratio = widthValue / heightValue` **only when both axes are `fixed`**
  (otherwise it's a no-op — see gating below). If locked, it deletes the key.
- The ratio is frozen at lock time and does not change until toggled off/on
  (per the story). Because it's stored as a number, subsequent proportional
  edits don't drift it.
- A derived selector `selectIsRatioLocked(id)` returns `true` only when the
  key is present **and** both axes are currently `fixed` — this makes the
  "auto-disable when an axis becomes non-fixed" rule fall out for free even if
  a stale key lingers. We still call `clearRatioLock` on mode change for
  cleanliness (below).
- Clear the whole map in `resetForNewPage` so ids don't leak across pages.

> Why store the frozen ratio rather than recompute from live dims each edit:
> recomputing would let rounding drift the ratio over successive edits; the
> story explicitly wants a stable ratio between toggles.

### 2. Ratio math — pure, in `lib/` (tested)

New `src/renderer/lib/aspectRatio.ts`:

```ts
export const ratioOf = (w: number, h: number): number => w / h;

/** Dependent dimension from a driver + frozen ratio, floored at minSize. */
export const heightFromWidth = (w: number, ratio: number, min: number): number
export const widthFromHeight  = (h: number, ratio: number, min: number): number

/** Proportional corner resize. Given the grabbed handle, origin box,
 *  pointer delta, frozen ratio and minSize, return the new {x,y,w,h}
 *  with the opposite corner anchored. Drives off whichever axis moved
 *  more so the gesture feels natural, derives the other from the ratio. */
export const lockedCornerResize = (args: {
  handle: 'nw' | 'ne' | 'se' | 'sw';
  originX: number; originY: number; originW: number; originH: number;
  dx: number; dy: number; ratio: number; minSize: number;
}): { x: number; y: number; w: number; h: number }
```

`lockedCornerResize` anchors the corner opposite the grabbed one:
- `se` → anchor TL: grow w/h, `x,y` fixed.
- `sw` → anchor TR: `x = originX + (originW - w)`.
- `ne` → anchor BL: `y = originY + (originH - h)`.
- `nw` → anchor BR: shift both `x` and `y`.

Keeping this in `lib/` (not the hook) satisfies the "everything in
`src/renderer/lib/` must be fully tested" rule and lets us cover every corner
+ the min-size floor + the drive-axis choice without a DOM.

### 3. Panel UI — lock toggle + proportional commit

`SizeSection.tsx`:

- **Lock control** between the W and H rows. Given the current stacked
  two-row layout (each row already carries a mode dropdown, so the inline
  `W […] 🔗 H […]` mock doesn't fit as-is), the recommendation is a thin
  centered control row with a chain-link toggle button:
  ```
  W  [ 400  px ]  [Fixed ▾]
          ⛓ (locked)          ← click to toggle
  H  [ 300  px ]  [Fixed ▾]
  ```
  Uses a Tabler chain icon (`IconLink` / `IconLinkOff`, already a dep).
  Disabled (greyed) when either axis isn't `fixed`, with a tooltip
  explaining why.
- **Proportional commit**: extend the size-patch helpers into a pure
  `lockedSizePatch(element, axis, raw, ratio | null)` in `lib/` that, when a
  ratio is present and the parsed value is fixed-px, adds the paired
  dimension (`heightValue`/`widthValue`, kept `fixed`) to the patch. When
  unlocked, behaviour is identical to today. This makes "type width, Tab →
  height recalculates before focus moves" work: the commit fires on
  blur/Enter (which is what Tab triggers) and patches both fields in one
  `patchElement`.
- **Auto-disable**: the mode `EnumSelect` `onChange` and any commit that
  parses to a non-fixed mode call `clearRatioLock(elementId)`.

### 4. Canvas — corner-only handles + proportional drag + on-overlay toggle

- **Handles when locked**: `SelectionOverlay` gains a `ratioLocked?: boolean`
  prop. When true it renders only the 4 corner handles (`nw ne se sw`) and
  omits the edge handles (`n e s w`) — matching "edge handles are disabled
  when ratio lock is on."
- **Lock badge on the overlay**: `SelectionOverlay` gains an `onToggleLock`
  callback and renders a small chain-link toggle button (e.g. pinned just
  outside the top-left corner). Its `onPointerDown` **must
  `stopPropagation()`** so the interaction layer's pointer-down doesn't start
  a drag/marquee; `onClick` calls `onToggleLock`. Wire the prop from
  `CanvasInteractionLayer` where `SelectionOverlay` is rendered (it already
  has `selectedElementId`).
- **Proportional drag**: in `useResizeInteraction.onMove`, when the selected
  element is ratio-locked, route through `lockedCornerResize(...)` instead of
  the current per-edge branch, then `clampToParent` as today and
  `resizeElement`. Edge handles won't reach here because they aren't rendered,
  but guard anyway (ignore a non-corner handle when locked).
- `resizeElement` already forces both axes `fixed`, so a proportional drag
  keeps the element in the ratio-lockable state — no extra work.

### 5. Auto-disable on fixed → stretch/auto

Two layers, belt-and-suspenders:
1. `selectIsRatioLocked` returns false unless both axes are `fixed` (the lock
   has no *effect* the moment an axis leaves fixed).
2. `clearRatioLock` is called explicitly from the mode-change / non-fixed
   commit paths so the stored key doesn't linger.

---

## Files touched

| File | Change |
|---|---|
| `lib/aspectRatio.ts` *(new)* | `ratioOf`, `heightFromWidth`, `widthFromHeight`, `lockedCornerResize`, `lockedSizePatch` |
| `store/canvas/slices/ui.ts` | `ratioLocks` map + `toggleRatioLock` / `clearRatioLock`; clear in `resetForNewPage` |
| `store/canvasSlice.ts` | add fields to `CanvasState`; `selectIsRatioLocked` selector |
| `components/sections/SizeSection.tsx` | lock toggle control; proportional commit via `lockedSizePatch`; auto-disable calls |
| `canvas/SelectionOverlay.tsx` | `ratioLocked` (corner-only handles) + `onToggleLock` badge |
| `canvas/SelectionOverlay.module.css` | badge styling |
| `canvas/CanvasInteractionLayer.tsx` | pass `ratioLocked` + `onToggleLock` to overlay |
| `canvas/interactions/useResizeInteraction.ts` | locked path → `lockedCornerResize` |

No `parseCode` / `generateCode` / IPC / file-format changes — lock is pure UI
state, so round-trip and sync are untouched.

---

## Testing

- **`lib/aspectRatio.ts` (unit, required by the lib mandate)**:
  - `ratioOf`, `heightFromWidth`, `widthFromHeight` incl. min-size floor and
    rounding.
  - `lockedCornerResize` for all four corners: correct anchored `x/y`,
    ratio preserved, `MIN_SIZE` clamp, and the drive-axis choice (drag mostly
    horizontal vs mostly vertical).
  - `lockedSizePatch`: locked width commit emits paired `heightValue` (fixed);
    unlocked commit is byte-identical to the current `sizePatchForWidth`
    output; non-fixed parse drops the pairing.
- **Store**: `toggleRatioLock` captures ratio only when both axes fixed;
  no-ops otherwise; `selectIsRatioLocked` flips false when an axis leaves
  fixed; `clearRatioLock` deletes.
- **Manual QA** (warn before shim regen if dev server is running):
  panel lock recalculates the partner field on Tab; corner drag scales
  proportionally; edge handles absent when locked; overlay badge toggles
  without starting a drag; switching a mode to Stretch drops the lock;
  lock survives clicking away and back within the session.

---

## Open questions for review

1. **Panel lock placement/affordance** — a centered chain-link row between W
   and H (recommended, fits the existing two-dropdown layout) vs. restructuring
   the Size section into a single `W | 🔗 | H` inline row (matches the mock but
   crowds out the mode dropdowns). Which do you want? dont restructure it should be between the two rows for now.
2. **Locking when an axis isn't `fixed`** — the story says stretch/auto can't
   be ratio-locked, so the plan **gates the lock to both-axes-fixed** (control
   disabled otherwise). Alternative: allow enabling from computed/measured
   sizes and snap both axes to fixed on lock. Recommendation: gate to fixed —
   simpler and matches the note. OK? if a user enables the lock on a value that isnt fixed we convert it to fixed.
3. **Corner drag drive-axis** — recommendation is "drive off whichever of
   dx/dy is larger, derive the other from the ratio" (feels natural in any
   direction). Alternative: always drive off width. OK with the larger-delta
   approach? always derive off width is fine for now.
4. **On-canvas badge position** — proposed just outside the top-left corner of
   the selection. Any preference (e.g. centered above the selection, or by the
   handles)? agreed.

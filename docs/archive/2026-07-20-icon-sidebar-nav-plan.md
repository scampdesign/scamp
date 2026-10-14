# Plan — Icon sidebar nav (Pages / Components / Design System / History / Settings)

## Goal

Replace the project view's 2-tab left sidebar with a **vertical icon rail**
(VS Code "activity bar" style) that switches the sidebar between five sections:

1. **Pages**
2. **Components**
3. **Design System** (Theme tokens)
4. **History**
5. **Settings**

## What exists today (from investigation)

- The left sidebar is inline in `ProjectShell.tsx` (`<aside className={styles.sidebar}>`,
  240px). It has a **2-tab strip** driven by `leftSidebarTab: 'layers' | 'history'`
  (`canvasSlice.ts:239`):
  - **`layers` tab** stacks three sections: `PageSidebar` (Pages) + `ComponentSidebar`
    (Components) + `ElementTree` (Layers). (`ProjectShell.tsx:368-411`)
  - **`history` tab** renders `HistoryPanel`.
- **Design System / Theme** = `ThemePanel`, a **portal modal** (backdrop + centered
  dialog, internal tabs colors/typography), opened from the canvas `Toolbar` (`IconPalette`)
  → `onOpenTheme`. (`ThemePanel.tsx`, `Toolbar.tsx:79-90`)
- **Settings** = `ProjectSettingsPage`, a **full-screen overlay** (`position:absolute;
  inset:0; z-index:10`) with General/Breakpoints/Fonts, opened from the canvas `Toolbar`
  (`IconSettings`) → `onOpenSettings`. (`ProjectSettingsPage.tsx`)
- **Cmd/Ctrl+Shift+H** toggles `leftSidebarTab` between layers/history
  (`useCanvasKeyboardShortcuts.ts:207-221`).
- Icons: **`@tabler/icons-react`** (already used throughout). `IconPalette` + `IconSettings`
  already in the toolbar.

So four surfaces converge into the rail: Pages/Components/Layers (stacked today),
History (already a tab), Theme (modal), Settings (overlay).

## Proposed design

### The rail

A new `SidebarRail` component: a narrow (~48px) vertical column pinned to the far
left of `.body`, before the sidebar panel. Five icon buttons, top-aligned; the
active one is highlighted (accent bar / filled). Layout becomes:

```
[ rail 48px ] [ sidebar panel ~240px ] [ CanvasArea flex:1 ] [ PropertiesPanel ]
```

Icons (all exist in tabler): Pages `IconFiles`, Components `IconComponents`,
Design System `IconPalette`, History `IconHistory`, Settings `IconSettings`.
Each has a tooltip (`title`) with its name + shortcut. Styling matches the chrome:
`var(--bg-surface)` bg, `var(--border)` right border, `var(--text-secondary)` idle,
`var(--accent)` + `var(--text-primary)` active — mirroring `.sidebarTab` /
`.sidebarTabActive`.

### State

Generalize `LeftSidebarTab` → a 5-way section enum in `canvasSlice.ts`:

```ts
export type SidebarSection =
  | 'pages' | 'components' | 'designSystem' | 'history' | 'settings';
```

Rename `leftSidebarTab`/`setLeftSidebarTab` → `sidebarSection`/`setSidebarSection`
(session-only, not persisted — as today). Default `'pages'`.

### Per-section content (in the sidebar panel to the right of the rail)

| Section | Renders |
|---|---|
| **Pages** | `PageSidebar` + **Layers** (`ElementTree`) — see open question #1 |
| **Components** | `ComponentSidebar` (+ Layers when editing a component — Q1) |
| **Design System** | Theme-token editor — inline vs. modal is open question #2 |
| **History** | `HistoryPanel` (unchanged) |
| **Settings** | Project settings — inline vs. overlay is open question #3 |

### Triggers & shortcuts

- Remove the Theme + Settings buttons from the canvas `Toolbar` (they move to the
  rail), and drop the `onOpenTheme`/`onOpenSettings` plumbing through `CanvasArea`
  — the rail sets `sidebarSection` directly. (Confirm in Q4 — some may want the
  toolbar Theme button to stay.)
- Update Cmd/Ctrl+Shift+H to jump to `history`. Optionally add
  Cmd+1..5 to select sections (Q5).

## Suggested phasing

- **Phase 1 — the rail + reuse existing surfaces.** Build `SidebarRail`, the
  section enum, and wire Pages / Components / History as inline panels (reusing
  `PageSidebar`, `ComponentSidebar`, `ElementTree`, `HistoryPanel`). For Design
  System + Settings, the rail icon **opens the existing `ThemePanel` modal /
  `ProjectSettingsPage` overlay** (lowest risk — no rework of those big surfaces).
  Ships the new nav quickly.
- **Phase 2 (optional) — inline Design System + Settings.** Rework `ThemePanel`
  and/or `ProjectSettingsPage` to render *inside* the sidebar panel so all five
  are true in-panel sections. More work (both are currently overlay-shaped).

This lets the rail land fast; Phase 2 is a follow-up if you want full consistency.

## Files to touch

| Area | Files |
|---|---|
| Rail | `src/renderer/src/components/projectShell/SidebarRail.tsx` (new) + `.module.css` |
| Shell layout | `ProjectShell.tsx` (replace tab strip with rail + section switch), `ProjectShell.module.css` (rail column, panel) |
| State | `canvasSlice.ts` (`SidebarSection` enum, field, setter — rename from `leftSidebarTab`) |
| Shortcuts | `useCanvasKeyboardShortcuts.ts` (Cmd+Shift+H → `history`; optional Cmd+1..5) |
| Toolbar | `Toolbar.tsx` + `CanvasArea.tsx` (remove Theme/Settings buttons + plumbing — Q4) |
| Theme/Settings (Phase 2) | `ThemePanel.tsx`, `ProjectSettingsPage.tsx` (inline variants) |

## Testing

- **E2E (`test/e2e/`)**: the rail shows 5 icons; clicking each switches the panel
  (Pages list ↔ Components list ↔ History timeline ↔ Design System ↔ Settings);
  Cmd+Shift+H jumps to History; the active icon is highlighted. Existing specs that
  assume the `Pages & Layers` / `History` tab strip (e.g. `snapshots/history-panel.spec.ts`
  "Cmd+Shift+H toggles…", any layers-panel spec) will need updating to the rail.
- No new pure `lib/` functions expected (this is composition/UI), so no mandatory
  unit tests — but a small pure helper for section→icon/label mapping could be unit-tested.

## Open questions for review

1. **Where do Layers (the element tree) live?** Options:
   (a) **Keep Layers under the Pages section** (Pages = page list + layers of the
   active page) — recommended, matches today's "Pages & Layers"; when editing a
   component the tree shows that component's elements.
   (b) Show Layers under **both** Pages and Components (contextual to the active doc). 
   (c) Make Layers a **persistent** section always visible below the panel regardless
   of the selected rail section. B is the correct answer here.
2. **Design System section** — (a) rail icon **opens the existing ThemePanel modal**
   (Phase 1, low effort), or (b) **rework it into an inline sidebar panel** (Phase 2)? lets go with A I have another project for us to work on later to rework the theme panel.
3. **Settings section** — (a) rail icon **opens the existing full-screen
   ProjectSettingsPage** (Phase 1), or (b) **inline sidebar panel** (Phase 2)? (Settings
   is currently full-screen with several config areas, so the overlay may actually be
   the better home even long-term.) A
4. **Canvas toolbar** — remove the Theme + Settings buttons from the canvas toolbar
   now that they're in the rail, or keep them as secondary entry points? remove them.
5. **Shortcuts** — keep only Cmd+Shift+H (→ History), or also add Cmd+1..5 to select
   Pages/Components/Design System/History/Settings? keep the existing.
6. **Rail position** — a dedicated ~48px icon rail to the LEFT of the 240px panel
   (recommended, VS Code style), or replace the current top tab-strip with a
   horizontal icon row inside the existing 240px sidebar? to the left ike VS code.

# Resizable panels and full names

> As a designer, I want to resize the left panel (Layers and Pages) so
> that long item names are fully visible instead of being cut off.

Four parts, built in this order. Each part works on its own.

1. Resize the left panel.
2. Show a cut-off name in full on hover.
3. Collapse the left panel.
4. Resize the bottom code and terminal panel.

## Decisions

- **The sizes are app-wide, not per project.** That's the lightest
  build: `localStorage` on this machine, with no project config and no
  IPC.
- **The left panel goes up to 480px.**
- **The right properties panel stays fixed.**
- **The three items that were out of scope are now in it:** full-name
  tooltips, collapsing the left panel, and resizing the bottom panel.

## Where it stands

- `.sidebar` in `ProjectShell.module.css` is a fixed `240px`; the Agent
  section swaps in `.sidebarWide` at `320px`. The rail is `48px` and the
  properties panel `260px`.
- Layer, page, and component names truncate with an ellipsis
  (`ElementTree.module.css` `.label`, `ComponentSidebarItem.module.css`).
  A layer row's tooltip shows only its CSS class, and page and
  component rows have none.
- The sidebar holds every section the rail switches to: Pages, Components,
  History, Agent, Learn, and the Design System's section list.
- The code panel and the terminal are both a fixed `280px` high
  (`CodePanel.module.css`, `TerminalPanel.module.css`), and the store's
  `bottomPanel` says which is open.
- Nothing in the app resizes by drag yet, so there's no handle to reuse.
- The canvas re-fits its zoom from a `ResizeObserver` on its container
  (`Viewport.tsx`), and the terminal re-fits xterm from one too
  (`TerminalView.tsx`). Both panels can change size without new layout
  code. An explicit user zoom stays put.
- **Cmd+B** isn't bound to anything.

## Shared pieces

- `src/renderer/lib/panelSizes.ts` (pure, tested): the limits for both
  panels, `clampSidebarWidth(width, windowWidth)`,
  `clampBottomHeight(height, windowHeight)`, and
  `parseStoredSize(raw: unknown, fallback: number)`.
- `src/renderer/src/components/controls/ResizeHandle.tsx` plus its CSS
  module. One component, with `orientation: 'vertical' | 'horizontal'`:
  - pointer capture on `pointerdown`, and rAF-throttled updates
  - double-click resets the panel
  - a focusable `role="separator"` with `aria-orientation`,
    `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`
  - arrow keys move it 16px, and Home and End jump to the limits
  - a 6px hit area that straddles the border, which turns
    accent-colored on hover and while dragging
- **State:** `sidebarWidth`, `sidebarCollapsed`, and `bottomPanelHeight`
  join the store's UI slice (`src/renderer/store/canvas/slices/ui.ts`),
  next to `sidebarSection` and `bottomPanel`.
- **Persistence:** read once on load, and written when a drag ends or
  the panel collapses. The keys are `scamp.sidebarWidth`,
  `scamp.sidebarCollapsed`, and `scamp.bottomPanelHeight`. Every read
  and write is wrapped in `try`, because storage can be unavailable.
  The start screen's card or list view is stored the same way.

## 1. Resize the left panel

- Drag the sidebar's right edge to resize it.
- **Limits:** 200px minimum, and a maximum of 480px or whatever leaves
  the canvas 320px wide, whichever is smaller. A 1024px window caps it
  at 396px.
- Double-click the edge to go back to 240px.
- **One width for every section.** The Agent section draws at
  `max(width, 320)` and doesn't change the stored width, so going back
  to Layers returns to your width. This replaces `.sidebarWide`.
- **When the window gets smaller,** the width is clamped again so the
  canvas keeps 320px. The stored width stays, and comes back when the
  window grows.
- ProjectShell sets `style={{ width }}` on the `<aside>`, and the
  handle is its last child.

## 2. Show a cut-off name in full

- **Layer rows** always have a tooltip. The full name is the header,
  and the CSS class is the body, using `Tooltip`'s existing `header`
  prop. For example, **Hero Card Primary Action** over
  `.hero_card_primary_action_a1b2`.
- **Page, view, and component rows** show the full name in a tooltip
  only when it's cut off. The row checks
  `scrollWidth > clientWidth` on its label when the pointer enters.
  The check runs on hover, not on render, so a long list costs nothing.
  If `Tooltip` doesn't already skip an empty label, it gains that.
- The ellipsis stays. The tooltip is for names that don't fit even
  after a resize, and for anyone who doesn't resize.

## 3. Collapse the left panel

- **Click the rail button of the section that's already open** to
  collapse the panel, and click it again to open it. The rail stays.
  Clicking any other section while it's collapsed opens the panel on
  that section.
- **Cmd+B** (macOS) or **Ctrl+B** (Windows and Linux) collapses or
  opens it. It's skipped while a text field or the CSS editor has
  focus, the same rule the tool shortcuts follow.
- **Dragging the edge below 120px** snaps the panel closed when you
  let go. The stored width stays at whatever it was before the drag,
  so opening the panel again returns to it.
- **While it's collapsed,** the active section's rail button shows as
  not pressed, and its `aria-expanded` is `false`.
- **The tutorial:** the **Tutorial** pill lives in the sidebar, so it
  hides with it. The spotlight already rings the **Components** rail
  button, which still works collapsed. The **Learn** rail button
  opens the panel on the steps.

## 4. Resize the bottom panel

- **Drag the top edge** of the code panel or the terminal to resize it.
  One height is shared by both, so switching between them doesn't jump.
- **Limits:** 120px minimum, and a maximum of 70% of the window or
  whatever leaves the canvas 200px tall, whichever is smaller.
- Double-click the edge to go back to 280px.
- The two `height: 280px` rules move to an inline style read from the
  store.

## Tests

- **Unit, `test/panelSizes.test.ts`:**
  - both clamps at their minimum and maximum
  - a narrow or short window keeps the canvas its minimum
  - the Agent floor
  - `parseStoredSize` with a number, a numeric string, garbage, `null`,
    `NaN`, and a negative
- **E2E, `test/e2e/project-view/sidebar-resize.spec.ts`:**
  - dragging the edge widens the sidebar, and a long layer name shows
    in full
  - double-clicking the edge resets it to 240px
  - the width survives going back to the start screen and reopening
    the project
  - the arrow keys move it, and it stops at the limits
  - clicking the open section's rail button collapses the panel;
    clicking it again opens it at the same width
  - **ControlOrMeta+B** collapses and opens it
  - dragging below 120px collapses it
- **E2E, `test/e2e/project-view/bottom-panel-resize.spec.ts`:**
  - dragging the code panel's top edge makes it taller
  - switching to the terminal keeps that height
  - double-clicking the edge resets it
- **E2E, tooltips:** in `test/e2e/layers-panel/tooltips.spec.ts`, a
  layer's tooltip shows its name and class. In the page groups spec, a
  long page name shows a tooltip and a short one doesn't.
- **Rerun** the specs that measure the canvas, the sidebar, or the
  bottom panel, because their sizes move from CSS to inline styles:
  `layers-panel/*.spec.ts`, `canvas/select-move-resize.spec.ts`, the
  code panel and terminal specs, and any spec using `canvas-frame`
  bounds.

## Docs

- `docs/user_docs/layers-panel.md`: "Resize the panel" and "Collapse
  the panel" sections, and a note on the full-name tooltip.
- `docs/user_docs/code-output.md` and `docs/user_docs/terminal.md`: a
  sentence each on dragging the top edge.
- `docs/user_docs/keyboard-shortcuts.md`: **Cmd+B** under Panels, and
  the arrow keys on a focused panel edge.
- `docs/CHANGELOG.md`: Added entries for resizing the left panel,
  collapsing it, and resizing the bottom panel. The tooltips go under
  Changed.

## What was built

All four parts, as planned, with these differences:

- **The sizes have their own store,** `src/renderer/store/panelSizesSlice.ts`,
  rather than joining the canvas store's UI slice. They're a domain of
  their own, the way the tutorial's progress is, and the canvas store
  stays as it was.
- **Opening a collapsed panel:** any switch of section opens it,
  including the tutorial's switch to Learn, not only a rail click.
  ProjectShell watches the section, and skips its first run so a saved
  collapse survives opening a project.
- **The Design System's section list still shows** while the panel is
  collapsed, because the theme editor needs it.
- **Page and view rows keep wrapping** a long name onto two lines, as
  before. They show the tooltip only when a name can't wrap and runs
  past the edge. `Tooltip` gained `onlyWhenTruncated`, which checks the
  trigger's own `scrollWidth` when the pointer enters.
- **A text layer with no name** shows its whole text in the tooltip
  heading; its row still cuts it at 20 characters.
- **The tooltip test** is in `sidebar-resize.spec.ts`, beside the
  resize it depends on, not in `layers-panel/tooltips.spec.ts`.
- **E2E fixtures:** `openPagesSection` and `openComponentsSection` click
  their rail button only when it isn't already pressed, since clicking
  the open section now collapses the panel.
- **A flaky check fixed on the way:** `delete-component.spec.ts` now
  waits for the component folder to go, rather than checking the moment
  the dialog closes.


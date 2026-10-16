# Staging area: draft elements beside the page

Status: **not doing**, 2026-10-16. Superseded by the workspace plan
(`docs/plans/workspace-canvas-plan.md`).

**Why:** a workspace with a scratch component beside your pages covers
what this was for, a place to try things and park elements. It needs no
drafts files, no second root in the store, and none of the 18-site
audit. And it comes with seeing pages and components side by side.

The workspace plan now:
- starts with the Viewport split this plan also needed
- adds scratch components as its phase 4
- keeps dragging between frames as a later phase

That later phase starts from this plan's design for crossing an edge
(section 4). Kept for that, and for the "drafts as code" idea in
section 1.

## The idea

Beside the page on the canvas there's a **staging area**. You can draw
and style elements there with the normal tools and properties panel,
then drag them onto the page when they're ready. You can drag an
element from the page back out to park it.

Decisions already made:
- **One staging area per page or view.**
- **Drafts are committed**, so they're shared through git.
- **Built standalone**, not on the workspace plan
  (`workspace-canvas-plan.md`). It's built so that plan can take it
  over later.

The rule that governs it: **a draft isn't part of the page.** It never
appears in the page's TSX or CSS, the preview, an export, Checks, or
what an agent reads about the page. Dragging it onto the page is what
makes it page code.

## What's there today

- **Only the frame is interactive.** The interaction layer, which
  handles drawing, selecting and moving, sits inside the zoomed page
  frame (`Viewport.tsx`, `CanvasInteractionLayer`). The grey artboard
  around the frame takes no clicks.
- **Positions are kept inside the parent.** Drawing and moving clamp an
  element inside its parent (`useDrawInteraction.ts`,
  `useMoveInteraction.ts`).
- **One element tree.** The store holds one `elements` map and one
  `rootElementId` for the open page. Saving generates code from that
  root (`syncBridge/storeSubscription.ts`).
- **Moving between parents already exists.** `reparentElement`, with
  the drop-container resolution in `useCanvasGeometry` and
  `reparentDrop.ts`
  (`docs/archive/…canvas-drag-reparent-plan.md`).
- **`.scamp/` is ignored by git,** except the agent's history: the
  scaffold writes `.scamp/*` then `!.scamp/agent-history/`
  (`projectScaffold.ts`, `shareAgentHistory`).

## The design

### 1. Drafts are code, stored beside the page

Each page's drafts are a TSX file and a CSS Module, written and read
with the same `generateCode` and `parseCode` as the page:

```
.scamp/drafts/<page key>.tsx
.scamp/drafts/<page key>.module.css
```

- **The page key** is the page's or view's path relative to the
  project, with `/` turned into `__`. So `app/about/page.tsx` becomes
  `app__about__page`, and `views/Home/Home.tsx` becomes
  `views__Home__Home`.
- **The drafts root** is a plain container. Every draft is an
  absolutely positioned child of it, at its spot in the staging area.

**Why code, not JSON:**
- `generateCode` and `parseCode` are the most tested, most stable format
  in the app.
- A draft keeps everything an element can hold (text runs, SVG,
  breakpoints, states) with no second serializer.
- It's readable in a diff and in review.

**Committed:**
- **New projects.** The scaffold adds `!.scamp/drafts/` under
  `!.scamp/agent-history/`.
- **Existing projects.** On open, if `.gitignore` has `.scamp/*` but not
  the drafts line, Scamp adds the line. That's the same one-time,
  in-place rewrite `shareAgentHistory` does. It never touches a
  `.gitignore` that ignores `.scamp/drafts/` on purpose.

**The file watcher** already ignores `.scamp/`, so edits to drafts made
outside Scamp aren't reloaded while the page is open. They're read the
next time it opens. Scamp owns these files.

### 2. Drafts live in the same store, under a second root

- **Where.** Draft elements go in the same `elements` map, as children
  of a second root, `DRAFTS_ROOT_ID`, which is never part of the page
  tree.
- **What that gets for free.** Selection, the properties panel, the
  layers panel, multi-select editing, copy and paste, nudging, resizing
  and undo all work on drafts unchanged.
- **Undo.** History snapshots the whole map, so moving an element
  between the page and the staging area is one undo step that puts it
  back.

**Loading:**
1. Parse the drafts file.
2. Remap any draft id that collides with a page id. Ids are only unique
   within a file.
3. Hang the drafts' root children under `DRAFTS_ROOT_ID`.

**Saving:**
- **The page** is generated from `rootElementId` as today. Code that
  walks from the page root never reaches the drafts.
- **The drafts** are generated from `DRAFTS_ROOT_ID`, into their own
  debounced write, through new IPC channels `drafts:read` and
  `drafts:write` (`src/main/ipc/drafts.ts`, behind
  `assertInsideActiveProject`).
- **Empty drafts** delete the files rather than leave an empty
  component.

**The real risk is code that walks the whole map** instead of the page
tree. There are 18 files with `Object.values(elements)` or similar. Each
is audited, and the ones that mean "the page" switch to a new
`pageElements(elements, rootId)` helper in `lib/element/tree.ts`:

| Must ignore drafts | Examples |
|---|---|
| Code generation and checks | `generateCode/tsx.ts`, `generateCode/internal.ts`, `viewLint`, `projectCheck` |
| What the page uses | `projectColors`, `importFonts`, `componentInstance` (usage counts), `bindings` |
| Agent and MCP | `contextModel`, `canvasSnapshot`, the MCP view answers |
| Export and thumbnails | Both capture the frame, which won't contain drafts |

Each audited site gets a test with a draft present, asserting that the
draft doesn't leak into the result.

### 3. The canvas: the page and the staging area side by side

The staging area is a second board to the right of the page, as wide as
the page, under the same zoom. It starts as tall as the page, and grows
as drafts are placed lower.

- **One zoomed container for both.** Today the frame is the zoomed box
  and the interaction layer sits inside it. This change adds a parent,
  the **world**, that takes the zoom. Inside it go the page frame at
  `x = 0` and the staging board at `x = page width + 80`. The
  interaction layer moves up to cover the whole world.
- **Coordinates.** `toFrame` and `measureElementInFrame` measure against
  the world instead of the frame. They already work in page units, so
  for the page itself nothing moves.
- **Breakpoints.** The staging board has `container-type: inline-size`
  and the page's width, so a draft's breakpoint rules resolve exactly as
  they would on the page. Switching the active breakpoint applies to the
  staging area too.
- **Styles.** The drafts get their own stylesheet, scoped to the board,
  so a draft never picks up a page rule and the page never picks up a
  draft's.
- **The board's look.** A labelled header ("Staging, not part of the
  page") and a dashed outline, so it can't be mistaken for page content.
  It's excluded from exports and thumbnails, which capture the frame.

This split of `Viewport.tsx` (the frame's contents, versus the shell
that zooms) is the same split that phase 2 of the workspace plan needs,
done once.

### 4. Drawing, moving, and dropping

- **Draw.** The draw tool over the staging board draws into
  `DRAFTS_ROOT_ID`, at the pointer. The clamp keeps it inside the board.
- **From the page to staging.** Dragging an element off the page's edge
  and releasing over the board reparents it to `DRAFTS_ROOT_ID`. It
  becomes absolutely positioned at the drop point. The page's code loses
  it; the drafts file gains it.
- **From staging to the page.** Dragging a draft onto the page reparents
  it into the container under the pointer (`resolveDropContainer`):
  - into a flow (flex or grid) container, at the insertion point the
    drop indicator shows
  - into an absolute one, at the drop point

  This is the drag-reparent path that exists today, with the drafts root
  added as a valid container.
- **What travels with an element.** Its styles, breakpoint overrides and
  states go with it. Class-name collisions are resolved the way paste
  resolves them today.
- **Copy and paste** between the two works as it does between
  containers. A **Move to staging** item in the element's right-click
  menu covers keyboard and layers-panel users.

### 5. Layers panel

The layers panel shows a second top-level section, **Staging**, under
the page tree. It lists the drafts, which can be selected, renamed and
reordered there. Dragging a row between the two sections moves an
element between the page and the staging area.

### 6. Renames, deletes, and other edge cases

- **A page renamed or turned into a view.** Its drafts files move with
  it (`pageOps`, `componentOps`, `pageRename`). A deleted page deletes
  its drafts.
- **Component instances** can be staged like any element.
- **The component editor** has no staging area (one per page or view,
  as decided).
- **Snapshots** include the drafts files, so restoring a snapshot
  restores what was staged at the time.

## Phases

| Phase | What it delivers |
|---|---|
| 1 | **The staging board, drawing and storage.** The Viewport split, the world container, `DRAFTS_ROOT_ID`, the drafts files and IPC, the gitignore line, and the audit of the 18 sites. You can draw and edit drafts, and they persist. Nothing moves between the board and the page yet. |
| 2 | **Moving between the page and staging.** Drag across the edge in both directions, **Move to staging**, and the Staging section in the layers panel. |
| 3 | **Renames, deletes, and snapshots** (section 6). |

## Tests

### Unit tests

- `pageElements`.
- Drafts id remapping on load.
- Drafts round-trip: generate, parse, same tree.
- The gitignore rewrite: adds the drafts line, is idempotent, and leaves
  a deliberate ignore alone.
- Each audited consumer with a draft present.

### Integration tests

`drafts.integration.test.ts`:
- Write drafts for a page, then reopen the project; the drafts come
  back.
- Empty drafts delete the files.

### End to end

`test/e2e/canvas/staging.spec.ts`:
1. Draw a rectangle on the staging board. The page's CSS is unchanged,
   and `.scamp/drafts/…` has it.
2. Drag it onto the page. The page's CSS now has it, and the drafts
   file doesn't. One **Undo** puts it back.
3. Drag a page element out to the staging board; the reverse of 2.
4. Checks and the preview don't see a draft.
5. Switch pages; each page has its own drafts.

## Risks

- **The 18 whole-map consumers.** Missing one leaks drafts into code, a
  check, or an agent's answer. The audit and a test per site is the
  mitigation, and phase 1 isn't done until every site has one.
- **The Viewport split** touches every coordinate path: selection
  overlay, resize, drop indicators, component drops, the boundary
  overlay, and zoom to fit. The existing canvas end-to-end specs are
  the guard. They must all pass before phase 2 starts.
- **Zoom to fit** currently fits the page. With a staging board it
  should still fit the page by default. The board is reached by
  scrolling right, so a page with no drafts looks as it does today.

## Not in scope

- **Staging in the component editor.**
- **A staging area shared across pages.** Copy and paste covers moving
  a draft between pages.
- **Agents reading or writing drafts.** They're invisible to the MCP
  and the Scamp Agent in this plan.

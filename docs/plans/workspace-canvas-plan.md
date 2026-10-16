# Workspaces: pages and components on one infinite canvas

Status: **proposed**, for review. Nothing is built. Phases reordered
2026-10-16, and scratch components added in place of the staging-area
plan.

## The story

As a user with a multi-page project, I want an infinite canvas
workspace that shows my pages and components side by side. I want to
see, compare, and edit them in place, like Figma, instead of opening one
page at a time.

The rule that governs everything below: **the workspace changes no
code.** A project opened without ever using workspaces is byte-identical.
A workspace is layout metadata in `.scamp/`, and deleting one never
touches a page or a component.

## What's there today

Two surveys, one of each codebase, shaped this plan.

### Scamp edits one target at a time, from the store down to the DOM

- **Store.** There is one `elements` map and one `rootElementId` for
  the open page or component. `loadPage` and `loadComponent` swap them,
  along with `pageSource`, custom media, keyframes, and selection
  (`store/canvas/slices/document.ts:155-228`).
- **Rendering.** `ElementRenderer` reads that store directly
  (`ElementRenderer.tsx:500-618`), so it can only draw the open target.
- **Saving.** The save bridge has one timer, one serialized cache, and
  guards that skip any write for a target that isn't open
  (`syncBridge/saveContext.ts:35-37`, `writeIfDirty.ts:60-63`).
  `externalEdit.ts:19-26` ignores file changes for any target that
  isn't open.
- **Zoom.** One `userZoom`, with Fit measured from the single frame
  against a scroll container (`Viewport.tsx:173-269`).

What carries over:

- **A store-free renderer already exists.** `renderComponentSubtree`
  (`ElementRenderer.tsx:104`) draws component instances, read-only,
  from the `componentTrees` cache. Every component and view is parsed
  into that cache (`useProjectStoreSync.ts:72-97`). Pages have no
  equivalent cache yet.
- **Overlays already work relative to the frame.** Selection, move, and
  resize take `frameRef` and `scale`
  (`useCanvasGeometry.ts:29-34`, `CanvasInteractionLayer.tsx:44-86`),
  so they don't care where the frame sits on screen.
- **Breakpoints are already per frame.** The canvas rewrites `@media`
  as `@container` (`canvasStylesheet.ts`), so each frame responds to
  its own width without an iframe.
- **Copy and paste across pages already works.** The element clipboard
  lives in the store, and `loadPage` doesn't clear it.
- **History is already kept per target**, keyed by file path
  (`historySlice.ts:38-44`).

### The Notebook canvas is a good fit, but it isn't a shared engine yet

Scamp Notebook's canvas is in `scamp-whiteboard`, under `src/canvas/`
(about 2,400 lines), on the `canvas-explore` branch only.

**Good for Scamp:**

- It draws real DOM under one `translate() scale()` transform
  (`Canvas.tsx:553-558`), so Scamp's frames, which are React elements
  styled with CSS Modules, can sit inside it as they are.
- It has none of the libraries the spec rules out: no tldraw. The core
  needs only React, Yjs, and nanoid.
- Its spike found that caret and text selection stay correct at 0.5×,
  1×, and 2× zoom.

**Not shareable as it stands:**

- **It's part of the Notebook app.** It isn't a package of its own, and
  nothing publishes it.
- **Its data is tied to Yjs.** Items live in a `Y.Map`, and undo uses
  `Y.UndoManager` (`useElements.ts`, `useUndo.ts`).
- **The camera is private.** It's internal `useState` (`Canvas.tsx:80`),
  with no API to read or set it and no zoom-to-fit.
- **Features the spec needs are missing:** off-screen culling (the
  `visibleBounds` helper exists but nothing calls it), a minimap, and
  zoom to fit.
- **React versions differ:** React 19 in Notebook, React 18 in Scamp.
- **It has no unit tests.**
- **Content can't be clicked until double-clicked:** an item takes
  every pointer press until it enters editing mode
  (`ElementBox.tsx:155-175`).
- **Wheel handling may not work:** the wheel handler is a React
  `onWheel`, which React attaches as passive, so its `preventDefault`
  is probably ignored. In Electron, Ctrl+wheel would then zoom the
  whole window.

So "one shared engine" is a piece of work, not a dependency we can take
today. Phase 2 builds the surface in Scamp, and phase 7 makes it the
shared engine.

## Decisions this plan makes

Each one is for your review. The open questions at the end are the ones
I can't decide for you.

### 1. One live frame; the rest are read-only renders

You edit one frame at a time, the active frame. Every other frame is a
live, read-only render of that page's or component's files.

- Clicking anything in another frame makes it active and selects what
  you clicked, in the same gesture.
- Activating a frame uses the swap Scamp already does when you open a
  page: flush the pending write, persist, then `loadPage`.

To you it reads as editing in place. Nothing makes you leave the
workspace or double-click first.

**Why not edit every frame at once:**

- **It's most of the codebase.** The store, the save bridge, undo, and
  every panel that reads `s.elements` would all have to be keyed by
  target. It's the largest blocker the Scamp survey found.
- **It buys nothing visible.** There is one selection and one
  properties panel either way. Figma works the same way: one selection,
  one panel.

This choice can be revisited later without throwing anything away.

### 2. The engine is built in Scamp first, then extracted

The surface (camera, gestures, culling, zoom to fit, minimap, frame
dragging) is written in Scamp in phase 2, following the Notebook
canvas's design. Phase 7 lifts it into a small package that both apps
import:

- the camera math: `toScreen`, `toWorld`, `zoomAt`, `visibleBounds`
- pan and zoom gestures
- culling
- zoom to fit and a minimap
- frame dragging

The package:

- **Is storage-free.** The host owns the item list and the camera, and
  the engine reports changes back through callbacks. That removes the
  Yjs coupling. Notebook keeps its Yjs store and passes items in.
- **Works with React 18 and 19.** It names React as a peer dependency,
  `>=18`.
- **Gets tests** for the camera math and culling, which Notebook's
  canvas has never had.

The phase 2 code is kept to that shape from the start, so the
extraction is a move, not a rewrite. Where the package lives is open
question 1.

### 3. Workspaces are stored in `.scamp/workspaces.json`, per person

This follows the spec.

- **Already ignored.** `.scamp/` is gitignored by the project scaffold
  (`.scamp/*`, `projectScaffold.ts:232`), and the file watcher already
  skips it.
- **Unlike page groups.** Page groups are shared through
  `scamp.config.json`, so this is a deliberate difference. Open
  question 3 asks whether that's what you want.

### 4. The All workspace is built from the project; its positions are saved only after you move a frame

- **Never stored itself.** All is computed from the project's pages and
  components every time.
- **Laid out automatically:** pages in one row, components in a row
  below, both following the order of the Pages list.
- **Moves are kept.** Once you drag a frame, its position is saved in
  `workspaces.json`.
- **Nothing written until then.** Opening the workspace view creates no
  file until you change something.

### 5. Each frame keeps the page's own width

- **Sizes.** A page frame uses the project's `canvasWidth`. A component
  frame uses its saved `componentCanvas` size.
- **Breakpoints.** The breakpoint switcher acts on the active frame
  only. Every other frame shows the base breakpoint.
- **Not in this plan:** showing the same page at several widths side by
  side. That's open question 4.

## Data model

```ts
// src/shared/types.ts
type WorkspaceFrameRef =
  | { kind: 'page'; name: string }
  | { kind: 'component'; name: string }; // views included, as `componentTrees` holds them

type WorkspaceFrame = { ref: WorkspaceFrameRef; x: number; y: number };

type Workspace = {
  id: string;
  name: string;
  frames: WorkspaceFrame[]; // in z order
  camera?: { x: number; y: number; zoom: number };
};

type WorkspacesFile = {
  version: 1;
  workspaces: Workspace[];
  /** Positions you've dragged in the All workspace, keyed by `kind:name`. */
  allPositions: Record<string, { x: number; y: number }>;
  allCamera?: { x: number; y: number; zoom: number };
  lastOpened?: string; // workspace id, or 'all'
};
```

### The pure logic

The rules live in `src/renderer/lib/workspaceLayout.ts`, a pure file
with full test coverage as CLAUDE.md requires.

**Layout rules:**

- `layoutAll(pages, components, saved)` builds the All workspace.
- `placeNewFrames(workspace, refs)` puts frames you add to the right of
  the existing ones, without overlapping them.
- `reconcileWorkspaces(file, project)` keeps workspaces in step with
  the project:
  - It drops frames whose page or component was deleted.
  - It follows a rename, using the rename events the Pages list already
    handles.
- `frameBounds` and `boundsOfAll` give the sizes that zoom to fit and
  the minimap need.

**Reading and writing the file:**

- It goes through IPC, as with every other file: a `workspaces:read`
  channel and a `workspaces:write` channel.
- The handlers live in `src/main/ipc/workspaces.ts`, behind
  `assertInsideActiveProject`.
- A malformed file reads as empty rather than throwing. A hand-edited
  or corrupt file must never block opening a project.

## Phases

The order changed on 2026-10-16, when the staging-area plan was dropped
in favour of this one (`docs/archive/2026-10-16-staging-area-plan.md`):

- **The Viewport split comes first.** Both plans needed it.
- **The surface is built in Scamp**, and becomes a shared package
  later. That way Notebook's `canvas-explore` branch doesn't block
  anything.
- **Scratch components** cover what the staging area was for.

Each phase can ship on its own.

### Phase 1: split the Viewport

Nothing visible changes. This is the foundation every later phase sits
on, and the existing canvas end-to-end specs guard it: they must all
pass unchanged before phase 2 starts.

- **Split `Viewport.tsx`.**
  - Its frame content (theme variables, `containerType`, the
    stylesheet, the root renderer) becomes a component the editor and
    the workspace share.
  - Its scroll and zoom shell stays in the editor only.
  - The workspace never renders `Viewport`.
- **Measure against a container, not the frame.** `toFrame` and
  `measureElementInFrame` (`useCanvasGeometry.ts`) take the container
  they measure against, instead of assuming the page frame, so a frame
  can sit anywhere on a larger surface.

### Phase 2: the All workspace, read-only

**What you get:**

- A **Workspace** toggle beside the editor, in the toolbar above the
  canvas.
- Every page and component as a frame, with its name in a header above
  it.
- Pan and zoom, zoom to fit, and dragging frames by their header.
- Positions saved to `.scamp/workspaces.json` after a drag.
- **Nothing is editable yet:** double-clicking a frame opens it in the
  editor, as today.

**What this needs:**

- **The canvas surface, in Scamp.** Pan, zoom, culling, zoom to fit,
  and frame dragging, written in `src/renderer/src/workspace/engine/`
  from the Notebook canvas's design. It's kept to the package shape
  decision 2 describes, so phase 7 can lift it out unchanged.
- **A parsed-page cache.** Add `pageTrees` beside `componentTrees`,
  filled the same way from `project.pages`.
- **A read-only frame.** A `WorkspaceFrame` component that draws a tree
  through `renderComponentSubtree` with its own stylesheet.
- **Its own stylesheet scope.** `buildCanvasStylesheet` already accepts
  a `scopeSelector`, so each frame gets
  `[data-scamp-frame="page:home"]` instead of the shared
  `[data-scamp-canvas]`. Without this, one page's rules would style
  every frame.
- **External edits refresh frames.** A change to the file behind any
  frame in view re-reads that file and updates its cache entry. Today,
  `externalEdit.ts` ignores files that aren't open. Scamp keeps that
  for the store and adds a refresh for the cache.

**Shippable on its own:** you can already see and compare everything.

### Phase 3: edit the active frame

**What you get:**

- Clicking a frame activates it. The active frame renders through the
  existing editing stack: `ElementRenderer` and
  `CanvasInteractionLayer`, at `scale = camera.zoom`.
- The properties panel, layers, the keyboard, and copy and paste all
  work as they do in the editor, because to the store this is the
  open page.
- The active frame has a highlighted header. Escape with nothing
  selected deactivates it.

**What this needs:**

- **Scope the global DOM lookups to the active frame.** Element ids are
  only unique within a page, so a global lookup would find the wrong
  frame. The survey found these:
  - `SizeSection.tsx:121`
  - `ExportSection.tsx:33`
  - `useInstanceFlows.ts:136`
  - `GridOverlay.tsx:65`
  - `controls/livePreview.ts:22`
  - `SvgSection.tsx:40`
  - `projectThumbnail.ts:70`
  - `componentThumbnail.ts:15`
  - `exportCapture.ts:112`

  One `activeFrameElement()` helper replaces the
  `[data-testid="canvas-frame"]` selector.
- **Click to activate in one press.** On press over an inactive frame:
  1. Find the element id under the pointer.
  2. Flush the pending write, then load the target.
  3. Select that element after the load.

  The flush must finish before the load, the ordering bug the
  Next.js → Scamp migration hook test exists for. This gets a hook test
  in the same shape (`test/useComponentManagement.test.ts`).
- **Keep the frame on screen during the swap.** While the target loads,
  the inactive frame stays on screen until the live frame has
  rendered, so nothing flickers.

**Undo** stays per frame: it undoes the active frame's history, as the
editor does per page today.

### Phase 4: scratch components

A place to try things out and park elements, beside your pages, with no
new storage. It replaces the staging area.

**What you get:**

- **New scratch canvas** in the workspace. It creates a component
  marked as scratch and places its frame where you clicked.
- Draw and style in it with the normal tools. It's a real component
  canvas, so everything works.
- **Move elements between a scratch canvas and a page** with cut, copy
  and paste. Paste across pages already works.
- Scratch components are **committed**, like any component, so they're
  shared through git.

**What this needs:**

- **The marker.** A `scratch` list of component names in
  `scamp.config.json`. That's shared and committed, and it's simpler than
  a marker in the component's code, which would touch the scampjs
  contract.
- **Left out of everything about the real project.** Scratch components
  are excluded from:
  - the Components sidebar. They appear under a **Scratch** heading
    instead.
  - Checks (`projectCheck`) and the MCP's project check.
  - the agent context file and the MCP's component lists.
  - the component picker for placing instances.

  The framework builds only what's imported, so an unused scratch
  component never ships.
- **Promoting one.** Right-click a scratch component and choose **Make
  a component**: it's removed from the `scratch` list and appears as a
  normal component.

### Phase 5: named workspaces

**What you get:**

- A switcher at the top of the workspace view: **All**, then your
  workspaces, then **New workspace**.
- **New workspace** creates an empty workspace. You add pages and
  components from a picker that lists both, with checkboxes.
- You can rename and delete a workspace. Deleting one asks first, and
  says that no page or component is removed.
- The same page can appear in several workspaces.
- Each workspace remembers its camera. The view reopens on the last
  workspace you used.

### Phase 6: finding your way

- A minimap in a corner of the workspace view, which you can turn on
  and off.
- Selecting a page in the Pages list frames it, when the workspace is
  showing.
- Double-clicking a component instance pans to that component's frame
  if the workspace has one. If not, it opens the component in the
  editor, as today.

### Phase 7: extract the shared engine

The surface built in phase 2 moves into its own package, and Notebook
moves onto it. This can happen any time after phase 3; nothing in
Scamp waits for it.


**Code:**

- Bring across from `scamp-whiteboard/src/canvas/` what phase 2
  didn't already take:
  - `viewport.ts`, the camera math
  - the gesture code from `Canvas.tsx`
  - the drag code from `ElementBox.tsx`
- Add:
  - A camera that the host controls: `camera` and `onCameraChange`
    props, plus `zoomToFit(bounds)` and `zoomTo(bounds)` helpers.
  - Culling: render only the items whose bounds meet the viewport, plus
    a margin. Off-screen items become a labeled placeholder of the same
    size.
  - A minimap component that reads the same item list.
  - A host-controlled click rule (`passPointer(item)`), so a host can
    let presses through to its content. Scamp needs this because of
    decision 1.

**Fixes on the way:**

- Attach the wheel listener natively with `{ passive: false }`.
- Clamp zoom to Scamp's limits, 0.1–4 (`lib/zoom.ts`).

**Tests:** camera round trips (`toWorld(toScreen(p)) === p`), zooming
about a point keeps that point fixed, culling at the edges and at
extreme zoom, and fit with zero, one, and many items.

**Moving Notebook onto the package** is a Notebook task, but it
should happen soon after, so the two copies never drift.

### Later: drag between frames

Only if cut and paste between a scratch canvas and a page feels like
too much friction.

Dragging an element from one frame into another moves it between two
files: cut from one, paste into the other, as one undo step. With one
live frame (decision 1), the drop target has to become the live frame
mid-drag, so this needs its own plan.

The staging-area plan's design for crossing an edge (`reparentElement`
with a drop container, one undo step) is the starting point.

## Tests

### Unit tests

- `workspaceLayout.test.ts` covers:
  - the All layout
  - placing frames without overlap
  - reconcile after a delete and after a rename
  - bounds
  - a malformed file read as empty
- The surface's own tests: camera round trips, zoom about a point,
  culling, and fit. Phase 2 writes them; phase 7 moves them with the
  package.
- The scratch marker: excluded from Checks, the agent context, and the
  components list, and promoted back out.

### End-to-end, in `test/e2e/workspace/`

- **Byte identical:**
  1. Open a project.
  2. Toggle the workspace on and off.
  3. Pan, zoom, and drag a frame.
  4. Check that every file outside `.scamp/` is byte-identical.
- **Edit in place:**
  1. Click an element in the second frame and change its color.
  2. Check that the right CSS module changed, and only that one.
  3. Check that the first frame's file is untouched.
- **External edit:** edit an inactive frame's CSS on disk, and check
  that the frame redraws.
- **Persistence:** create a workspace, add two pages, reopen the
  project, and check that the workspace is still there with the same
  positions.

## Risks

- **Speed with many real frames.** A frame is the page's full DOM,
  images included. Culling handles frames that are off screen. Frames
  that are on screen but tiny, when you zoom out on 40 pages, still
  cost full renders.
  - **Fallback:** below about 0.2 zoom, show each page's thumbnail
    image instead of its DOM. Thumbnails are already captured for the
    start screen.
  - **Measure first.** Phase 2 records frame time on a 30-page project
    before deciding.
- **The iframe plan.** `canvas-iframe-plan.md` would move each canvas
  into an iframe. Frames here are drawn by a single `FrameHost`
  component, so moving to iframes later changes one component, not
  the workspace.
- **Keyboard clashes.** The engine's Space, Delete, and ⌘G handlers
  overlap with Scamp's shortcuts, which are one `window` handler. The
  engine package takes no keyboard shortcuts of its own; the host maps
  keys to engine calls.
- **Measuring under zoom.** Any code that measures inside a frame with
  `getBoundingClientRect` must divide by the zoom. The overlays already
  do. The lookups in phase 3 get checked one by one for this.

## Not in scope

- **Editing two frames at once**, or undo across frames (decision 1).
  Dragging between frames is the "Later" phase, not this plan.
- **The same page at several widths** in one workspace (open
  question 4).
- **Sharing workspaces** through git (open question 3).
- **Agent and MCP access** to workspaces. They're presentation only,
  and agents edit files.
- **Frames that aren't pages or components**, such as sticky notes,
  arrows, or text.

## Open questions

1. **Where should the shared engine live?** Options:
   - Its own small repo, published to npm.
   - A package in the scampjs monorepo, which already publishes through
     npm trusted publishing.
   - A folder in Notebook that Scamp copies.

   I'd take the scampjs monorepo: the release pipeline is there and
   tested. This only matters at phase 7 now. The canvas exists only on
   Notebook's `canvas-explore` branch, so that needs merging, or a
   decision, by then.
2. **Is one live frame acceptable** (decision 1)? It changes how
   editing in place feels in one way: the first click on another frame
   switches the frame. It doesn't wait for a double-click.
3. **Per person or shared?** The spec says `.scamp/`, which isn't
   committed, so teammates don't see each other's workspaces. Page
   groups went the other way. Do you want workspaces shared?
4. **The same page at several breakpoints**, side by side. This is
   common in Figma, and `@container` makes it cheap to render. Should
   it be part of this plan, or later?
5. **Should All include components**, or pages only, with components in
   named workspaces? A project with many small components makes All
   crowded.

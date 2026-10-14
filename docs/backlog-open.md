# Scamp — open backlog

Every user story from backlogs v8, v11 and v12 that isn't built yet,
in one place. Gathered on 2026-10-14; the source files are in
`docs/archive/` (`backlog-8.md`, `backlog-10.md`, `backlog-11.md`), and
each story below is copied from them unchanged apart from its heading.

| Story | Kind | Size | From | Plan |
|---|---|---|---|---|
| ~~Edit every selected element at once~~ **Done** | Bug | M | v12 #1 | `archive/2026-10-14-multi-select-edit-plan.md` |
| Narrowing a text element keeps the height I set | Bug | S | v12 #2 | |
| Drag a component instance on the canvas | Bug | M | v12 #3 | |
| Drop an image onto the canvas | Bug | S | v12 #4 | |
| Find per-side padding | Discoverability | S | v12 #5 | |
| Alignment guides when dragging a component | Feature | M | v12 #7 | |
| Call a container a group in the layers panel | Feature | S | v12 #8 | |
| Tell plain, flex, and grid containers apart in layers | Feature | S | v12 #9 | |
| Tell components apart in the layers panel | Feature | S | v12 #10 | |
| Gradient picker | Feature | M | v12 #11 | `plans/gradient-builder-plan.md` |
| Switch units between px and rem | Feature | L | v12 #12 | |
| More shapes: line, ellipse, triangle, star, arrow | Feature | L | v12 #13 | |
| A built-in icon library | Feature | L | v12 #14 | |
| Component variants (1.1–1.5) | Feature | L | v8 Feature 1 | |
| Sync project to Scamp cloud | Feature | L | v11 #2 | `plans/cloud-sync-plan.md` |
| Figma import | Feature | L | v11 #4 | |

Done and left out: v8 Feature 2, data fetching (built as the scampjs
framework's `load()`, samples, and bindings in the Data tab), v11 #1
sign in, v11 #3 HTML import from a URL (website import), and v12 #6
SVG color.

---

## Bugs

### Edit every selected element at once - DONE

Built 2026-10-14; see `docs/archive/2026-10-14-multi-select-edit-plan.md`.

As a designer, I want a change I make with several elements selected to
apply to all of them, so that I can restyle a set of elements in one
step instead of one at a time.

> Selecting multiple elements and applying color, border or size
> changes. The changes would be reflecting on only one component (1st
> selected item only)

**Today:** the panel sections edit the primary selection only
(`patchElement(elementId, …)` per section). Only the Export section
reads the whole selection. A user who shift-selects and recolors gets
one changed element and no hint why.

**Done when:**
- With two or more elements selected, a change in Background, Border,
  Size, Spacing, Typography, and Layout applies to every selected
  element that supports it, as one undo step.
- A field shows its value when every selected element agrees, and
  reads **Mixed** when they don't. Typing into a mixed field sets all of
  them.
- Controls that don't apply to every selected element (for example
  Typography with a rectangle and a text selected) apply only to the
  ones they fit.
- At a breakpoint or in a state, the change lands in each element's
  override, as it does for one.

**Notes:** the store has `selectedElementIds`; the work is a
`patchElements` action that routes each patch through
`applyPatchWithAxisRouting`, plus a "mixed" reading in each section.
The text-runs **Mixed** handling (`styleOfRange`) is a model for the
display.

### Narrowing a text element keeps the height I set

As a designer, I want to change a text element's width without its
height jumping back to a default, so that resizing one dimension doesn't
undo the other.

> While trying to reduce the width for text element its affecting the
> height. (getting back to default height)

**Today:** not yet reproduced. Likely causes: a text element's height
is `auto` by default, so narrower text wraps and grows taller, which is
correct. Or a width edit resets a fixed height. A resize from a handle
sets both axes to fixed (`resizeElement`), so an edit from the panel or
a side handle may behave differently.

**Done when:**
- Reproduced, with the exact steps (panel field or handle, and the
  element's height mode before).
- Changing width never changes the height mode or a fixed height.
- When the height is `auto`, the panel says so, so growth from wrapping
  reads as expected rather than as a reset.

### Drag a component instance on the canvas

As a designer, I want to drag a component instance with a mouse or
trackpad like any other element, so that I don't have to use the layers
panel or arrow keys to place it.

> After adding components to the screen it's not working for drag
> option using trackpad. It's getting deselected from the item while
> trying to use mouse or trackpad. It will be able to move using
> keyboard shortcut and select option available only from Layers Panel

**Today:** an instance's insides have `pointer-events: none`, so the
instance wrapper is the only thing that can be hit. When the wrapper has
no height (the component's content is absolutely positioned, or its
root hugs nothing), a click lands on the page behind it and deselects.
This was seen while testing double-click on 2026-10-08 with a
zero-height instance. Keyboard and layers-panel selection don't hit-test,
which is why they work.

**Done when:**
- A click anywhere an instance draws selects it, even when its wrapper
  box has no height, and a drag moves it.
- Works with a trackpad's tap and click-drag, and with a mouse.
- A double-click still opens the component.

**Notes:** `hitTest` and `instanceAt` in
`canvas/interactions/canvasHitTest.ts`. Either fall back to the instance
under the pointer through its drawn contents, or size the wrapper from
what it draws.

### Drop an image onto the canvas

As a designer, I want to drag an image file onto the canvas and have it
placed there, so that I can add images without going through a menu.

> Image drag and drop is not working

**Today:** dropping image files from the system file manager is built
(`useDropInsert`: raster images go to the project's assets, and SVGs are
inlined). So this needs reproducing. Candidates: a drag from a browser
(which carries a URL, not a file), a drop onto a component instance or
the layers panel, or a platform difference (Wayland).

**Done when:**
- Reproduced, with where the image came from and where it was dropped.
- An image dragged from a browser is downloaded into assets and placed.
- A drop that can't be accepted says why instead of doing nothing.
---

## Already there, hard to find

### Find per-side padding

As a designer, I want to set a different padding on each side, so that
I can match a design that isn't padded evenly.

> How to set various size of 4 side padding. Now it's common for all 4
> sides

**Today:** supported, but invisible. The padding field takes CSS's
one-to-four-value form (`16 8` or `16 8 16 8`, top right bottom left),
which you only know to try if you already know CSS. Margin is the same.

**Done when:**
- The padding and margin controls have a toggle that expands one field
  into four labeled fields (Top, Right, Bottom, Left), and remembers
  which form you used.
- The single field's placeholder or tooltip mentions the four-value
  form.
- Documented in `docs/user_docs/properties-panel.md`.
---

## Features

### Alignment guides when dragging a component

As a designer, I want guides to show when what I'm dragging lines up
with its container or its neighbors, so that I can center or align it
without guessing.

> No guidelines for the alignment while dragging a component (is the
> component at the center or left)

**Today:** `docs/archive/2026-08-13-drop-placement-helpers-plan.md` shipped drop
indicators for dropping into flex and grid containers. Dragging
something freely shows no smart guides for center, edges, or equal
spacing.

**Done when:**
- While moving an element or instance in a container that isn't a flex
  or grid container, guides appear when its left edge, center, or right
  edge (and top, middle, or bottom) lines up with the container or a
  sibling, and the element snaps to them within a few pixels.
- Holding a modifier key turns snapping off.
- The same guides show when dragging a component in from the sidebar.

### Call a container a group in the layers panel

As a designer coming from Figma, I want a container to be called a
group, so that the layers panel uses the words I already know.

> Rename the rectangle to group on the layer panel

**Today:** an unnamed container is labeled **Rectangle** in the layers
panel, after the tool that draws it, even when it holds other elements.

**Done when:**
- An unnamed container that holds elements is labeled **Group**, or
  **Flex group** / **Grid group** by layout (see 9). One with no children
  stays **Rectangle**.
- Class names don't change. This is a label, not the `rect_` prefix,
  which would rename CSS classes in existing projects.

### Tell plain, flex, and grid containers apart in layers

As a designer, I want to see at a glance which containers lay their
children out automatically, so that I know what will happen when I drop
something into one.

> Need to add icon for default group (Rectangle) and auto layout group.
> To differentiate the items in the layer panel

**Today:** the layers panel marks text (`T`), component instances (`◆`),
and SVGs, but every container has the same square.

**Done when:**
- A container shows a distinct icon for no layout, flex row, flex
  column, and grid, matching the icons in the Layout section.
- The icon updates when the layout changes.

### Tell components apart in the layers panel

As a designer, I want component instances to stand out in the layers
panel, so that I can tell reusable parts from one-off elements.

> Component color variation required from default items on the Layers
> panel

**Today:** an instance has a `◆` marker, the same color as everything
else.

**Done when:**
- Instance rows use the accent color for their icon and name, as Figma
  does for components.
- Inside the component editor, the component's root uses the same
  color.

### Gradient picker

As a designer, I want to build a gradient in the panel, so that I don't
have to write CSS to get one.

> Gradient color tool missing

**Today:** gradients render (imported ones included) and can be typed as
CSS. There's no control to build one. `docs/plans/gradient-builder-plan.md`
(proposed) covers it.

**Done when:**
- The Background color picker has **Solid**, **Linear**, and **Radial**
  modes. Linear and radial show a gradient bar with draggable color
  stops, an angle or position, and theme tokens available for each stop.
- The result is written as `background-image` and reads back into the
  picker.
- See the plan for the rest.

### Switch units between px and rem

As a designer who hands off to developers, I want to work in rem as
well as px, so that type and spacing scale with the user's font size.

> Can we add switch option between rem and px?

**Today:** the model stores sizes and spacing in px. A value typed in
rem is kept as written (as with `widthCustom`), but the panel shows it
as text, not as a number you can nudge.

**Done when:**
- A project setting chooses px or rem, with a root font size (default
  16), for font size, spacing, and radius.
- In rem mode, panel fields show and accept rem, and Scamp writes rem
  to the CSS. Stepping with the arrow keys moves by 0.125rem.
- Switching an existing project offers to convert its values, and
  shows what changes first.

**Notes:** the largest risk is the round trip. `parseCode` and
`generateCode` must hold rem values without rounding them through px.

### More shapes: line, ellipse, triangle, star, arrow

As a designer, I want to draw shapes other than rectangles, so that I
can make simple graphics without importing them.

> Shape tool showing only rectangle. We need line, circle, star,
> triangle, and arrow shapes in the shape tool list

**Today:** the toolbar's shape tool draws rectangles. A circle is a
rectangle with a 50% radius, which the user didn't know.

**Done when:**
- The shape tool has a menu: Rectangle, Ellipse, Line, Triangle, Star,
  Arrow.
- **Ellipse** draws a rectangle with `border-radius: 50%`, an element
  like any other.
- **Line**, **Triangle**, **Star**, and **Arrow** draw an inline SVG sized
  to the drag, with stroke and fill editable like an icon's (story 6).
- Shift keeps proportions while drawing.

**Notes:** an element's box can't be a triangle or star, so those are
SVGs, which means they're images to Scamp's layout and can't hold
children. Worth saying in the docs.

### A built-in icon library

As a designer, I want to search and insert icons from inside Scamp, so
that I don't have to find, download, and drop SVG files.

> If possible can we add some icon library by default

**Today:** icons come in by dropping SVG files or importing pages.

**Done when:**
- An **Icons** panel or menu searches an open-source set (Tabler, which
  Scamp's own UI already uses, or Lucide) and inserts the chosen icon as
  an inline SVG in `currentColor`, so it takes the text color around it.
- Inserted icons are editable like any SVG (story 6).
- The icon set's license is noted in the docs and the app's credits.

**Notes:** bundling the whole set grows the app. Loading it on demand,
or shipping a curated few hundred, keeps the bundle lean.

### Component variants

#### Overview

Component variants let a single component have multiple visual
configurations — for example a Button component with `solid`,
`outline`, and `ghost` variants. Each variant is a fully designed
version of the component sharing the same element tree, but with
different visual styles or structure.

Variants are designed side by side on the component artboard — each
variant is its own canvas stacked vertically below the previous one,
so you can always see the comparison without switching tabs or losing
context. This mirrors how designers actually work when exploring
alternatives.

**Depends on:** feature-components.md (components) must be complete.

---

#### 1.1 Define variants on a component artboard

**User story**

As a user building a design system, I want to add named variants to
a component directly on the artboard so I can design and compare
multiple visual configurations side by side without switching between
views.

**Behaviour — the artboard**

The component editor artboard renders each variant as its own canvas,
stacked vertically with a gap between them. Each canvas has a label
in the top-left corner showing the variant name.

Initial state — one canvas, labeled with the default variant name:

```
┌─────────────────────────────────────┐
│ solid                               │
│                                     │
│   [ Button canvas ]                 │
│                                     │
└─────────────────────────────────────┘

                [ + New variant ]
```

After adding a second variant:

```
┌─────────────────────────────────────┐
│ solid                               │
│                                     │
│   [ Button canvas ]                 │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ outline                             │
│                                     │
│   [ Button canvas — duplicate ]     │
│                                     │
└─────────────────────────────────────┘

                [ + New variant ]
```

**Adding a variant**

- A "+ New variant" button sits below the last canvas on the artboard
- Clicking it duplicates the current bottom canvas and appends it
  below with a default name: `variant-2`, `variant-3` etc.
- The new canvas is an exact copy of the canvas it was duplicated from
  — the user edits from there rather than starting from scratch
- The artboard scrolls vertically to show the new canvas and focuses
  its name label for immediate renaming

**Naming and renaming variants**

- The label in the top-left of each canvas is editable — click to
  enter edit mode, Enter or click away to commit
- The first variant (created when the component is created) defaults
  to `default` but is editable
- Variant names become the prop values — they must be valid JavaScript
  identifiers: lowercase, no spaces, no hyphens (use underscores if
  needed)
- Renaming a variant triggers the smart warning flow (see story 1.4)
  if instances already exist on pages

**Editing a variant**

- Click any element on any variant canvas to select it — the properties
  panel shows that element's styles for that variant
- Edits made on one variant canvas do not affect other variant canvases
- Both style changes and structural changes (adding, removing, or
  reordering elements) are allowed on any variant canvas
- A subtle indicator on the variant label shows when it has been
  edited: `● outline` vs `outline`

**Variant limit**

- At 8 variants a warning banner appears above the "+ New variant"
  button:
  ```
  ⚠ You have 8 variants. Large variant sets are harder to maintain.
  Consider splitting into separate components.
  ```
- The button remains enabled — the warning is advisory, not blocking

**Deleting a variant**

- Right-click a variant label → "Delete variant"
- Shows the smart warning if instances use this variant (story 1.4)
- The `default` variant cannot be deleted — it is the fallback for
  all instances

**Done when:** Clicking "+ New variant" appends a new duplicate canvas
to the artboard, the label is editable, and edits on one canvas are
isolated from all others.

---

#### 1.2 CSS output for variants

**User story**

As a developer receiving a Scamp project, I want variant styles to
output as clean, readable CSS so I can understand and extend the
component without wrestling with generated code.

**Style-only variants (same element tree)**

Each variant adds a modifier CSS class to the component root. The CSS
module contains a base class for shared styles and one class per
variant for overrides:

```css
/* Base styles — shared across all variants */
.root {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

/* solid variant */
.variant-solid {
  background: #111111;
  color: #ffffff;
  border: 2px solid #111111;
}

/* outline variant */
.variant-outline {
  background: transparent;
  color: #111111;
  border: 2px solid #111111;
}

/* ghost variant */
.variant-ghost {
  background: transparent;
  color: #111111;
  border: 2px solid transparent;
}
```

The component TSX applies both the base class and the variant class:

```tsx
type ButtonVariant = 'solid' | 'outline' | 'ghost';

type ButtonProps = {
  label?: string;
  variant?: ButtonVariant;
};

export default function Button({
  label = 'Click me',
  variant = 'solid',
}: ButtonProps) {
  return (
    <div className={`${styles.root} ${styles[`variant-${variant}`]}`}>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
```

**Structural variants (different element tree)**

When a variant canvas has a different element structure from the
default, Scamp generates a conditional render branch:

```tsx
export default function Button({
  label = 'Click me',
  variant = 'solid',
}: ButtonProps) {
  if (variant === 'icon') {
    return (
      <div className={`${styles.root} ${styles['variant-icon']}`}>
        <span className={styles.iconWrap}>
          <svg viewBox="0 0 16 16">...</svg>
        </span>
        <span className={styles.label}>{label}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles[`variant-${variant}`]}`}>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
```

**`parseCode` updates**

- Recognise the `` styles[`variant-${variant}`] `` pattern as a
  variant class application
- Parse each `.variant-[name]` CSS block back into its variant's
  style overrides in Zustand state
- Recognise conditional render branches as structural variants and
  map them back to the correct variant canvas in the artboard

**Done when:** Generated code compiles, is readable, and round-trips
through `parseCode` correctly.

---

#### 1.3 Placing instances with variant selection

**User story**

As a user placing a component on a page, I want instances to always
start as the default variant and then easily switch variant from the
properties panel.

**Behaviour — drag to place**

- Dragging a component from the components list onto a page canvas
  always places it in the `default` variant (the first variant defined,
  regardless of its name)
- No variant picker on drag — just drop and it appears as default

**Behaviour — switching variant on an instance**

- When a component instance is selected on a page, a "Component"
  section appears at the top of the WYSIWYG properties panel:
  ```
  ┌──────────────────────────────────┐
  │  Component                       │
  │  Button                          │
  │                                  │
  │  Variant   [ solid ▾ ]           │
  │                                  │
  └──────────────────────────────────┘
  ```
- The Variant dropdown lists all available variants for that component
- Selecting a variant updates the instance on the canvas immediately
  and writes the new variant prop value to the page TSX
- Below the Component section the normal WYSIWYG sections continue —
  position, size, etc. — since the instance still participates in
  the page layout

**Generated page TSX:**

```tsx
<Button data-scamp-instance-id="inst_a1b2" variant="solid" label="Get started" />
<Button data-scamp-instance-id="inst_c3d4" variant="outline" label="Learn more" />
```

**Done when:** Dragging a component places the default variant. The
Component section in the WYSIWYG panel lets users switch variants.
Two instances of the same component on a page can show different
variants independently.

---

#### 1.4 Smart warnings for variant changes

**User story**

As a user managing variants, I want to be warned before I make changes
that could break existing instances so I never silently lose work.

**Renaming a variant:**
```
Rename "outline" to "bordered"?

This variant is used by 6 instances across 3 pages.
The prop value will be updated on all instances.

[ Rename ]   [ Cancel ]
```
On confirm: updates `variant="outline"` to `variant="bordered"` on
every instance in every page TSX — atomic multi-file write.

**Deleting a variant:**
```
Delete "ghost" variant?

3 instances use this variant:
· home (1 instance) — will fall back to "solid"
· dashboard (2 instances) — will fall back to "solid"

[ Delete ]   [ Cancel ]
```
On confirm: removes the variant CSS block and updates affected
instances to use the default variant.

**Deleting the default variant:**

The default variant cannot be deleted. The delete option is disabled
in the right-click menu with a tooltip:

```
The default variant cannot be deleted.
Rename another variant to "default" first to change which one is default.
```

**Done when:** All destructive variant operations show a specific,
accurate warning before proceeding and execute atomically.

---

#### 1.5 Variant preview in component list

**User story**

As a user browsing the components panel, I want to see all variants
of a component so I can understand what is available before placing
one.

**Behaviour**

- In the components list, components with more than one variant show
  a small expand arrow next to the component name
- Expanding shows a stacked list of variant thumbnails, each labeled
  with the variant name
- Dragging any variant thumbnail onto the canvas places an instance
  with that variant pre-selected — the one exception to the "always
  place as default" rule
- The component's thumbnail in the collapsed list always shows the
  default variant

**Done when:** The component list shows all variants as thumbnails
and dragging a variant thumbnail places a correctly configured instance.

### Sync project to Scamp cloud

**User story**

As a signed-in Pro user, I want my project files to sync to the Scamp
cloud automatically so my work is backed up and I can access it from
any machine.

**Depends on:** Story 1 (sign in) and the cloud sync API (cloud
backlog).

**Behaviour — enabling sync**

- A "Sync" toggle appears in the project settings or the account panel
  for signed-in users
- Turning it on registers the project with the cloud (creates a Project
  record) and begins syncing
- Free tier users see an upgrade prompt — cloud sync is a Pro feature
- Once enabled, sync runs automatically in the background

**Behaviour — the sync itself**

- When a project file is written to disk (the existing debounced save),
  the sync service queues a cloud upload in the background
- Sync always runs after the local write is confirmed — local first,
  cloud second, never blocking the canvas
- File contents upload directly to Cloudflare R2 via a presigned URL —
  they never pass through the API server
- Project metadata (name, last synced, page list) is written to the
  cloud database via the API
- A sync status indicator in the toolbar shows one of three states:
  - `✓ Synced` — local and cloud agree
  - `↑ Syncing` — an upload is in progress
  - `⚠ Sync paused` — no connection or an auth issue

**Behaviour — cross-machine**

- On project open, the sync service checks the server's last-synced
  timestamp against the local project's last modified time
- If the server is newer (another machine synced more recently), a
  non-blocking banner appears:
  ```
  This project was updated on another machine.
  [ Download latest ]   [ Keep local version ]
  ```
- "Download latest" fetches the current files from R2 and writes them
  locally — chokidar detects the changes and reloads the canvas
- Last-write-wins conflict resolution for the first version — no merge,
  no diff

**Sync service**

A background service in the Electron main process manages all sync. It
runs independently of the canvas and never blocks the UI:

```ts
// src/main/cloudSync.ts
export const initCloudSync = (): void => {
  // Listen for local file writes
  // Queue uploads
  // Retry failed uploads on an interval
  // Poll for remote changes on project open
};
```

**IPC channels**

| Channel | Direction | Payload |
|---|---|---|
| `sync:enable` | renderer → main | `{ projectPath }` |
| `sync:disable` | renderer → main | `{ projectId }` |
| `sync:status` | main → renderer | `{ state, lastSyncedAt }` |
| `sync:conflict` | main → renderer | `{ serverTimestamp }` |
| `sync:downloadLatest` | renderer → main | `{ projectId }` |

**Implementation notes**

- The sync service uploads changed files only, not the whole project on
  every change — track which files changed since the last sync
- Failed uploads retry silently on a 30-second interval — never
  interrupt the user
- If the app is offline, sync pauses and resumes automatically when the
  connection returns

**Done when:** Saving on machine A and opening the project on machine B
shows the updated files. The sync status indicator reflects the current
state.

### Figma import

**User story**

As a user, I want to import a Figma frame as a page or component so I
can bring my Figma designs into Scamp and turn them into real code
rather than rebuilding them manually.

**Behaviour — connecting to Figma**

- File menu → "Import from Figma" opens a dialog
- First-time use prompts for a Figma personal access token with
  instructions on how to generate one (Figma settings → personal access
  tokens)
- The token is stored securely in `safeStorage`
- The user pastes a Figma file URL or frame URL:
  ```
  Import from Figma
  [ https://figma.com/file/abc123/...       ]
  Import as:  ○ New page   ○ Component
  [ Import ]
  ```

**What the import does**

1. Scamp extracts the file key and node ID from the Figma URL
2. It calls the Figma REST API to fetch the frame's node tree
3. It translates Figma's node structure into Scamp's ElementTree
4. It downloads any images and icons used in the frame
5. It generates the TSX and CSS Module files via `generateCode`
6. The imported page or component opens on the canvas

**Translation rules**

Figma's node model maps to Scamp elements as follows:

| Figma node | Scamp element |
|---|---|
| Frame with auto-layout | Rectangle with flexbox |
| Frame without auto-layout | Rectangle with absolute-positioned children |
| Rectangle / shape | Rectangle |
| Text | Text element |
| Image fill | Image |
| Group | Rectangle (container) |
| Component / instance | Scamp component |

**Auto-layout translation (the clean path)**

Figma auto-layout maps well to flexbox:
- Auto-layout direction → `flex-direction`
- Spacing between items → `gap`
- Padding → `padding`
- Alignment → `justify-content` and `align-items`

Frames using auto-layout translate cleanly and produce good flexbox
layouts.

**Absolute positioning (the hard path)**

Most Figma designs are not fully auto-layout — many elements are
absolutely positioned. For these:
- Elements are translated with absolute positioning relative to their
  parent frame
- A warning notes that absolutely positioned elements may need manual
  layout work to become responsive:
  ```
  Some elements were imported with fixed positions because they
  did not use Figma auto-layout. You may want to convert these to
  flex layouts for responsive behavior.
  ```

**Style translation**

- Fills → background color or image
- Strokes → border
- Corner radius → border-radius
- Effects (drop shadow, blur) → box-shadow, filter
- Text styles → font-family, size, weight, line-height, color
- Opacity → opacity
- Figma variables/tokens → mapped to Scamp theme tokens where a
  matching token exists, otherwise resolved to raw values

**Components**

- Figma components and instances are recognized and can be imported as
  Scamp components
- A Figma component with variants maps to a Scamp component with
  variants where possible

**Expectations and limitations**

A notice sets expectations:

```
Figma import brings in the structure, styles, and content of a
frame as a starting point. Auto-layout frames translate best.
Absolutely positioned designs will need layout cleanup. Prototyping,
interactions, and some effects will not carry over.
```

- Prototyping links and interactions are not imported
- Some Figma effects have no direct CSS equivalent and are approximated
- Complex vector shapes are imported as SVGs
- Fonts must be available in the project or set up manually

**IPC channels**

| Channel | Direction | Payload |
|---|---|---|
| `import:figma:auth` | renderer → main | `{ token }` |
| `import:figma` | renderer → main | `{ figmaUrl, importAs }` |
| `import:figma:progress` | main → renderer | `{ step, percent }` |
| `import:figma:complete` | main → renderer | `{ pageId or componentId }` |
| `import:figma:error` | main → renderer | `{ message }` |

**Implementation notes**

- The Figma REST API returns a JSON node tree — no headless browser
  needed, unlike HTML import. The complexity is in the translation
  logic, not the fetching
- The translation from Figma nodes to ElementTree is the core work and
  should be a pure, testable function: `figmaNodeToElementTree(node)`
- Start with auto-layout frames as the well-supported path, then
  improve absolute positioning handling over time
- Image and icon assets are fetched via Figma's image export API and
  saved to `public/assets/`
- The output must round-trip through `parseCode` — validate before
  opening
- A future enhancement is a Figma plugin that pushes directly to Scamp
  rather than requiring a token and URL, but the API approach is the
  right starting point

**Done when:** A user can paste a Figma frame URL, and the frame is
imported as a page or component that opens on the canvas with its
structure, styles, and content translated, and round-trips through
`parseCode`.

# Scamp — Feature Backlog v12

Fourteen items from a user's notes after designing with Scamp, written
as user stories. Each one quotes the note it came from, says what Scamp
does today (checked against the code on 2026-10-12), and lists what
"done" means.

They're grouped by kind: bugs first, then things Scamp already does but
the user couldn't find, then new features, roughly smallest to largest
within each group.

| # | Story | Kind | Size |
|---|---|---|---|
| 1 | Edit every selected element at once | Bug | M |
| 2 | Narrowing a text element keeps the height I set | Bug | S |
| 3 | Drag a component instance on the canvas | Bug | M |
| 4 | Drop an image onto the canvas | Bug | S |
| 5 | Find per-side padding | Discoverability | S |
| 6 | Change an SVG's color | Discoverability / feature | M |
| 7 | Alignment guides when dragging a component | Feature | M |
| 8 | Call a container a group in the layers panel | Feature | S |
| 9 | Tell plain, flex, and grid containers apart in layers | Feature | S |
| 10 | Tell components apart in the layers panel | Feature | S |
| 11 | Gradient picker | Feature | M |
| 12 | Switch units between px and rem | Feature | L |
| 13 | More shapes: line, ellipse, triangle, star, arrow | Feature | L |
| 14 | A built-in icon library | Feature | L |

---

## Bugs

## 1. Edit every selected element at once

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

## 2. Narrowing a text element keeps the height I set

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

## 3. Drag a component instance on the canvas

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

## 4. Drop an image onto the canvas

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

## 5. Find per-side padding

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

## 6. Change an SVG's color - DONE

As a designer, I want to recolor an icon I've added, so that it matches
my design.

> SVG items color change (not working or need to know how to change it)

**Today:** an inlined SVG takes `fill` and `stroke` at the element level,
which works for icons drawn in `currentColor`. An icon with colors
written on its shapes ignores them. `docs/plans/svg-color-editing-plan.md`
(proposed) covers listing an SVG's colors and editing each one.

**Done when:**
- Selecting an SVG shows its colors in the panel, and changing one
  recolors the shapes that use it.
- A one-color icon has a single color control that just works.
- See the plan for the rest.

---

## Features

## 7. Alignment guides when dragging a component

As a designer, I want guides to show when what I'm dragging lines up
with its container or its neighbors, so that I can center or align it
without guessing.

> No guidelines for the alignment while dragging a component (is the
> component at the center or left)

**Today:** `docs/plans/drop-placement-helpers-plan.md` shipped drop
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

## 8. Call a container a group in the layers panel

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

## 9. Tell plain, flex, and grid containers apart in layers

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

## 10. Tell components apart in the layers panel

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

## 11. Gradient picker

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

## 12. Switch units between px and rem

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

## 13. More shapes: line, ellipse, triangle, star, arrow

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

## 14. A built-in icon library

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

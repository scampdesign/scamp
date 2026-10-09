# Canvas

The canvas is your main workspace: a scrollable viewport where you draw
elements that become real code. A floating toolbar above it holds the
drawing tools, and a page-size control is pinned to the top of every
artboard.

## Draw elements

- Press **R** to select the rectangle tool, and then drag to draw a
  rectangle.
- Press **T** to select the text tool, and then click to place a text
  element.
- Press **I** to select the image tool, choose a file, and then draw a
  frame.
- Press **F** to select the input tool, and then drag to place a form
  input.
- Press **V** to switch back to the select tool.

For the full list of HTML tags each tool can produce, and how to change
an element's tag after you place it, see [Elements](elements.md).

## Select elements

- Click an element to select it. Its properties appear in the
  [properties panel](properties-panel.md).
- Click empty canvas space to deselect.
- Click the page-name badge above the canvas to select the page root—a
  shortcut for editing page-level styles such as background, flex
  layout, and padding.
- Selected elements show resize handles at their corners and edges.

## Move and resize elements

- **Move**: Drag a selected element to reposition it.
- **Resize**: Drag any handle on a selected element to change its size.
- **Nudge**: Press an arrow key to move by 1 px, or **Shift+Arrow** to
  move by 10 px.

Drags and resizes clamp to the visible page, so an element can't
disappear off screen. When you edit at a non-desktop
[breakpoint](breakpoints.md), these actions write to that breakpoint's
override instead of the base styles.

## Duplicate and delete elements

- **Cmd+D** duplicates the selected element. Right-clicking and
  selecting **Duplicate** does the same thing.
- **Delete** or **Backspace** removes the selected element.

A duplicate keeps the original's [name](element-naming.md) and gets a new
ID suffix, so `menu_a1b2` duplicates to `menu_c3d4`.

## Copy and paste elements

- **Cmd+C** copies the selection, and **Cmd+X** cuts it. Both are also on
  the right-click menu.
- **Cmd+V** pastes into the selected element, or beside it when that
  element can't hold children (text, images, and inputs). With nothing
  selected, the paste goes into the page.
- **Cmd+Shift+V** pastes in place, at the position the elements were
  copied from, rather than offset from it.
- Right-click the canvas and select **Paste** to drop the elements where
  you clicked.

The clipboard lasts for the whole session and survives switching pages,
so you can copy a nav on one page and paste it onto another. Pasted
elements get new IDs but keep their names.

Copying with the page selected—right-click empty canvas, or select the
page row in the layers panel—takes everything on it, which is the
quickest way to clone a whole page's contents onto a new one.

## Canvas size

The canvas-size control sits above the canvas, to the right of the
page-name badge. It shows the current width, such as `Desktop · 1440`,
and opens a popover with the following:

- **Breakpoints**: Preset buttons for each project breakpoint. Clicking
  one resizes the canvas and switches the active breakpoint for editing.
  For the full responsive workflow, see [Breakpoints](breakpoints.md).
- **Custom width**: Any width from 100 to 4000 pixels. A custom width
  drops the active breakpoint back to Desktop, so edits target the base
  CSS.
- **Clip content**: Hides anything that extends past the canvas edge, so
  the artboard behaves like `overflow: hidden`. See
  [Overflow and boundaries](#overflow-and-boundaries).
- **Fixed height**: Pins the artboard to an exact height, such as `900`,
  to simulate a specific screen. Off by default; the page grows with its
  content.

Canvas width lives in your project's `scamp.config.json`. It's a
design-tool preference, not part of your page's CSS.

## Overflow and boundaries

The canvas edge is a real viewport boundary, which matters most when you
design a desktop layout and then shrink to a mobile width.

- **Overflow indicator** (default): When any element spills past the
  canvas width, a faint amber dashed line marks the edge, with a label
  that shows how much overflows, such as `+ 240px`. The same indicator
  appears on the bottom edge when **Fixed height** is on and content runs
  past it.
- **Clip content**: Turn it on in the canvas-size popover, and everything
  beyond the boundary is hidden, so you see exactly what a viewport of
  that size shows. The indicator disappears because nothing spills.
- The clip setting is remembered per breakpoint. Turning it on at a
  mobile width doesn't force it on at desktop, and vice versa.

A common mobile workflow: switch the canvas to a mobile width such as
390 px, watch the amber indicator show how far your desktop content
overflows, turn on **Clip content** to see the visible frame, and then
apply [breakpoint](breakpoints.md) overrides until the content fits and
the indicator disappears.

The indicator, the clip toggle, and fixed height are canvas viewing aids
only; none of them touch your CSS or page files. One consequence: a PNG
or PDF [export](export.md) taken with clip on captures only the visible
canvas area.

## Scroll and zoom

The scrollbars are at the artboard edges. Scroll in any direction; the
floating element toolbar stays pinned at the top, and the canvas content
moves freely behind it, as in Figma, Sketch, and other design tools.

| Shortcut | Action |
|---|---|
| **Cmd+=** | Zoom in one step |
| **Cmd+-** | Zoom out one step |
| **Cmd+0** | Reset zoom to fit |

**Fit** zooms so the page's width fits the canvas area, plus anything that
overflows past its right edge, up to half the page's width again. A page
with a wider overflow, such as a long scrolling marquee, fits the page
and some of the overflow, and you scroll to see the rest. The overflow
indicator still shows how far it goes.

A blank project shows a 1440×900 white page by default. As you add
content, the page grows vertically. Tall pages scroll inside the artboard
like a real browser window.

## Keyboard shortcut summary

| Key | Tool |
|---|---|
| **V** | Select |
| **R** | Rectangle |
| **T** | Text |
| **I** | Image |
| **F** | Input |

For the full list, see [Keyboard shortcuts](keyboard-shortcuts.md).

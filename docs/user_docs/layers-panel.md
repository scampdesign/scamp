# Layers panel

The layers panel is in the left sidebar. It shows your element tree:
every element on the current page, organized by nesting depth.

## View the tree

Elements are listed top to bottom in the same order as the generated
code. Nested elements appear indented under their parents.

## Select elements

- Click an element to select it. The element highlights on the canvas,
  and its properties appear in the [properties panel](properties-panel.md).
- Cmd-click (macOS) or Ctrl-click (Windows and Linux) to add an element
  to the selection, or to remove one.
- Shift-click to select every layer from the selected one to the one you
  click, at the same level. Their children aren't included. If the two
  layers have different parents, Shift-click selects only the one you
  click.
- With more than one element selected, a change you make in the
  properties panel applies to every selected element it fits:
  Typography changes only the text elements, and a component instance
  takes only a size. A field the selected elements disagree on reads
  **Mixed**; type a value to set it on all of them. Sections that edit
  one element's own settings, such as **Element** and **Position**, show
  when one element is selected.

## Resize the panel

The left panel holds the layers panel, and the page and component lists.
If names are cut off, you can make the panel wider.

- Drag the panel's right edge. The panel can be from 200 to 480 pixels
  wide, and it always leaves the canvas at least 320 pixels.
- Double-click the edge to return to the default width.
- To resize it with the keyboard, press **Tab** until the edge is
  focused, and then press the **Left** or **Right** arrow key. **Home**
  and **End** go to the narrowest and widest.

Scamp remembers the width for every project on this computer.

Hold the pointer over a layer to see its full name and its CSS class. A
page or component whose name is cut off shows its full name the same
way.

## Hide the panel

To give the canvas more room, you can hide the left panel and show it
again at the same width.

- In the sidebar, click the button of the section that's open, such as
  **Pages**. Click it again to show the panel.
- Press **Cmd+B** on macOS, or **Ctrl+B** on Windows and Linux.
- Drag the panel's right edge most of the way to the left.

Clicking any other section in the sidebar shows the panel again.

## Collapse branches

Any element with children shows a small triangle to the left of its
name. The **Page** row doesn't, because collapsing it would hide the
entire tree.

- Click the triangle to hide that element's children, and click it again
  to show them. The triangle points down when the branch is open and
  right when it's collapsed.
- Alt-click the triangle to collapse or expand the whole branch beneath
  it at once.
- Collapsing affects only the tree; nothing on the canvas changes.
- A collapsed row shows a dot when the selected element is hidden inside
  it, so you can always tell where your selection is.
- Selecting an element on the canvas expands whatever it's nested in, so
  the selected element is never hidden.

Collapse state lasts for the session and is never written to your
project files. It resets when you switch to a different page or
component.

## Reorder elements

Drag elements within the layers panel to change their order or nesting.
Where you release decides what happens:

- **Over the middle of a row**: The row highlights, and the element
  becomes a child of it.
- **Near the top or bottom edge of a row**: An indented line appears,
  and the element drops beside the row as a sibling. The line's indent
  shows which level it joins.

Rows that can't hold children—text, images, inputs, and component
instances—never highlight; dropping on them always places the element
beside them.

The canvas follows the same rule: the middle of a container nests
inside it, and its edges drop alongside it. While you drag, Scamp
outlines the container that the element ends up in, so you can see
where it lands before you release. This works the same way in flex and
grid layouts. To cancel a drag, press **Escape**; the element returns
to where it started.

## Rename an element

Double-click an element's name to rename it. For how names map to CSS
classes, see [Element naming](element-naming.md).

## Tooltips

Hold the pointer over any element in the layers panel to see its CSS
class name, such as `hero_card_a1b2`. This helps you find the right
class when you edit CSS outside Scamp.

## Tips

- Use the layers panel to select elements that are hard to click on the
  canvas, such as elements hidden behind others.
- The tree updates in real time as you add, remove, or reorder elements.

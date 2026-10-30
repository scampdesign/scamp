# Group elements

Group selected elements into a flex container to organize your layout.

## Group elements

1. Select two or more sibling elements, by Cmd-clicking (macOS) or
   Ctrl-clicking (Windows and Linux) them, or by dragging a marquee
   around them.
2. Press **Cmd+G** (macOS) or **Ctrl+G** (Windows and Linux).

A new rectangle wraps the selected elements. The group has the
following properties:

- It's a flex container (`display: flex` and `flex-direction: row`) by
  default.
- It uses `fit-content` for both width and height, so it hugs its
  children.
- It has a default gap of `8px` between children.
- It's inserted at the position of the first selected element in the
  parent's child order.

The grouped children have their `x` and `y` reset to `0`, because the
flex layout owns their placement.

## Ungroup elements

Select a group and press **Cmd+Shift+G**. Scamp removes the group
wrapper and promotes its children to the grandparent, preserving their
order.

If the group was inside a non-flex parent, Scamp moves the children to
the group's stored position, so they appear roughly where the group was.

## Rules

- You can group only siblings—elements that share the same parent.
- You can't group the page root.
- Groups are ordinary rectangles with `display: flex`. You can change
  their layout, background, border, and other properties like any other
  element.
- You can nest groups by grouping elements that are already inside a
  group.
- [Renaming](element-naming.md) a group works the same as renaming any
  other element.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Group the selection | **Cmd+G** or **Ctrl+G** |
| Ungroup | **Cmd+Shift+G** or **Ctrl+Shift+G** |

For the full reference, see [Keyboard shortcuts](keyboard-shortcuts.md).

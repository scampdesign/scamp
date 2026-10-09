# Breakpoints

Design for multiple screen sizes without writing media queries by hand.
Switch the canvas to Mobile, Tablet, or Desktop, and make style edits
that land inside the correct `@media (max-width: Npx)` block.

## The default breakpoints

Every project starts with three breakpoints:

| Name | Width |
|---|---|
| Desktop | 1440 px |
| Tablet | 768 px |
| Mobile | 390 px |

These map directly to `@media (max-width: …)` queries in your exported
CSS. You can edit them or add custom breakpoints; see
[Settings](settings.md).

## Switch breakpoints

The canvas-size control above the canvas shows the active breakpoint,
such as `Tablet · 768`. Click it to open the popover, and then select a
breakpoint. The canvas resizes, and from then on your edits go to that
breakpoint's override.

You can also type a custom width in the popover. A custom width drops
the active breakpoint back to Desktop; use one to preview a specific
size without committing to a breakpoint override.

### Breakpoints in the component editor

A component can have its own breakpoint styles. In the
[component editor](components.md#the-component-editor), the same control
reads, for example, `Desktop · 232 × 1308`: the breakpoint, then the
component's canvas size. Selecting a breakpoint there shows and edits the
component at that screen size, but doesn't resize its canvas, because the
canvas is the component's own box.

The component editor always opens at Desktop. When you go back to a page,
the page's breakpoint comes back with its canvas width.

## Edit at a breakpoint

With a non-desktop breakpoint active, every edit routes to that
breakpoint's override:

- Changing padding, background, position, or size lands in
  `@media (max-width: Npx)`.
- Dragging or resizing also lands at the breakpoint. The base desktop
  position is preserved.
- Changing a tag, text content, or name always lands at the base, because
  those aren't breakpoint-specific.

The canvas renders the cascaded styles at the active breakpoint, so what
you see is what the exported page looks like at that width.

## The override indicator

Each section in the properties panel shows a small blue dot next to its
title when the active breakpoint has overrides within that section. Hold
the pointer over the dot to see a tooltip that lists every overridden
CSS property—for example, `padding, background, border-color`.
Right-click the dot to reset every overridden field in the section at
once; each one drops back to its cascade value.

"Cascaded" means that Scamp walks from the widest applicable breakpoint
down to the active one. At Mobile (390), Tablet's override (768) also
applies, because `max-width: 768` matches mobile too. Mobile's override
wins when both set the same field, which matches real CSS cascade
behavior.

## The generated CSS

A page with a tablet override and a mobile override emits the following:

```css
.rect_a1b2 {
  width: 100%;
  padding: 24px;
}

@media (max-width: 768px) {
  .rect_a1b2 {
    padding: 12px;
  }
}

@media (max-width: 390px) {
  .rect_a1b2 {
    padding: 8px;
  }
}
```

- Base styles are on the class itself.
- `@media` blocks are grouped by breakpoint, widest first, at the bottom
  of the file.
- Only overridden properties appear in each `@media` block; everything
  else cascades.

## The CSS editor at a breakpoint

Switch the properties panel to CSS mode while a non-desktop breakpoint
is active, and the editor shows only that breakpoint's declarations.
Commits write to the `@media` block, not the base class.

## External edits

Edit `@media (max-width: …)` blocks by hand or with an AI agent. Scamp
reads them back when the file changes and routes declarations to the
right breakpoint. Unknown queries—`min-width`, `prefers-color-scheme`,
or custom widths outside the project's breakpoint list—are preserved
exactly as written but don't appear on the canvas.

See [Bidirectional sync](bidirectional-sync.md).

## Custom breakpoints

Add breakpoints in **Settings > Breakpoints**. Each breakpoint needs the
following:

- A **label**, such as `Wide`.
- A **width** in pixels—the `max-width` value that lands in your CSS.

Scamp keeps breakpoints sorted widest-first, so the generated `@media`
cascade stays predictable.

You can delete any breakpoint except Desktop, which is the base and
can't be removed.

## Limitations

- **Only `max-width` queries are supported.** `min-width`,
  `prefers-color-scheme`, and `orientation` queries round-trip untouched
  but don't appear on the canvas.
- **Pixel values only.** `max-width: 48rem` doesn't match; use `768px`.
- **No per-breakpoint tag, text, or content.** Only CSS-level properties
  can vary. Changing a tag or editing text always writes to the base.

## Tips

- Start at Desktop, build the base layout, and then switch to Tablet or
  Mobile and change only what needs to change.
- Use the override dot to scan the panel and see exactly which
  properties are customized at the current breakpoint.
- If your project's CSS already uses `@media (max-width: 768px)` from
  before Scamp, your overrides are picked up automatically as long as
  the width matches a defined breakpoint.

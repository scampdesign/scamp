# Properties panel

The properties panel is on the right side of the screen. It shows
editable properties for the selected element. It has two modes, toggled
at the top: **Visual** and **CSS**.

## Visual mode

Visual mode organizes properties into collapsible sections. Only
sections relevant to the selected element type are shown. For example,
text elements don't show Layout, and image elements don't show
Background Color.

### Element

The collapsible **Element** section at the top lets you change the HTML
tag used for the selected element and edit tag-specific attributes, such
as `href` on a link, `controls` on a video, and `placeholder` on an
input. For details, see [Elements](elements.md).

### Size

- The **W** (width) and **H** (height) inputs accept any CSS length:
  - `100` (treated as `100px`) or `100px`: **Fixed**
  - `100%`: **Stretch**
  - `auto`: **Auto**
  - `fit-content`: **Hug**
  - `100vh`, `100vw`, `2em`, `calc(100% - 20px)`, or `var(--page-w)`:
    **Fixed**, with the verbatim value preserved
- The mode selector (**Fixed**, **Stretch**, **Hug**, or **Auto**) syncs
  with whatever you typed: `100%` flips to Stretch, `auto` flips to
  Auto, and so on. You can also select the mode from the list.

#### Aspect-ratio lock

A chain-link toggle sits between the **W** and **H** inputs:

- **Unlocked** (default): Width and height change independently.
- **Locked**: Changing one dimension rescales the other to keep the
  ratio. The ratio is captured at the moment you lock and holds until
  you toggle off and on again. Type a new **W** and press **Tab**, and
  the **H** updates before focus moves on.
- The same lock appears as a small badge on the canvas selection
  handles. Click it to toggle without opening the panel. With the lock
  on, only the corner handles resize, and they scale from the corner.
  The edge handles are disabled so a drag can't distort the element.
- Ratio lock is a session-only editor preference. It isn't written to
  your CSS or saved with the project. Switching an axis to **Stretch**
  (a percentage size) releases the lock, because a percentage can't be
  held against a fixed value.

Imported and pasted SVGs start with the lock on, because their ratio
comes from the `viewBox`. See [SVG](elements.md#svg).

### Layout

- Select **Block**, **Flex row**, **Flex column**, or **Grid**.
- For flex containers: the **Reverse** toggle (`row-reverse` or
  `column-reverse`), the 3×3 alignment grid, **Align** (including
  Baseline), **Justify** (including Evenly), **Gap**, and a **Wrap**
  row. Turn on Wrap, and you also get **Align content** and separate
  **Row gap** and **Column gap** inputs. For details, see
  [Flex layout](flex-layout.md).
- When the selected element's parent is flex or grid, the Size section
  gains an **Advanced** disclosure that holds the child controls. For
  flex, these are Grow, Shrink, **Don't shrink**, Basis, Align self, and
  Order.
- The gap inputs show a token icon on the right. See
  [Spacing tokens](#spacing-tokens).

**Display** sets how the element sits among its neighbors, separately
from how it lays out its children:

- **Block**: on its own line. This is the default.
- **Inline**: in the line of text, like a word. For a flex or grid
  container, this writes `inline-flex` or `inline-grid`.
- **Inline block**: in the line of text, but with its own width and
  height.
- **Contents**: no box of its own; its children act as if they were in
  its parent. A Contents element can't be clicked on the canvas, so
  select it in the [layers panel](layers-panel.md).
- **List item**: a block with a list bullet.

Text and input elements, which don't show Layout, have a **Display**
section with the same choices.

### Spacing

- **P** (padding) and **M** (margin) inputs.
- Shorthand input is supported: type `10` for uniform, `10 20` for
  vertical and horizontal, or `10 20 30 40` for top, right, bottom, and
  left.
- The right edge of each input has a token icon. See
  [Spacing tokens](#spacing-tokens).

#### Spacing tokens

Every length-typed control in the panel—Padding, Margin, Gap, C-gap,
R-gap, Border width, and Border radius—shows a small token icon on the
inside right of the input. Click it for a list of every length token
declared in `theme.css`, such as `--space-md: 16px;` and
`--gutter: 1rem;`.

- Selecting a token on a four-side field (padding, margin, border width,
  or border radius) applies the token to all four sides.
- Selecting a token on a single-value field (gap, column gap, or row
  gap) replaces the value.
- The icon highlights in the accent color when any side currently holds
  a `var(--…)` reference, so token-bound fields are visible at a glance.
- You can still type mixed forms directly: `16 var(--space-md)` on
  padding gives you a pixel top and bottom and a token left and right.
- The list shows an empty state with a **+ Add token** action when the
  project has no length tokens declared yet.

See [Themes](themes.md) for the full token model.

### Background

- A color swatch button that opens the [color picker](color-picker.md).
- Set a background image with **Set background image**, and then adjust
  size, position, and repeat from inline controls.

### Border

- A **Color** swatch, a **Style** selector (solid, dashed, and so on),
  **W** (width), and **R** (border radius).
- Shorthand input is supported for radius, such as `10 20 10 20`.
- **W** and **R** both carry the spacing token picker. See
  [Spacing tokens](#spacing-tokens).

### Shadow

- **+ Add shadow** appends a row. Multiple shadows are supported and
  emit as a comma-separated `box-shadow` value.
- Per row: **X** and **Y** offsets, **B** (blur), **S** (spread), a
  color picker, **O** (opacity from 0 to 100%), and an **Outset** or
  **Inset** toggle.
- Color and opacity are split for clarity: the picker writes a hex base
  color, and the **O** input controls the alpha. The combined output is
  always `rgba(...)`.
- The remove button (×) drops a single row. Emptying the section drops
  the entire `box-shadow` declaration.

### Filters

- A row of CSS `filter` functions applied in order: blur, brightness,
  contrast, grayscale, hue-rotate, invert, opacity, saturate, and sepia.
- **+ Add filter** appends a row. Each row has a kind list and a numeric
  value input with the right unit suffix (px, %, or deg).
- The **Backdrop filter** toggle opens a second row of filters that
  apply to the content behind the element through `backdrop-filter`.
  It's visible only when the element has a partially transparent
  background.
- For details, see [Filters](filters.md).

### Transform

- A row of CSS `transform` functions applied in order: translate,
  rotate, scale, and skew. **+ Add transform** appends a no-op row. Each
  row has a kind list and the inputs that kind needs.
- An **Origin** row sets `transform-origin` with nine presets or any
  CSS value.
- For details, see [Transforms](transforms.md).

### Visibility

- **Opacity**: A number input from 0 to 100%.
- **Display**: A Visible, Hidden, or None segmented control.
- **Blend**: A `mix-blend-mode` list. The default is **Normal**, which
  emits no declaration. Options are grouped by category: Darken
  (Multiply, Darken, Color burn), Lighten (Screen, Lighten, Color
  dodge), Contrast (Overlay, Soft light, Hard light), Inversion
  (Difference, Exclusion), and Component (Hue, Saturation, Color,
  Luminosity).

### Transitions and Animation

See [Transitions](transitions.md) and [Animations](animations.md) for
the shorthand-emitting Transitions section and the preset-driven
Animation section.

### Export

The **Export** section sits at the bottom of the Visual panel and writes
a PNG or SVG of the selected element.

- **Format** list: PNG or SVG.
- **Scale** (PNG only): 1×, 2×, or 3×. Multiplies the captured pixel
  resolution.
- **Size** readout: The live width × height of the export target.
- The Export button label updates with scope: "Export rect_a1b2" for an
  element, or "Export page" for the page root.
- Clicking the button opens a native save dialog. The renderer captures
  the DOM with `html-to-image`, and the main process writes the bytes.
- Editor chrome (selection outlines, drop indicators, and the canvas
  interaction layer) is filtered out of every capture.

## CSS mode

CSS mode switches the panel to a raw CSS editor powered by CodeMirror.
Edit any CSS property directly.

- Changes commit when you click away (blur) or press **Cmd+S**.
- Unknown properties are preserved through round-trips as custom
  properties.
- When a non-desktop breakpoint is active, the editor scopes to that
  breakpoint's `@media` block. See [Breakpoints](breakpoints.md).

## Edit at a breakpoint

When the canvas is at a non-desktop breakpoint (Mobile, Tablet, or a
custom one you defined), field edits land in that breakpoint's override
instead of the base CSS.

- Sections with overrides show a small blue dot next to the section
  title. Hold the pointer over the dot for a tooltip that lists every
  CSS property overridden at the active breakpoint in that section.
- Right-click the dot to reset every overridden field in that section.
  Each field reverts to the cascade value from desktop or a wider
  breakpoint.

See [Breakpoints](breakpoints.md) for a complete walkthrough.

## Duplicate-CSS indicator

When the parser sees the same CSS property declared more than once in an
element's class block, such as `height: 100%; height: 100vh;`, the
section that owns that property shows a small yellow dot next to its
title. Hold the pointer over it for a tooltip that lists the duplicated
property.

Duplicates usually come from agent-written or hand-edited CSS where two
values landed for the same property. The browser cascade picks the
last-declared value, and Scamp's typed state reflects the same.

The dot self-heals when you edit any field on the affected element:
editing rewrites the rule block from typed state, which collapses the
duplicates. Existing fallback patterns, such as
`display: -webkit-box; display: flex;`, are flattened to the modern
value on this rewrite. Back up the file first if you want to keep the
fallback.

## Tips

- Use Visual mode for quick adjustments and CSS mode for precise
  control.
- See [Typography](typography.md) for text-specific properties.
- See [Elements](elements.md) to change an element's semantic HTML tag.

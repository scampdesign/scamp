# Typography

Text elements have dedicated typographic controls in the
[properties panel](properties-panel.md). To define reusable text styles
and manage fonts for the whole project, see [Text styles](text-styles.md).

## Create text

Press **T** to select the text tool, and then drag on the
[canvas](canvas.md) to place a text element.

When a text element is selected, the **Typography** section leads the
properties panel, directly below the Element section, because it's the
main thing you edit on text.

## Apply a text style

The **Text style** list applies a whole named style (H1, Body, and so
on) to the element at once, setting its family, size, weight, line
height, and letter spacing together. Define these styles in the Design
System panel; see [Text styles](text-styles.md).

## Font controls

- **Font Family**: A searchable picker that includes Google Fonts and
  web-safe system fonts. Scamp loads fonts from the Google Fonts CDN, so
  you need an internet connection for non-system fonts.
- **Font Size**: A numeric input in pixels. The token icon on the right
  opens a picker of the size tokens declared in `theme.css`, such as
  `--text-lg`. See [Design system](design-system.md).
- **Font Weight**: An editable list. Select a named weight (100 Thin
  through 900 Black), or type any value from 1 to 1000 for variable
  fonts. See [Choose a font weight](text-styles.md#choose-a-font-weight).
- **Text Color**: Opens the [color picker](color-picker.md).

## Style part of a text element

You can give some of the words in a text element their own color or
weight, without splitting the element up.

1. Double-click the text element to edit it.
1. Select the words you want to change.
1. In the properties panel, set a **Text Color** or **Font Weight**.

Scamp wraps exactly those words in a `<span>` with its own class, and
leaves the rest of the sentence alone:

```jsx
<h1 className={styles.title_0018}>
  works{' '}<span className={styles.title_0018__r1}>alongside</span>{' '}AI.
</h1>
```

While words are selected, the color and weight controls show **that
selection's** style rather than the whole element's, and they act on the
selection when you change them. Selecting text with two different colors
in it leaves the control empty rather than showing one of them.

The selection survives clicking into the panel — that's how you reach
the controls — and clears when you select another element.

**Note:** Retyping the sentence removes the styling from it. The
styling is attached to a position in the text, and replacing the words
leaves nothing for it to hold on to.

Only properties that paint the words themselves can apply to part of an
element: color, weight, style, and decoration. Anything that changes
layout — padding, width, alignment — applies to the whole element, so
those controls keep working the way they always have.

## Alignment and spacing

- **Text Align**: Three icon buttons: **L** (left), **C** (center), and
  **R** (right).
- **Line Height**: A numeric input. The token-picker icon offers any
  bare-number tokens declared in `theme.css`, such as
  `--line-height-body: 1.5;`.
- **Letter Spacing**: A numeric input for the spacing between
  characters. It shares the length-token picker with font size.

## HTML tag

Choose the semantic HTML tag for the text element: `p`, `h1` through
`h6`, `span`, and more. The tag you select appears in the generated TSX,
which determines how your content is structured in the final code.

## How fonts work

When you select a Google Font, Scamp adds a CDN link to load it. The
font renders both on the canvas and in the generated code. Web-safe
fonts—Arial, Georgia, the monospace families, and so on—work offline
without a CDN dependency.

# Elements

Every Scamp element is rendered as a real HTML tag in the generated
code. By default, rectangles are `<div>`, text is `<p>`, images are
`<img>`, and inputs are `<input>`, but you can change any element to a
more semantic tag from the properties panel.

## Element types

Scamp has four element types, identified by the class-name prefix in the
generated CSS:

| Type | Class prefix | Default tag | Toolbar shortcut |
|---|---|---|---|
| Rectangle | `rect_` | `div` | **R** |
| Text | `text_` | `p` | **T** |
| Image or media | `img_` | `img` | **I** |
| Input or form control | `input_` | `input` | **F** |

The class prefix stays the same when you change the tag: a `<nav>`
rectangle is still `rect_…`, and an `<h1>` text element is still
`text_…`. This keeps CSS selectors stable across tag changes.

## Change the tag

1. Select an element.
2. In the properties panel, expand the **Element** section at the top.
3. In the tag list, select a new tag.

The canvas re-renders immediately with the new tag, and the generated
TSX updates.

### Rectangle tags

`div` (default), `section`, `article`, `aside`, `main`, `header`,
`footer`, `nav`, `figure`, `form`, `fieldset`, `ul`, `ol`, `li`,
`details`, `summary`, `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`,
`td`, `dialog`, `button`, and `a`.

### Text tags

`p` (default), `h1` through `h6`, `span`, `label`, `blockquote`, `pre`,
`code`, `strong`, `em`, `small`, `time`, `figcaption`, `legend`, `li`,
`a`, `button`, `th`, `td`, and `caption`.

Some tags appear in both lists. A `<td>` that holds only words is a text
element; one that holds other elements is a rectangle. The same is true
of `<li>`, `<a>`, and `<button>`.

### Media tags

`img` (default), `video`, `iframe`, and `svg`.

### Input tags

`input` (default), `textarea`, and `select`.

## Tag-specific attributes

When you select a tag that takes attributes, inputs for them appear
below the tag list in the Element section:

| Tag | Attributes |
|---|---|
| `a` | `href`, `target` (`_self`, `_blank`, `_parent`, or `_top`) |
| `button` | `type` (`button`, `submit`, or `reset`) |
| `form` | `method` (`get` or `post`), `action` |
| `label` | `for` (React's `htmlFor`) |
| `blockquote` | `cite` |
| `time` | `datetime` |
| `dialog` | `open` (checkbox) |
| `video` | `src`, `controls`, `autoplay`, `loop`, `muted` |
| `iframe` | `src`, `title` |
| `input` | `type` (text, email, password, number, checkbox, radio, range, date, or file), `placeholder` |
| `textarea` | `rows`, `placeholder` |

Boolean attributes (`controls`, `autoplay`, `muted`, `loop`, and `open`)
are emitted without a value when checked, matching standard HTML.

Any attribute you add in the CSS editor or externally round-trips
cleanly; Scamp preserves unknown attributes verbatim.

## Select and option

`<select>` elements have an **Options** editor inside the Element
section instead of plain attribute fields. Add, remove, and rename
options, and mark one as initially selected.

Options live as a typed list on the select element; they aren't drawable
canvas elements. Editing them through the panel is the only way to
change them.

## The image source

Select an image, and the **Image** section sits directly after Element
at the top of the properties panel. It holds two fields:

- **Source**: The image's `src`, as a text field. Type any path or an
  absolute URL (`https://…`), and then press **Enter** or click away to
  commit. Nothing is applied per keystroke.
- **Alt text**: The alternative text written into the generated `<img>`.

**Replace** imports a file from your computer into the project's assets
folder and points Source at it. Use Source directly when the image you
want is already somewhere Scamp doesn't need to copy—an absolute URL,
or a path you manage yourself.

Because an `<img>` already has a source of its own, the Background
section doesn't offer **Set background image** for one. If a background
image is already set on an image element, the control stays available
so you can remove it.

## Images and file size

When you bring a PNG or JPEG into a project, Scamp re-encodes it as
WebP on the way in, which produces fewer bytes for the same picture. It
downloads faster and takes less room when your project is backed up: a
1.7 MB PNG screenshot typically lands under 20 KB, and a 7 MB camera
photo under 500 KB.

- `hero.png` becomes `hero.webp`, and the page references the new name.
- Importing a large photo takes a second or two, with an **Optimizing
  image…** indicator while it works.
- Very large images are scaled down to 3000 px on their longest edge. A
  12000 px wide photo has around 25 times more pixels than a browser
  ever shows, so the extra detail is invisible while costing megabytes.
  Images already smaller than that are left at their original size, and
  nothing is ever scaled up.
- SVGs and existing WebP files are left alone. SVG is already vector,
  and re-encoding a WebP would only lose quality.
- If the WebP would be larger than what you supplied, which happens with
  very small or already tightly compressed files, Scamp keeps your
  original untouched.
- Choosing an image that's already in your project's assets folder
  links it, with no copy and no re-encode.

Every current browser supports WebP.

## SVG

SVGs render as real artwork on the canvas, not as a placeholder, and the
exported TSX contains your source. There are three ways to get one onto
the canvas:

- **Drag and drop** an `.svg` file from your file manager. Small icons
  are inlined as an editable `<svg>` so you can recolor them. Large
  illustrations are copied into your assets and referenced as an
  `<img>`.
- **Paste** (**Cmd/Ctrl+V**) SVG markup you copied from a code editor
  or design tool. A copied raster image pastes too, and is saved to your
  assets.
- Switch any element's tag to `svg` in the Element section, and then
  paste markup into its **Source** text area.

For safety, pasted and dropped SVG is sanitized: `<script>`, event
handlers, and external references are stripped before the SVG is added
to your canvas.

### Edit fill and stroke

Select an inline SVG, and the **SVG** section appears in the Visual
panel with **Fill**, **Stroke**, and **Stroke width** controls. Theme
tokens and `currentColor` are supported. These recolor the icon, with
fill and stroke set independently.

This works even for icons that hardcode their own colors: the Fill and
Stroke you set on the element recolor the shapes inside. On import,
Scamp also drops any fully transparent bounding-box shape that icon sets
include, so recoloring never paints a solid square over your icon, and
the source stays clean and valid.

**Tip:** Outline icons, such as Lucide and Tabler, are drawn with
strokes, not fills. Recolor them with the **Stroke** control. Solid or
filled icons use **Fill**. The panel starts from the icon's own colors,
so it's usually clear which applies. An icon built from several distinct
hardcoded colors collapses to one color when recolored, because
element-level paint is a single fill and stroke, not per-shape.

### Resize an SVG

Inlined SVGs start with their
[aspect-ratio lock](properties-panel.md#aspect-ratio-lock) on. The ratio
comes from the SVG's `viewBox`, so dragging a corner scales the artwork
proportionally instead of squashing it. Unlock it from the Size section
if you deliberately want to stretch the SVG.

### Reload an externally edited SVG

An inlined SVG keeps a reference to the file it was imported from. If
that file changes on disk because an agent or a text editor rewrote it,
Scamp notices and offers to pull the new version in:

> SVG file updated externally. **[ Reload SVG ]  [ Keep current ]**

**Reload SVG** replaces the inline source with the file's contents. Any
recoloring you did in Scamp is part of the inline source, so reloading
discards those color edits; the prompt says so before you commit. **Keep
current** leaves your in-canvas version untouched.

## Tables

The table tags are available, so a table you import or build keeps its
meaning and its content in the generated code. Use `table` for the
table itself, `thead`, `tbody`, and `tfoot` for its sections, `tr` for a
row, `th` for a header cell, `td` for a body cell, and `caption` for the
table's title.

Scamp removes the styling a browser applies to a table on its own: the
gap between cells, and the bold, centered header cell. Those aren't
choices you made and the properties panel can't show them, so the canvas
and the generated page both start from a plain table you style yourself.

### Set a table's columns

A table's column widths are defined once, on the table, so a change
moves the header and the body together.

1. Select the table.
2. In the properties panel, expand the **Columns** section.
3. Click **Define 3 columns**. The number is the count of cells in the
   table's first row, and Scamp adds one track for each.
4. Set each track's size. A track can be a fraction of the space
   (`fr`), a fixed number of pixels, a percentage, or sized to its
   content.

To add a column, click **Add column** and draw a cell in each row. To
add a row, draw a rectangle inside `thead`, `tbody`, or `tfoot`; Scamp
tags it `tr`.

**Note:** A cell's **W** field reads `Column` and can't be edited,
because the column it sits in sets its width. Height, padding, and
alignment are still the cell's own.

### Make a cell span columns

1. Select the cell.
2. In the **Element** section, set **Col span** or **Row span**.

Scamp writes the `colspan` attribute and places the cell across that
many tracks. You don't set a grid position yourself.

## Tag defaults from context

When you draw a new element inside a container that expects a particular
child, Scamp sets the tag for you. You can change it afterward.

| You draw inside | Scamp uses |
|---|---|
| `ul` or `ol` | `li` |
| `table` | `tbody`, or `caption` for a text element |
| `thead`, `tbody`, or `tfoot` | `tr` |
| `tr` | `td` |

A child of `table` becomes a section rather than a row because a browser
moves a `tr` written directly inside a `table` into a `tbody` it adds
itself. Starting from the section keeps what you see on the canvas and
what the published page renders the same.

## What doesn't change with the tag

The element's CSS class name, its `data-scamp-id`, and all its styles
stay put. The tag is purely semantic; it doesn't affect how Scamp
identifies or styles the element.

## Tips

- Use `<nav>` for menus, `<header>` for page hero regions, `<main>` for
  the primary content column, and `<footer>` for the page footer.
  Semantic tags improve accessibility and SEO without changing your
  design.
- Heading levels (`h1` through `h6`) should reflect your content
  hierarchy, not font sizes. Keep font-size controls in the
  [Typography](typography.md) section.
- `<button>` on the canvas has its default browser chrome reset, so it
  looks like the box you drew. Style it however you want.

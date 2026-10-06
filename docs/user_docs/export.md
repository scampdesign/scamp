# Export

Scamp exports in two different ways, for two different jobs:

- **Image export**: The current page or a selected element as a PNG or
  SVG. It lives in the Export section at the bottom of the properties
  panel.
- **[HTML export](#export-as-html)**: The whole project as a folder of
  plain HTML and CSS files that you can open in a browser or upload to
  any static host. It lives in the **Export HTML** button in the project
  header.

This page covers image export first, and then HTML export.

## Trigger an export

The Export section appears in the properties panel when an element is
selected. Its scope is implicit:

- **No selection**: Exports the whole page (the canvas frame).
- **One element selected**: Exports only that element and its
  descendants.
- **Two or more elements selected**: The controls are disabled with an
  inline note. Select a single element to enable them.

Right-clicking an element on the canvas also offers an **Export…** menu
item that scrolls the section into view.

## Section controls

- **Format** list: PNG or SVG.
- **Scale** segmented control (PNG only): 1×, 2×, or 3×. Multiplies the
  captured pixel resolution. The default is 2×, which is Retina-ready.
- **Size** readout: The live width × height of the export target.
- **Export** button: Opens a native save dialog. The label reflects the
  scope: "Export rect_a1b2" or "Export page".

## What's captured

Editor chrome—selection outlines, resize handles, drop indicators, and
the canvas interaction layer—is filtered out of every capture. Only the
design content is written to the file. The capture happens at the
design's intrinsic size regardless of your current zoom level; zooming
doesn't affect output dimensions.

## Format notes

### PNG

- Always raster output. Resolution depends on the **Scale** control.
- Transparent backgrounds are preserved. An element without a
  background color produces a transparent PNG.

### SVG

- Resolution-independent.
- Some complex CSS effects—filters, certain blend modes, and
  `backdrop-filter`—might not be fully captured, because the underlying
  `html-to-image` library has known limits there. PNG is more faithful
  for designs heavy on visual effects.

## File naming

The save dialog opens with a suggested filename based on the scope:

- Page export: `<page-name>.png` or `.svg`
- Element export: `<element-class>.png` or `.svg`, such as
  `hero-card_a1b2.png`

The default save folder is the project folder. You can rename and
relocate the file inside the dialog.

## What's not yet supported

- **PDF export** was scoped out of v1; only PNG and SVG ship today. PDF
  might return in a later release.
- **Multi-element export**: Only one element at a time.
- **Animated states**: The export captures the element's current paint
  frame only. Hover styles and mid-animation frames aren't reproduced.

---

# Export as HTML

**Export HTML** in the project header writes your whole project, every
page, as a folder of ordinary `.html` and `.css` files. There's no build
step, no framework, and no `node_modules`. Double-click `index.html` to
view it, or drop the folder onto any static host.

## Export the project

1. In the project header, next to **Preview**, click **Export HTML**.
2. Choose a location: Documents, your Desktop, or anywhere else.
3. Scamp creates a new folder there named after your project, puts the
   site inside it, and then opens it.

You're picking a location, not a destination folder. Choosing
`Documents` for a project called `my-site` gives you
`Documents/my-site/`. Nothing already in `Documents` is touched.

The button tells you where things stand:

| Label | Meaning |
|---|---|
| **Export HTML** | Ready. |
| **Exporting…** (spinning) | Writing files. |
| **Exported 12 files, 3 images** (green) | Done. Clears after a moment. |
| **Export failed** (red) | Something stopped it. Hold the pointer over the button for the reason. |

Holding the pointer over the green confirmation shows the full path,
which is worth checking the first time, because Scamp picks the folder
name.

Exporting the same project to the same place again reuses its folder and
overwrites the previous export. If that name is taken by something Scamp
didn't write, it uses `my-site-2` instead. Scamp never writes over a
folder that isn't its own.

On some Linux desktops the folder doesn't open by itself. The green
confirmation on the button is the reliable signal that the export
worked.

## What you get

```
index.html        index.css      ← your home page
about/
  index.html      index.css      ← every other page
theme.css                        ← your design tokens
assets/                          ← your images
.scamp-export                    ← marks this folder as a Scamp export
```

Each page keeps its route as a folder, so `about/index.html` is served
at `/about` on a real host, the same address it had in Preview. Links
between your pages are rewritten to match, and they work both on a host
and straight off your disk.

## How it relates to your design

The export is meant to look identical to the canvas.

- **Components are flattened.** Each instance becomes ordinary HTML in
  place, with its own copy of the component's styles. Two instances of
  one component stay independent, so any per-instance sizing or text
  you set is preserved exactly.
- **Your CSS comes through as written**, including breakpoints, hover
  and focus states, transitions, and animations. They're all CSS, so
  they keep working.
- **Repeated elements and conditions use their sample data.** An element
  set to repeat is written once for each sample row, and an element with
  a show condition is left out when its sample is off, as on the canvas.
- **Images are copied** into `assets/` and referenced relatively.
- **`theme.css` is copied as is**, so every token still resolves.

## Things to know

- **It's a snapshot, not a live link.** Changing your design doesn't
  update a folder you exported earlier. Export again.
- **The export is static.** Scamp pages don't use JavaScript, so nothing
  is lost, but the files can't do anything interactive beyond what CSS
  provides.
- **Web fonts loaded by URL still need the network.** If your
  `theme.css` imports fonts from Google Fonts or Adobe, the exported
  pages fetch them the same way, so they don't render correctly fully
  offline.
- **It exports what's saved.** Scamp saves as you work, so this is
  almost always what you're looking at. If the save indicator is still
  spinning, let it finish first.

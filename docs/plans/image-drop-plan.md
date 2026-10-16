# Drop an image onto the canvas

Status: **built**, 2026-10-15. Waiting on a manual test: a PNG from the file manager, and an image dragged from a browser.

Story: "Drop an image onto the canvas", the next bug in
`docs/backlog-open.md`.

> Image drag and drop is not working

## Why it's broken

The backlog entry says this was never reproduced. The cause is in the
code.

- **What the drop reads.** `useDropInsert.handleDrop`
  (`canvas/interactions/useDropInsert.ts`) gets a dropped raster file's
  location from `(file as File & { path?: string }).path`.
- **What it needs it for.** It passes that path to `importImage`, which
  asks the main process to copy the file into the project's assets.
- **Why it's empty.** `File.path` was Electron's own addition to the web
  `File` object. **Electron 32 removed it.** Scamp is on Electron 44
  (`package.json`, and `docs/archive/2026-08-31-electron-upgrade-plan.md`).
  So `filePath` is always `undefined`, and `insertRaster` returns on its
  first line.
- **What the user sees.** Nothing happens: no image, no error, no log
  line.

Exactly which drops fail:

| Dropped | From | Today |
|---|---|---|
| PNG, JPEG, WebP, GIF | File manager | **Does nothing** |
| SVG under the inline limit | File manager | Works. It's read with `file.text()`, so no path is needed |
| SVG over the limit | File manager | **Does nothing.** It falls back to the raster path |
| Any image | A web browser | **Does nothing.** `dragover` accepts only `Files`, and a browser drag on Linux usually carries a URL, not a file |
| A non-image file | Anywhere | Does nothing, silently |

The image tool and the Background section's **Set background image**
still work. They take their path from the native file picker, not from
a `File`.

The end-to-end test below reproduces the first row on today's code.

## The fix

### 1. Get the path the supported way

Electron's replacement is `webUtils.getPathForFile(file)`, which can
only be called from the preload.

- **Preload.** Expose one function, with no IPC channel needed since it
  runs in the preload itself:

  ```ts
  /** The file's path on disk, or '' for a file with none (made in the page, pasted). */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  ```

- **Renderer.** `useDropInsert` calls `window.scamp.pathForFile(file)`
  instead of reading `file.path`. The `as File & { path?: string }`
  cast goes away.

### 2. A file with no path still imports

Some files have no path on disk: a drag from a browser that hands over
the image as a file, or anything built in the page.

- For those, read the bytes in the renderer (`file.arrayBuffer()`) and
  send them as a `data:` URL to the existing `fetchImage` IPC
  (`import:fetchImage`), the one website import uses.
- `fetchImage` already accepts `data:` URLs, checks the type against
  its allow-list, caps the size (`MAX_IMAGE_BYTES`), writes into the
  project's assets, and returns the same `{ relativePath, fileName }`.
- So no new main-process code is needed. The file's own name, minus
  its extension, goes in `assetName`.

### 3. Images dragged from a browser

- **Accept the drag.** `handleDragOver` also accepts drags carrying
  `text/uri-list` or `text/html`, alongside `Files`.
- **Find the image URL.** `handleDrop` uses the first of:
  1. the dropped file, if any (steps 1 and 2)
  2. the first `http`, `https`, or `data:` URL in `text/uri-list`
  3. the first `<img src>` in `text/html`, for a browser that only
     sends the page's markup

  A small pure function does this, `imageUrlFromDrop({ uriList, html })`
  in `src/renderer/lib/`, fully tested.
- **Download it** through `fetchImage`, then place it as today.

`fetchImage` also checks the downloaded content type, so a link to a
web page (not an image) is refused with a reason instead of being
saved.

### 4. A drop that can't be used says why

Today every refusal returns silently. Each one now leaves a short notice
on the canvas, and the same line in the app log:

| Case | Notice |
|---|---|
| No page or component open | "Open a page to drop an image onto it." |
| Not an image | "`notes.pdf` isn't an image. Drop a PNG, JPEG, WebP, GIF, or SVG." |
| Download refused or failed | "Couldn't add the image: `<fetchImage's error>`" |
| Copy failed | "Couldn't add `photo.png`: `<error>`" |
| Nothing usable in the drag | "That drag didn't carry an image." |

The notice is new UI state:

- **The store.** A `canvasNotice: string | null` in the UI slice
  (`store/canvas/slices/ui.ts`). It's set by `showCanvasNotice(message)`,
  which clears it again after 4 seconds.
- **On screen.** It shows as a pill in `CanvasInteractionLayer`, next
  to the existing `image-import-busy` overlay, with `role="status"` and
  the theme's warning tokens.

Copy follows the docs style guide: plain sentences, no "please".

## Tests

### Unit tests

`test/imageUrlFromDrop.test.ts` covers:

- a URI list with comments and blank lines
- several URLs (the first image-capable one wins)
- `data:` URLs
- HTML with an `<img>`, with no `<img>`, and malformed HTML
- `javascript:` and `file:` refused
- empty input

### End to end

New `test/e2e/canvas/image-drop.spec.ts`. Playwright can't drag from
the OS file manager, so the spec builds the `DataTransfer` in the page
and dispatches `dragover` and `drop` on the canvas layer, as the
browser does.

1. **A PNG file lands in assets and on the page.** Drop a small PNG
   `File`. It has no disk path, so this exercises step 2. An `<img>`
   appears under the drop point, and the asset file exists.

   Fails on today's code: nothing happens.
2. **A URL drag.** Drop `text/uri-list` holding a `data:image/png` URL;
   an `<img>` is placed.
3. **An HTML-only drag.** Drop `text/html` with `<img src="data:…">`;
   an `<img>` is placed.
4. **A non-image is refused with a reason.** Drop `notes.txt`. Nothing
   is placed, and the notice names the file.
5. **The inline SVG path still works.** Drop an SVG `File` and check
   that an inline `<svg>` element is created.

The preload's `pathForFile` can't be reached with a real disk path from
Playwright. Check by hand by dropping a PNG from the file manager. On a
real drop it returns the path, so the asset is copied directly rather
than going through a `data:` URL.

Also run the existing image specs, including the image tool, image
source, and `background-image`.

## Not in scope

- **Dropping several files at once.** It takes the first, as today.
- **Dropping onto the layers panel.** Its `onDrop` handles reordering
  layers, not files.
- **Pasting an image from the clipboard.** That's a different path
  (`src/main/ipc/clipboard.ts`). I didn't check it here.

## What was built

As planned.

- **Preload.** `pathForFile` calls `webUtils.getPathForFile`.
- **The drop.** `useDropInsert` uses it. A file with no path goes
  through `fetchImportImage` as a `data:` URL. A drag with no file
  reads its URL with `imageUrlFromDrop`
  (`src/renderer/lib/imageUrlFromDrop.ts`).
- **The notice.** Each refused drop calls `showCanvasNotice` (UI slice,
  cleared after 4 s) and logs a warning. `CanvasNotice` shows the
  notice over the canvas, outside the zoomed frame, so it reads the same
  at any zoom.

Tests: `test/imageUrlFromDrop.test.ts` (6) and
`test/e2e/canvas/image-drop.spec.ts` (5). The PNG case was run against
the old code with the fix stashed, and it failed there: nothing was
placed. The existing image and SVG specs pass:
- `draw-image`, `image-import-indicator`, `image-reuse`
- `background-image`, `image-source-alt`, `image-source-bound`
- `svg-import`, `svg-paste`

## After the first manual test

Reported: the drop "only works sometimes", or the **+** cursor appears
only after holding the image over the canvas for a long time.

**Most likely cause: outside Scamp.** On Linux, Scamp forces the X11
backend (`docs/notes/linux-wayland-ozone.md`), so on a Wayland session
it runs under XWayland. A drag from a Wayland app crosses GNOME's
XWayland drag bridge, which is known for exactly this delay.

**Two gaps in Scamp, fixed anyway:**
- **The canvas now accepts at `dragenter`**, not only `dragover`, as the
  HTML spec has a drop target do.
- **`main.tsx` now refuses stray drops.** It cancels any `dragover` or
  `drop` that no target took, and marks it as no drop. Electron's
  default is to navigate the window to a dropped file, which would
  replace the app with the image.

A sixth end-to-end test covers both. The app's other drag specs (layers
reorder, page groups, component drags, slots, reparenting) pass with
the guard in place.

**If the delay remains after this,** it's the XWayland bridge. Two ways
to check:
- Drag the same image into another X11 app.
- Run Scamp with `SCAMP_OZONE_PLATFORM=wayland` once Electron's
  Wayland crash is fixed upstream.

---
title: Start-screen project thumbnails
related:
  - src/renderer/lib/thumbnailCrop.ts
  - src/renderer/src/lib/projectThumbnail.ts
  - src/renderer/src/syncBridge/writeIfDirty.ts
  - src/renderer/src/components/startScreen/ProjectCardThumb.tsx
  - src/main/ipc/projectThumbnailOps.ts
---

# Start-screen project thumbnails

Every successful save of a project's **home** page captures the canvas,
crops it to the card aspect, and writes `<projectPath>/.scamp/preview.png`.
The start-screen cards render it above the project name. Projects with no
thumbnail show their `cardBackground` colour in the same space, so the grid
stays even.

This is the component-sidebar thumbnail pipeline
(`docs/notes/components-thumbnails.md`) one level up, with two differences:
it crops, and it only fires for one page.

## Why on save, not on close

The original idea was to capture when the project closes, so the card
always reflects the latest state. Two problems, both settled in
`docs/archive/2026-08-28-project-thumbnails-plan.md`:

- **`onClose` is not the only exit.** It fires only when you click Close
  and land back on the start screen. Quitting with a project open
  (Cmd/Ctrl+Q, closing the window, a crash) goes through main's
  `before-quit` and never touches the renderer. Someone who always quits
  directly would never get a thumbnail, with nothing to explain why.
- **Capture is async; closing unmounts the canvas.** `App.tsx`'s `onClose`
  calls `setProject(null)` immediately. `html-to-image` clones the subtree,
  inlines fonts, and rasterises through an SVG data URL before it resolves.
  Tearing the canvas down mid-flight yields blank or partial images —
  intermittently, which is the worst kind to debug.

Capturing on save sidesteps both: nothing is unmounting, and every exit
path keeps the last good thumbnail. The thumbnail is at most one save
behind, which is a stronger freshness guarantee than "as of last close"
anyway.

## Why the home page only

The card's job is recognition. A project should look like itself on the
start screen, not like whichever page you happened to stop on. So
`captureAndPersistProjectThumbnail` returns immediately unless the saved
page is named `home` (`app/page.tsx`, keyed `'home'` internally).

The consequence: a session spent entirely on `pricing` leaves the card
showing an older home page. That is the intended trade — a stale but
recognisable card beats a fresh but arbitrary one.

## Cropping, not squashing

A page capture is often 1200 wide and several thousand tall; a card is a
16:10 rectangle. Scaling the whole page into that strip produces an
unreadable smear, so `@lib/thumbnailCrop` takes the **full width, from the
top**, cut off at the card aspect.

Horizontal cropping never happens — cutting the sides off a page loses the
layout, which is the thing the thumbnail exists to show. A page *shorter*
than the card aspect is therefore drawn at the top with its own background
colour painted below it, which is what a short page looks like in a
browser too.

Stored at 640px wide (2× the widest a card gets, since the grid is
`minmax(220px, 1fr)`) and never upscaled — enlarging a raster only costs
bytes.

`THUMBNAIL_ASPECT` in `thumbnailCrop.ts` and the `aspect-ratio` in
`ProjectCardThumb.module.css` must agree. If they drift, the image
letterboxes inside its own frame.

## Capture must not touch the live canvas

`capturePng` (the export path) mutates the real DOM while it works: it
resets the frame's `transform` and strips selection classes, restoring both
afterwards. That is invisible for an export the user asked for and waits
on. It is very visible on every save — `Viewport.measureFrame` recovers the
applied zoom from `getBoundingClientRect().width / offsetWidth`, so
blanking the transform makes the canvas jump to 100% and back on every
edit, and the selection outline flickers with it.

`captureIsolatedPng` clones the frame instead, fixes the clone up
off-screen with `transform: none`, and rasterises that. The clone keeps
`data-scamp-canvas` and the frame's inline theme custom properties, so the
`@scope`d page stylesheet and every `var(--…)` resolve as they do on the
real canvas.

Two consequences worth knowing:

- The clone is created and detached **synchronously**, so a capture
  started immediately before the canvas unmounts still completes. That is
  what makes `flushPendingProjectThumbnail` safe to call from `onClose`.
- Captures are debounced 1500ms after the last save
  (`CAPTURE_IDLE_MS`). Rasterising a whole page on every 200ms save
  debounce is far more work than a thumbnail is worth, and it competes
  with the canvas for the main thread — felt as jerky zooming and dragging.

The component thumbnail path still uses the mutating `capturePng` and has
the same flicker on component saves. Not fixed here, but it is the same
bug and `captureIsolatedPng` is the fix.

## Freshness and the file watcher

The watcher ignores dotfile paths, so writing `.scamp/preview.png` fires no
`file:changed` and triggers no project re-read. Unlike component
thumbnails, no custom event is needed to refresh the UI: the start screen
is not mounted while the project is open, so it reads the thumbnail fresh
every time it appears.

## What is deliberately not done

- **No backfill.** Projects that predate this feature show their
  placeholder until they are next opened and their home page saved.
  Generating thumbnails for every project on the start screen would mean
  opening and rendering each one — a lot of work for a picture.
- **No deletion on "remove from list".** The thumbnail lives inside the
  user's project folder. Removing a project from the start-screen list is
  a Scamp-side act; it should not reach into their files.
- **Not shared between machines.** `.scamp/` is gitignored, so a cloned
  project shows its placeholder until opened and saved locally. A
  screenshot is a local cache, not project source.


## A framework project never captured one

Every Scamp-framework project has had a blank card on the start screen
since the format shipped.

The capture is scheduled from a save, gated on `target.kind === 'page'`.
A framework project has no pages: every page is a view, opened through
`activeComponent`, so its edit target is always a `component` and the
gate never fired.

The name needed translating as well as the kind. A page is `home`; the
view that serves `/` is `Home`, and the capture drops anything whose
name is not `home` — so even a loosened kind check would have thrown it
away one line later. `thumbnailNameFor` answers both at once: the page's
own name for a page, the SLUG for a view, and null for a reusable
component however it is named. It takes the tree's kind rather than
guessing from the name, because a component called `Home` is not a
front page.

The e2e that covers this pinned `format: 'nextjs'`, which is why it was
never caught — the same test now runs against both formats, and the
framework one fails without the fix.

## The card had the wrong font and no background images

Both come from the same fact about how a capture is made: it rasterises
through `<img src="data:image/svg+xml,…">`, and that document can fetch
nothing at all. Anything the page pulls over the network — or through
the app's own `scamp-asset://` scheme — has to be inlined before the
rasterise or it simply is not there.

**The font.** `skipFonts: true` was set for a real reason:
html-to-image's own walk reads `cssRules` on every sheet, which throws
for a cross-origin one — Google Fonts — and it logs each failure. That
much was right. What followed it, "those fonts could never be embedded
anyway", was not. The SHEET cannot be READ cross-origin, but it can be
FETCHED by href, and the font files it points at serve CORS headers.

`embedFonts.ts` does that and hands the result to html-to-image as
`fontEmbedCSS`, which makes it skip its own walk entirely — so the
console noise the flag was protecting against does not come back. Only
the families actually set on the captured node are inlined, because a
Google Fonts stylesheet is a face per weight per unicode range and none
of the unused ones belong in a thumbnail. A design on system fonts
produces nothing, and then `skipFonts` stays on and nothing is fetched.

**The background images.** `fetch('scamp-asset://…')` threw. The scheme
was registered `supportFetchAPI: true` but not `corsEnabled`, so the
renderer could RENDER an asset and not read one — the canvas showed the
image and the capture could not inline it.

The scheme is `corsEnabled` now, and the handler decides which origins
that applies to. Deliberately not `Access-Control-Allow-Origin: *`:
this scheme lives on the default session, which the IMPORT window's
`<webview>` shares, and that webview points at whatever site is being
imported. A blanket allow would let any page it loads read the open
project's files by guessing paths. The app's own windows send no Origin
(`file://`) or the dev server's and get the header; a third-party page
sends its own, gets nothing, and its fetch fails exactly as before.

The preview's webview is on its own partition, so it never reached this
scheme either way.

Pinned by an e2e that seeds a real asset, references it from the page
CSS, and counts the pixels in the resulting PNG — a blank capture is a
valid PNG of the right size, so only the pixels tell the two apart.

## One project's screenshot on another project's card

The capture reads the canvas that is on screen and writes to a path
decided 1.5 seconds earlier, and nothing checked that the two still
agreed. Close one project and open another inside that debounce and
they do not: the photograph is of the project that just opened, filed
under the one that just closed.

`runCapture` drops the capture when the open project is no longer the
one it was scheduled for. The close path is unaffected — it flushes
while its own project is still open, which is exactly why it runs
before `setProject(null)` rather than after.

The consequence of dropping rather than redirecting: closing a project
in the second after an edit can leave the thumbnail one edit behind,
because `flushPendingPageWrite` schedules its capture through a
`requestAnimationFrame` that lands after the close. A stale thumbnail
is a better failure than the wrong project's.

The component equivalent has the same shape and is not affected: it has
no debounce, so its window is a single frame rather than a second and a
half, and a user would have to change component inside it.

### …and then still wrong on some projects

Filtering to the families in use was not enough. A Google Fonts
stylesheet is a face per weight PER SUBSET — `Inter` at six weights is
**42 rules** — and it orders them `cyrillic-ext, cyrillic, greek-ext,
greek, vietnamese, latin-ext, latin`. The one an English page renders
in is LAST of every seven.

Embedding them in document order spent the byte cap on alphabets
nothing on the page uses and stopped before reaching the latin faces
the text was actually set in, so the font fell back — and only on the
projects with enough weights or families to reach the cap, which is
what made it look intermittent.

Faces are now matched against the code points in the captured text, the
way a browser picks them. Measured against the real response for that
six-weight family: **42 faces down to 6**, and about 400KB of base64
instead of over two megabytes. The cap is a backstop again rather than
the thing deciding the outcome, and hitting it now says so in the
console instead of silently producing the wrong typeface.

# Project thumbnails on the start screen — Plan

Status: **implemented.** All six questions answered below; every phase
built. Implementation notes live in `docs/notes/project-thumbnails.md` —
read that first, this plan is the reasoning behind it.

## Context

Start-screen project cards are currently text only: name, state, last
opened, short path. A card can carry a flat `cardBackground` colour from
`scamp.config.json`, which is the only visual differentiation between one
project and the next.

The ask: show a picture of the project so you recognise it by sight.
Capture it when the project closes, so it always reflects the latest
state, and store it in the project's `.scamp/` folder.

## What already exists

Almost all of the machinery. This is mostly assembly.

- **`capturePng`** (`src/renderer/src/lib/exportCapture.ts`) — wraps
  `html-to-image`, skips editor chrome via `data-canvas-chrome`, and
  internally neutralises the canvas `transform: scale` so the output is
  the design size rather than the current zoom.
- **Component thumbnails** — the exact same feature, one level down.
  `captureAndPersistComponentThumbnail` captures the canvas frame on every
  successful component save and writes
  `.scamp/component-thumbs/<Name>.png`; `ComponentSidebarItem` reads it
  back as base64 and falls back to a dashed placeholder. Channels:
  `ComponentWriteThumbnail` / `ComponentReadThumbnail`. See
  `docs/notes/components-thumbnails.md`.
- **`.scamp/` is already gitignored** by both scaffolds, and the file
  watcher ignores dotfile paths, so writing there triggers no project
  re-read.
- **A close-time hook** — `App.tsx`'s `onClose` already flushes the
  pending page write and fires a `session_close` snapshot.
- **A quit-time hook** — `snapshotOnShutdown` in `src/main/index.ts`,
  under `before-quit`, which is `preventDefault`ed so async work can
  finish before the app actually exits.

So: the capture function, the write-to-`.scamp` pattern, the read-back
pattern, the placeholder pattern, and both shutdown hooks are all built
and in use. What's new is a page-level thumbnail, the start-screen card
layout, and deciding *when* to capture.

## The part that doesn't work as stated

Capturing "when you close a project" has two problems worth settling
before any code gets written.

### 1. Closing is not the only way out — and it may not be the common one

`onClose` fires only when you click Close inside the app and land back on
the start screen. It does **not** fire when you quit with a project open
(Cmd/Ctrl+Q, closing the window, or a crash) — that path goes through
main's `before-quit`, where the renderer is still alive but nobody has
asked it for anything.

Quitting straight from a project seems at least as common as closing back
to the start screen. If capture only happens on `onClose`, a user who
always quits directly never gets a thumbnail at all, and nothing in the UI
would explain why.

### 2. Capture is async, and closing unmounts the canvas

`onClose` currently fires and unmounts synchronously — `setProject(null)`
on the next line. `html-to-image` clones the DOM subtree, inlines fonts and
images, rasterises through an SVG data URL, and only then resolves. Tear
the canvas down mid-flight and the result is a blank or partial image, and
it will be intermittent rather than reliably broken — the worst failure
shape to debug later.

The snapshot call next to it doesn't have this problem because main reads
the project from disk. A thumbnail needs the live DOM.

So a close-time capture must either be awaited before unmount (a visible
pause on a click that currently feels instant), or moved somewhere the DOM
is guaranteed to still be there.

### Recommendation

**Capture on save, not on close.** Piggyback the pipeline that already
exists for components: after a successful page write, `requestAnimationFrame`
then capture. That gives:

- freshness for free — the thumbnail is at most one save behind, which is
  a stronger guarantee than "as of last close";
- exit paths become irrelevant — quit, crash, force-quit, and power loss
  all keep the last good thumbnail;
- no teardown race, because nothing is unmounting;
- no new capture code — it is the component pipeline with a different key.

The cost is capturing more often than necessary. The component pipeline
already pays this and has for a while; the in-flight `Set` drops
overlapping captures, and it is fire-and-forget so a slow capture never
blocks a save.

I'd then optionally add a best-effort capture at `onClose` as belt and
braces, awaited with a short timeout (~400ms) so a slow capture can't make
Close feel broken. But on its own, close-time capture is the fragile
option, and I don't think it's what you actually want once the quit path
is on the table.

## Which page gets captured

"Project homepages" reads two ways and they behave very differently:

- **The `home` page specifically** — `app/page.tsx`, keyed `'home'`. The
  card is then a stable identity for the project. But if you spend a
  session working on `pricing`, no capture happens at all, and the card
  silently goes stale.
- **Whatever page you last had open** — always fresh, always reflects your
  work, but the card changes identity depending on where you happened to
  stop, which makes visual recognition worse rather than better.

I lean **home page only**, because the job of the card is recognition, not
reporting. A project should look like itself on the start screen. Under
save-driven capture that means: capture when the saved target is the
`home` page, ignore everything else.

Worth noting the interaction with capture timing: home-page-only capture
plus close-time capture is the worst combination — you'd only ever get a
thumbnail if you happened to be sitting on `home` at the moment you
clicked Close.

## Decisions (proposed — argue with any of these)

### Storage

`<projectPath>/.scamp/preview.png`, one file per project.

Sizing: the card grid is `minmax(220px, 1fr)`, so a thumbnail displays
around 220–320px wide. Capture the canvas frame at its intrinsic size,
then downscale to **640px wide** (2× for retina) and **crop to the card's
aspect ratio from the top**, not squash. A landing page is often 3000px
tall; scaling that whole thing into a 140px strip is an unreadable smear,
whereas the top 16:10 of it is recognisably the page.

Format: PNG matches components and keeps the code identical. A full-colour
page screenshot is a worse fit for PNG than a small component is —
JPEG at ~0.8 would be roughly a third the size — but `html-to-image`
exposes `toJpeg` already, so it's a one-line change if the sizes turn out
to bother us. Starting with PNG.

### Reading it back

Mirror components exactly: a `project:readThumbnail` channel returning
`{ base64: string | null }`, called per card. Base64 rather than a
`file://` src, because that's the established pattern here and it sidesteps
CSP questions.

`projects:list` gains a `hasThumbnail: boolean` so cards that will never
have an image render the placeholder immediately instead of flashing.

### Card layout

Thumbnail on top, text below, image area at a fixed aspect ratio so the
grid stays even. Projects with no thumbnail keep the current text-only
card — or get a `cardBackground`-filled block of the same height, which
keeps the grid regular. That's question 4.

### Backfill

Existing projects have no thumbnail until they're next opened and saved.
No migration, no background scan of every project — that would mean
opening and rendering every project on the start screen, which is a lot of
work for a picture. Cards fill in as you use them.

## Phases

1. **Capture + write.** `projectThumbnail.ts` in `src/renderer/src/lib/`
   modelled on `componentThumbnail.ts`; `ProjectWriteThumbnail` channel;
   main-side write into `.scamp/`. Downscale + crop helper as a pure
   function in `src/renderer/lib/` with its own tests.
2. **Read + render.** `ProjectReadThumbnail` channel, `hasThumbnail` on
   `StartScreenProject`, card layout with the image and the placeholder.
3. **Hook up the trigger.** Wire into the page-write path (and the
   close-time belt-and-braces capture, if we keep it).
4. **Housekeeping.** Delete the thumbnail when a project is removed from
   the list? (It lives in the project folder, so arguably it's the
   project's business, not ours.) Cap the file size so a pathological page
   can't write a 20MB PNG into someone's project.

## Files to touch

- `src/renderer/src/lib/projectThumbnail.ts` — new, capture + persist
- `src/renderer/lib/thumbnailCrop.ts` — new, pure sizing/crop maths + tests
- `src/renderer/src/syncBridge/writeIfDirty.ts` — the capture trigger
- `src/renderer/src/components/StartScreen.tsx` + `.module.css` — card
- `src/main/ipc/projectThumbnailOps.ts` — new, read/write under `.scamp/`
- `src/main/ipc/projectListOps.ts` — `hasThumbnail`
- `src/shared/ipcChannels.ts`, `src/shared/types.ts`
- `docs/notes/` — a note covering capture timing and why

## Tests

Unit tests for the crop/scale maths (pure, so: aspect ratios taller and
wider than the target, zero dimensions, tiny pages that shouldn't be
upscaled). Main-side ops tested against a real temp dir like the other
`.scamp/` writers. The capture itself needs a DOM and a real paint, so it
belongs in an e2e spec if anywhere — the component equivalent isn't
covered there today, which is a gap worth not widening.

## Things I'd need from you

Nothing external — no secrets, no backend, no release step. This is
entirely local. The one manual bit is looking at real thumbnails of your
own projects and telling me whether top-cropping reads well, because
that's a judgement call I can't make from here.

## Open questions

1. **Capture on save, or capture on close?** I've argued for save above:
   close-time capture misses the quit path entirely and races the canvas
   unmount. Answering "close anyway" is fine — I'd then await the capture
   with a timeout and accept that quitting from a project skips it. lets try on save then.

2. **Home page only, or the last page you were on?** I lean home only, for
   recognition. This interacts with question 1 — see the note above about
   the two together being the worst case. home page only

3. **Crop or fit?** Top-crop to the card aspect (my lean — a page is
   recognisable by its top), or letterbox the whole page into the frame so
   you see all of it small. Or capture a fixed viewport height, e.g. the
   top 1200px, so every card shows a comparable slice. crop

4. **What do projects with no thumbnail look like?** Text-only card at a
   shorter height (grid goes ragged), or a `cardBackground`-filled block
   the same size as an image (grid stays even, but an empty coloured
   rectangle might read as a broken image). card background filled block

5. **Does `cardBackground` survive?** It's currently the whole card's
   background. With an image on top it could stay as the card's base
   colour, become the placeholder fill, or go away. I lean: keep it as the
   placeholder fill and the card base. yest its the backup when there is no screenshot

6. **Should thumbnails travel with the project?** `.scamp/` is gitignored,
   so a project cloned to another machine shows a placeholder until it's
   opened and saved there. That seems right — a screenshot is a local
   cache, not project source — but it does mean a shared project looks
   blank to a collaborator on first open. Confirm you're happy with that. yeah thats fine.

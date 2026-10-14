# Compress images on import — Plan

Status: **implemented** — phases 1 and 2, using the **WebAssembly**
codecs. Phase 3 (converting existing projects) dropped on review: new
imports only.

## The encoder choice was reversed after testing

The plan below recommends `sharp`, and that recommendation was wrong.
sharp shipped, crashed, and was replaced by `@jsquash/*`.

libvips (sharp's engine) is a GObject library, and Chromium on Linux uses
GLib too. In a real Electron main process they corrupt each other's
GObject state: a stress loop produced 358 `g_object_ref: assertion
'G_IS_OBJECT (object)' failed` errors and never completed a single
encode. The same loop is clean in plain Node, and merely noisy under
`ELECTRON_RUN_AS_NODE` — so it's specifically Electron's bundled GLib.
sharp's install docs warn about exactly this; the warning is emitted
unconditionally on Linux *after* the binary loads, which is why it read
as spurious.

It was breaking the app, not just the tests: the e2e failures were the
main process dying (`Target page, context or browser has been closed`).
The same batch of six image specs passes 13/13 at the pre-WebP commit,
failed 1–2 every run with sharp, and passes 13/13 again on WASM.

WASM shares nothing with the host, so the conflict can't arise. It also
removes ~18MB per installer, the `asarUnpack` entries, and the
per-platform binary story entirely.

**Measured** (800×600 synthetic gradient-plus-grain fixtures):

| Source | Before | After | Saving | Time |
|---|---|---|---|---|
| Photo, JPEG q92 | 204 KB | 26 KB | −87% | 555ms |
| Same photo as PNG | 1128 KB | 41 KB | −96% | 427ms |
| Flat UI PNG | 18 KB | <1 KB | −99% | 62ms |

Encode cost scales as expected — a 1600×1000 image is ~650ms for both
encodes — which is fine for a user-initiated import and is why the
dropped bulk-convert phase was the only real argument for native speed.

Lesson recorded deliberately: a vendor's platform warning is a
hypothesis to disprove under load, not noise to explain away. One
successful encode proved nothing; the crash only appears on repeat.

## Context

Nothing in the pipeline touches image bytes today. `copyImage` is a plain
`fs.copyFile` and `saveImageBuffer` a plain `fs.writeFile`, there's no
image-processing dependency in `package.json`, and the generated TSX emits
a plain `<img src alt>`. A 4MB camera JPEG becomes a 4MB file in
`public/assets`, gets served at 4MB, and gets backed up at 4MB.

Goal: **fewer bytes, same pixels.** Not resizing, not `next/image` — just
re-encode to WebP so pages load fast and image-heavy projects don't
balloon in storage.

---

## Your options

You asked for the cross-platform picture, so here it is properly. All
three can encode WebP on macOS, Windows and Linux; they differ in what
they cost you.

### Option A — `sharp` (native, libvips)

The standard choice. Fastest by a wide margin, best compression ratios,
and the richest encoder controls (lossless, near-lossless, alpha quality,
effort level).

**The usual objection — "it's a native module, packaging will hurt" —
doesn't apply to this repo.** Two things already settle it:

1. **You already ship a native module.** `node-pty` is in `dependencies`,
   and `electron-builder.yml` already sets `npmRebuild: true` with a
   comment about rebuilding natives for the target platform.
2. **Your release workflow is already a per-platform matrix.**
   `.github/workflows/release.yml` builds on `macos-latest`,
   `windows-2022` and `ubuntu-latest` separately, so each runner's `npm
   install` pulls exactly the right prebuilt binary. sharp 0.35.3 ships
   prebuilds for darwin-arm64/x64, win32-arm64/ia32/x64 and
   linux(-musl)-x64/arm64 as optional dependencies — **nothing compiles.**

**Cost:** about **18MB** added to each installer (libvips is
`@img/sharp-libvips-*` at ~18MB unpacked; sharp itself is ~430KB). Against
an Electron app that's already 150MB+, that's ~12%.

**Risk:** if you ever build all three platforms from one machine, you'd
need `--platform`-specific installs. Your CI doesn't do that today.

### Option B — `@jsquash/webp` (WebAssembly)

The codecs compiled to WASM. **~915KB total, one small dependency, and
genuinely platform-independent** — the same `.wasm` runs everywhere, so
there is no per-platform binary story at all, in CI or locally.

**Cost:** slower than sharp — WASM with no SIMD threading is typically
several times slower on large images. For one user-initiated import that's
the difference between imperceptible and a brief spinner. For a bulk
"optimize this whole project" pass over hundreds of images, it's the
difference between seconds and minutes.

**Risk:** smaller ecosystem than sharp, though it's actively maintained
and is the maintained successor to the archived `@squoosh/lib`.

### Option C — Chromium's own encoder, zero dependencies

You already ship a WebP encoder: Electron's Chromium. A renderer-side
`canvas.toBlob(cb, 'image/webp', 0.8)` encodes WebP with no new package at
all, identically on every platform because it's the same bundled Chromium.

**Cost:** it's in the wrong process. Your rule is that the renderer never
touches disk — all file I/O goes through IPC — so the flow becomes: main
reads the file → sends multi-MB bytes to the renderer → renderer encodes
→ sends bytes back → main writes. Two large IPC copies per image, and the
encode is tied to a live window (awkward for a background bulk pass).
Chromium's encoder also gives you less control than libvips: quality only,
no lossless/effort knobs.

### Recommendation

**Option A, sharp.** The objection that normally rules it out is already
answered by your own CI and by node-pty, the compression is materially
better, and it's the only one of the three that stays comfortable when you
later want to optimize an entire existing project in one pass — which is
where your storage saving actually comes from, since today's projects are
already full of PNGs.

If the 18MB matters more than speed and ratio, **Option B** is the honest
fallback and would not change any of the design below — the encoder sits
behind one function either way.

---

## Design

### 1. What gets converted

| Source | Action |
|---|---|
| PNG, JPEG | → WebP |
| WebP | left alone (re-encoding only loses quality) |
| SVG | left alone (vector; minification is a separate job) |
| GIF | **left alone in v1** — animated GIF → animated WebP works but needs its own testing, and animated assets are rare in this tool |

### 2. Never write a bigger file

Small or already-optimized sources sometimes encode *larger* as WebP.
Encode into memory, compare against the source size, and keep the original
when WebP doesn't win. This makes the feature strictly non-harmful, which
matters because it runs silently on every import.

### 3. Lossless for PNG, lossy for JPEG — decided by trying both

A JPEG is already lossy, so lossy WebP at q80 is the right target. A PNG
might be a photo (wants lossy) or UI art with flat colour and text (wants
lossless, where WebP still beats PNG and is pixel-identical).

Rather than guess from the extension, encode both and keep the smaller.
It's a few extra milliseconds per import with sharp and it removes the
whole class of "why did my screenshot go blurry" complaints.

### 4. The encoder lives behind one function, in its own file

`src/main/ipc/imageOptimize.ts` exports one thing:

```ts
export const toWebpIfSmaller = async (
  sourcePath: string
): Promise<{ data: Buffer; ext: '.webp' } | null>;
```

Null means "keep the original". Keeping it out of `imageOps.ts` matters
because that file is compiled by **both** tsconfigs and its path logic is
covered by integration tests — those shouldn't have to load a native
module to test filename dedup.

### 5. Reuse still short-circuits before any encoding

The story-5 work returns early when the chosen file already *is* the asset
at the destination. Conversion goes strictly after that check: re-picking
an existing `hero.webp` must stay a no-op, not a re-encode.

---

## Phases

### Phase 1 — the encoder
`imageOptimize.ts` + tests. No wiring yet, so the dependency choice can be
validated on real files before anything depends on it.

### Phase 2 — convert on import
`copyImage` asks for a WebP; on success it writes the returned buffer
under `<base>.webp` and returns that reference. `saveImageBuffer` (the
clipboard-paste path) does the same.

**This also fixes an existing bug**: `clipboard.ts:39` calls
`image.toDataURL()`, which Electron always returns as PNG, and the handler
*requires* a PNG data URL. So pasting a photo that was originally a JPEG
currently re-encodes it to PNG — often several times larger than the
original. It's the one place the pipeline actively inflates files today.

### Phase 3 — optimize an existing project
A one-off action over `public/assets`: convert what's convertible, rewrite
the references in every page and component that points at the old
filenames. This is where the storage saving on today's projects comes
from; it's also the phase with real blast radius, so it lands last and
behind a confirm.

---

## Files to touch

**New:** `src/main/ipc/imageOptimize.ts`,
`test/integration/imageOptimize.integration.test.ts`.

**Modified:** `src/main/ipc/imageOps.ts`, `src/main/ipc/clipboard.ts`,
`package.json`, `test/integration/imageOps.integration.test.ts`.

**Shim regen:** both projects (`imageOps.ts` is in the web tsconfig for
its tests and the node tsconfig for the main process). Dev server stopped.

---

## Tests

**`test/integration/imageOptimize.integration.test.ts`** — real files in a
temp dir, real encoding, no mocking:
- a photographic PNG comes back smaller, as `.webp`, with the same pixel
  dimensions
- a JPEG comes back smaller as `.webp`
- an image that doesn't benefit returns null and the original is kept —
  the "never make it worse" guarantee
- an SVG and an existing `.webp` return null untouched
- a corrupt / non-image file returns null rather than throwing, so a bad
  file can't break an import

**`test/integration/imageOps.integration.test.ts`** — extended:
- importing `hero.png` produces `hero.webp` and the returned
  `relativePath` points at it
- re-picking the resulting `hero.webp` from the assets folder is still
  `reused: true` with no second file (the story-5 guarantee, now that the
  extension changes under it)

Only these spec files get run — per the standing rule, no directory
sweeps.

---

## Open questions

1. **Which encoder — A, B or C?** I recommend sharp (A); the packaging
   objection is already answered by your CI matrix and node-pty, and it's
   the only option that scales to phase 3. The trade is ~18MB per
   installer. yeah lets definitely go with Sharp

2. **Re-importing the same source file twice will duplicate it.** Today's
   dedup works because the destination filename matches the source's;
   once `hero.png` lands as `hero.webp`, a second import of the same
   `hero.png` finds no `hero.png` in assets, converts again, and lands as
   `hero-1.webp`. Options: accept it (it matches today's behaviour for
   same-named files from different folders), or hash the source bytes —
   we're reading them to encode anyway — and keep a small
   `.scamp/assets.json` manifest mapping hash → filename, which would let
   re-imports short-circuit entirely. I lean **accept for v1**, manifest
   later if it annoys you. a user can alway reimport from external projects, but if a user chooses a file already in our image folder from within a project that simply gets linked to a page so I think we only need to check where is the image coming from and what is the file type? we can discuss further if you need.

3. **Should conversion be silent, or visible?** Silent matches how the
   reuse fix behaves and keeps imports frictionless. The argument for
   showing something ("hero.png → hero.webp, 2.1MB → 240KB") is that it
   teaches the user the feature exists and reassures them their file
   wasn't mangled. I lean **silent, with the saving logged**, but this is
   the kind of thing worth seeing once before deciding. yeah silent works for me

4. **Is a quality knob wanted in Settings?** A fixed q80 covers almost
   everything, and a setting invites fiddling with something most users
   can't evaluate. I'd ship without one and add it only if a real project
   needs it. yeah lets go with out for now

5. **Phase 3 scope — how aggressive?** Converting existing assets means
   rewriting `src` references across every page and component file. Safe
   enough given the sync pipeline, but it's a bulk rewrite of the user's
   source. Should it be opt-in per project (a button in Settings), or
   offered when Scamp notices a project has many large PNGs? I wouldnt worry about current projects, leave them as is, just let the convert happen on import of new images
   

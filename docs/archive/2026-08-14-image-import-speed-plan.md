# Large image imports are too slow — Plan

Status: **implemented** — A, B, C, plus a dimension cap (D not built).

## Encoder swapped back to sharp, in a child process

The WASM pipeline left a 96MP import at ~3.6s, which still read as
broken. sharp does the same job in ~1.9s.

The crash that ruled sharp out earlier was specific to **Electron's main
process**: Chromium uses GLib there, and libvips' GObject collides with
it. In a forked child process libvips is the only user — 25 sequential
conversions of the 96MP file, no failure. (Electron still prints GLib
warnings on startup in the child; they're noise, not a symptom.) Web
servers run sharp under plain Node, which is why "sharp works fine on
Linux" and "sharp crashed our app on Linux" were both true.

libvips also shrinks JPEGs on load via libjpeg's DCT scaling, so an
oversized photo is never fully decoded — the thing `@jsquash/jpeg`
couldn't expose.

The deferred placement from the previous round was reverted. At ~1.9s the
import is short enough to just do, and doing it up front avoids showing
the 96MP original on the canvas (Chromium decoding 96MP is its own
stutter) and avoids the visible swap when the reference changed. An
"Optimising image…" indicator covers the wait.

**Packaging** — three entries needed unpacking from the asar, all of
which fail only in a packaged build: sharp itself, its `@img/*` binary
package, and **sharp's own dependencies** (`detect-libc`, `semver`),
since resolution from the unpacked copy walks up
`app.asar.unpacked/node_modules` and cannot fall back into the asar. The
forked child script needs unpacking for the same reason. Verified by
packaging a Linux build and converting the real 96MP file inside it.

## The cap was the missing piece

A + B + C left a real 96MP import (12000x8002, 7.28MB) at ~32s and
2.94MB. Both numbers had the same cause: keeping 96 megapixels that can
never be displayed. A 12000px-wide photo renders at maybe 1200-2000 CSS
pixels.

Capping the long edge at **3000px** — only ever shrinking, never
upscaling — plus two things found while measuring it:

- **The wasm resampler scales with OUTPUT pixels**, not input: ~3.4s for
  any 3000px result whether the source was 12MP or 96MP. Replaced with a
  separable area-average resample in plain JS, which is the correct
  filter for downscaling and roughly 10x faster. `@jsquash/resize` was
  removed again as a result.
- **An integer box pre-pass** handles the bulk of a large reduction at
  ~0.34s for a 4x cut on 96MP, leaving at most a sub-2x remainder.

**Final, on the real file and typical sizes:**

| Image | Before | After | Time |
|---|---|---|---|
| 96MP real photo (7.28MB) | 2.94MB / ~32s | **0.41MB** | **3.4s** (2.9s warm) |
| 24MP | — | 1.24MB | 2.0s |
| 12MP | — | 1.65MB | 2.1s |
| 2MP (within cap) | — | 0.70MB | 0.5s |

The app stays responsive throughout — 337 event-loop ticks during the
96MP conversion, against zero before any of this work.

Remaining lever, not taken: mozjpeg can decode at 1/2, 1/4, 1/8 scale in
the DCT domain, which would remove both the 1.8s full decode of a 96MP
JPEG and the box pass. `@jsquash/jpeg` doesn't expose it.

## What's actually happening

Measured on a 12MP (4000×3000) photo saved as a 2.8MB JPEG — smaller
than the 7MB file that prompted this:

| Step | Time | Output |
|---|---|---|
| JPEG decode | 201ms | — |
| WebP encode, lossy q80 | 2276ms | 2.57MB |
| WebP encode, lossless | 6742ms | **7.23MB** |
| **Total** | **~9.2s** | keeps the 2.57MB lossy |

Three separate problems, in increasing order of how bad they are:

### 1. Three quarters of the wait is thrown away

The lossless encode took 6.7s to produce 7.23MB — **larger than the
2.8MB source**, so it loses the comparison and is discarded. On any
photograph it always will: lossless is for flat graphic content. We are
spending most of the import doing work whose result is guaranteed to be
binned.

### 2. We're running the slow encoder by mistake

jsquash's `init` auto-selects the SIMD build when the runtime supports it
— and it does. But we hand it `wasmBinary: webp_enc.wasm`, the *non*-SIMD
binary, which overrides that choice. Pointing at `webp_enc_simd.wasm`
instead is **1.7x faster with byte-identical output** (359ms vs 620ms on
a 3MP image).

### 3. The encode freezes the entire app

WASM runs synchronously on the calling thread. A timer ticking every 10ms
during a 420ms encode got **zero ticks** — the main process event loop is
completely blocked. So for those 9 seconds the app isn't slow, it's
wedged: no IPC, no saves, no file-watcher handling, no window redraw.

This is almost certainly what "took way too long" felt like.

---

## Options

### A. Skip the lossless attempt when it can't win — *small*

Only try lossless for PNG sources under a pixel budget (~4MP). A JPEG is
already lossy, so lossless WebP of one is pointless by construction; a
huge PNG photo loses for the same reason a JPEG does. Flat UI art — where
lossless genuinely wins, and wins big — is small.

Removes ~6.7s of the 9.2s.

### B. Use the SIMD binary — *one line*

Point `wasmBinary` at `webp_enc_simd.wasm`. 1.7x, identical output.

**A and B together take the 12MP import from ~9.2s to ~1.5s.**

### C. Move the encode off the main thread — *medium*

Run it in a `worker_threads` Worker (or an Electron `utilityProcess`).
The app stays fully responsive regardless of image size; the import
itself still takes ~1.5s before the image appears.

Worth doing on its own merits: even 1.5s of a frozen main process is a
visible hitch, and a 24MP image would still be ~3s.

### D. Place the image immediately, convert in the background — *large*

What you asked for. Copy the original (a fast file copy), place the
element referencing it, convert in the background, then swap the
reference to the `.webp` when it lands.

The image appears in ~50ms regardless of size. But the conversion now
finishes *after* the element exists, which means mutating the user's
document asynchronously, and that has real edges:

- **The `src` patch is a document mutation arriving out of nowhere.** Is
  it undoable? A separate history entry would let the user undo "the
  thing they didn't do"; a silent patch means undo skips past it.
- **Undo during conversion.** If the insert is undone while the encode is
  in flight, the swap must find nothing and clean up its orphan file.
- **Page or project switch during conversion**, or quitting the app —
  leaving a `.png` reference and a stray `.webp`, or vice versa.
- **The element may have been copied or duplicated** before the swap, so
  more than one reference needs patching.
- **Two saves and two watcher events** per import instead of one.

None of it is unsolvable, but it's a class of bug that shows up as "my
image reverted" reports much later.

---

## Recommendation

**A + B + C**, and stop there unless it still feels slow.

That's ~1.5s for a 12MP photo with the app fully responsive throughout —
a 6x improvement from two nearly-trivial changes plus a worker. D buys
the remaining 1.5s of perceived latency at the cost of async document
mutation, and I'd rather you feel A+B+C first and decide whether that
last step is worth it.

If you want D regardless, it's cleanest built *on top of* C — the worker
is what makes background conversion safe to run without freezing anything.

---

## Phases

### Phase 1 — A + B
`imageOptimize.ts` only. Point at the SIMD binary; gate the lossless
attempt on source type and pixel count. Extend the integration tests with
a large-image case asserting the lossless path is skipped.

### Phase 2 — C
Move `encodeSmaller` into a worker. The module's public API
(`toWebpIfSmaller` / `bufferToWebpIfSmaller`) doesn't change, so nothing
upstream moves. The worker must fail soft exactly as the codecs do today:
if it can't start, imports proceed uncompressed.

### Phase 3 — D, only if wanted
Optimistic placement, built on the phase-2 worker.

---

## Files to touch

**Phase 1:** `src/main/ipc/imageOptimize.ts`,
`test/integration/imageOptimize.integration.test.ts`.

**Phase 2** turned out to need no new file. electron-vite emits main as
one bundle, so a separate worker entry would have to be located on disk
at runtime — inside the asar when packaged, which is exactly the
works-in-dev-fails-when-packaged trap this feature already hit once. The
worker body is a string passed to `new Worker(src, { eval: true })`
instead: no path to get wrong, and every module and `.wasm` it needs is
resolved by the parent and handed over as an absolute path.

**Shim regen:** both projects. Dev server stopped.

---

## Tests

- a large photo converts without attempting lossless (assert on time or
  by exposing which encodes ran — timing alone is flaky, so the encoder
  should report what it tried)
- a small PNG still tries both and keeps the lossless result when smaller
- the SIMD swap doesn't change output size or dimensions
- **phase 2:** the event loop keeps ticking during an encode — the direct
  regression for the freeze, and the reason to do C at all
- **phase 2:** a worker that fails to start degrades to uncompressed
  imports rather than failing them

---

## Open questions

1. **Is A + B + C enough, or do you want D?** My read is that a
   responsive 1.5s import is fine and D's async document mutation isn't
   worth it — but you're the one who felt the delay, so if instant
   placement is what you actually want, say so and I'll build it on the
   worker.

2. **The lossless pixel budget.** I've proposed 4MP. Above it we always
   go lossy, which for a large flat-colour PNG means a slightly worse
   result than it could have had. Lower is faster and slightly worse for
   big graphics; higher is the reverse.

3. **Should a slow import show any progress?** Right now the picker
   closes and nothing happens until the image appears. Even with C that's
   ~1.5s of silence. A spinner on the canvas would cover it — worth it,
   or noise?

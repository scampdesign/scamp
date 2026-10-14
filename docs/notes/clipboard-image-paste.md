# Reading a pasted image off the clipboard

Electron 44 [rearchitected the clipboard module][rfc] around the W3C
Clipboard API. `clipboard.readImage()` — which is what
`src/main/ipc/clipboard.ts` used to call — no longer exists. Reads now go
through `clipboard.read()`, which resolves to `ClipboardItem[]`, and each
item exposes `types: string[]` plus `getType(mime) → Promise<Blob>`.

[rfc]: https://github.com/electron/rfcs/blob/main/text/0019-clipboard-rearchitecture.md

## Why there is still a NativeImage in the path

The old `readImage()` did two things at once: it pulled whatever image
the OS was offering, and it decoded that into a `NativeImage`, whose
`toDataURL()` always emits PNG. The rest of the paste path depends on
that PNG guarantee — `IPC.ClipboardSaveImage` matches the payload
against `/^data:image\/png;base64,(.+)$/` and rejects anything else.

`clipboard.read()` gives back raw bytes in whatever MIME type the
platform advertises. Chromium normally normalizes images to `image/png`,
so the common path is a straight base64 encode with no decoding at all.
But macOS clipboards can carry `image/tiff` (screenshots and several
native apps), and Linux/X11 can carry `image/bmp`. Those would fail the
PNG regex downstream, which is a regression against the old behaviour
where `NativeImage` quietly absorbed them.

So the non-PNG branch routes the buffer through
`nativeImage.createFromBuffer()` and re-emits via `toDataURL()`. That is
exactly what `readImage()` was doing internally; it is just explicit now.

## Why not sharp

sharp is already a dependency and is the obvious tool for a format
convert — but it **must not be called from the main process**. libvips'
GObject collides with the GLib instance Chromium runs there, which is
why image optimisation is done in a forked child in the first place. See
`docs/archive/2026-08-14-image-import-speed-plan.md`. Spawning a child process for a
clipboard paste would add process-launch latency to an interaction that
should feel instant, so `NativeImage` — already in-process — wins.

The tradeoff: `NativeImage` decodes fewer formats than libvips. If a
clipboard image is neither PNG nor something `NativeImage` recognises,
the read reports `kind: 'empty'` and the paste is a no-op rather than an
error. That matches the old behaviour, which returned empty whenever
`readImage()` produced an empty image.

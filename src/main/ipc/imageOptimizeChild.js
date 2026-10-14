"use strict";
/**
 * Image conversion, in a child process.
 *
 * sharp is built on libvips, a GObject library, and Chromium on Linux
 * uses GLib too — run in Electron's MAIN process the two corrupt each
 * other's GObject state and take the app down after a handful of
 * encodes. In a separate process libvips is the only thing touching
 * GObject and it's stable: 25 sequential conversions of a 96MP photo
 * with no failure. (Electron still prints GLib warnings at startup here;
 * they're noise, not a symptom.)
 *
 * Forked with ELECTRON_RUN_AS_NODE, so this file runs as plain Node.
 * `sharp` is required by absolute path, handed over by the parent, because
 * this file is resolved from the app bundle rather than from a place
 * where bare-specifier resolution would find node_modules.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const send = (msg) => {
    process.send?.(msg);
};
const sharpPath = process.env['SCAMP_SHARP_PATH'] ?? 'sharp';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require(sharpPath);
process.on('message', (job) => {
    void (async () => {
        try {
            // One pipeline: libvips shrinks JPEGs on load (libjpeg's DCT
            // scaling), so an oversized photo is never fully decoded.
            // `withoutEnlargement` means an image already within the cap is
            // passed through at its own size.
            const pipeline = () => sharp(job.sourcePath, { failOn: 'none' })
                .rotate()
                .resize({
                width: job.maxLongEdge,
                height: job.maxLongEdge,
                fit: 'inside',
                withoutEnlargement: true,
            });
            // Mirrors shouldTryLossless() in the parent — the tested statement
            // of this rule — with the threshold passed in so the two can't
            // drift. Lossless wins on flat graphic content (a UI screenshot,
            // a logo) and loses badly on photographs, where it's also the
            // slowest encode.
            const meta = await pipeline().metadata();
            const pixels = (meta.width ?? 0) * (meta.height ?? 0);
            const tryLossless = meta.format === 'png' && pixels > 0 && pixels <= job.losslessMaxPixels;
            const outs = [
                await pipeline().webp({ quality: job.quality }).toBuffer(),
            ];
            if (tryLossless) {
                outs.push(await pipeline().webp({ lossless: true }).toBuffer());
            }
            const data = outs.reduce((a, b) => (b.length < a.length ? b : a));
            send({ id: job.id, ok: true, data });
        }
        catch {
            // Not a decodable image, or sharp refused it. The caller keeps the
            // original rather than failing the import.
            send({ id: job.id, ok: true, data: null });
        }
    })();
});
send({ ready: true });

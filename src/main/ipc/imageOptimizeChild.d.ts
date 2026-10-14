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
type Job = {
    id: number;
    sourcePath: string;
    maxLongEdge: number;
    quality: number;
    /** Above this many pixels, or for a non-PNG source, lossless is skipped. */
    losslessMaxPixels: number;
};
type Reply = {
    ready: true;
} | {
    id: number;
    ok: true;
    data: Buffer | null;
} | {
    id: number;
    ok: false;
};
declare const send: (msg: Reply) => void;
declare const sharpPath: string;
declare const sharp: any;

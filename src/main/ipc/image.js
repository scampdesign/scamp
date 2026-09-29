import { dialog, ipcMain, net } from 'electron';
import { promises as fs } from 'fs';
import { IPC } from '@shared/ipcChannels';
import { tmpdir } from 'os';
import { join } from 'path';
import { copyImage, assetsDirFor } from './imageOps';
import { getProjectFormat } from './projectFormatCache';
import { assertInsideActiveProject } from './pathContainment';
import { suppressNextChange } from '../watcher';
const IMAGE_FILTERS = [
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'] },
];
/**
 * Open a native file dialog filtered to image formats.
 * Optionally starts in `defaultPath` (e.g. the project's assets folder).
 */
const chooseImage = async (args) => {
    // Ensure the target directory exists before opening the dialog —
    // Electron silently ignores a defaultPath that doesn't exist.
    if (args?.defaultPath) {
        await fs.mkdir(args.defaultPath, { recursive: true });
    }
    // On Linux (GTK), defaultPath must end with a path separator to be
    // treated as a directory. Without it, GTK interprets the last segment
    // as a filename filter/prefix and opens the parent directory instead.
    let resolvedDefault = args?.defaultPath;
    if (resolvedDefault && !resolvedDefault.endsWith('/') && !resolvedDefault.endsWith('\\')) {
        resolvedDefault += '/';
    }
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: IMAGE_FILTERS,
        defaultPath: resolvedDefault,
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: null };
    }
    return { canceled: false, path: result.filePaths[0] };
};
/** Types we are willing to write into a project's assets. */
const FETCHABLE = /^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/;
/** 20MB. A hero image is under a megabyte; anything past this is a mistake. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/**
 * Download one remote image into the project's assets.
 *
 * Written through the existing `copyImage`, which already converts to
 * WebP when that is smaller, dedupes against what is there, and names
 * the file — an importer that wrote its own copy would drift from all
 * three. The only new part is getting the bytes onto disk first.
 *
 * Every failure is a returned error rather than a throw: an import that
 * pulls forty images should not lose the other thirty-nine because one
 * host was down. see docs/plans/website-import-plan.md
 */
/** `data:[<type>][;base64],<payload>` → bytes plus its media type. */
const decodeDataUrl = (href) => {
    const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(href);
    if (match === null)
        return null;
    const [, type, base64, payload] = match;
    try {
        const bytes = base64
            ? Buffer.from(payload ?? '', 'base64')
            : Buffer.from(decodeURIComponent(payload ?? ''), 'utf-8');
        return { bytes, type: type || 'text/plain' };
    }
    catch {
        return null;
    }
};
const fetchImage = async (args) => {
    let parsed;
    try {
        parsed = new URL(args.url);
    }
    catch {
        return { ok: false, error: `Not a URL: ${args.url}` };
    }
    // `data:` is allowed alongside http(s) so an INLINE svg can go through
    // the same pipeline as a downloaded one — temp file, `copyImage`, the
    // project's assets folder, one reference path. It reads no network and
    // is still bounded by MAX_IMAGE_BYTES below.
    const isData = parsed.protocol === 'data:';
    if (!isData && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: `Refusing ${parsed.protocol} — only http, https and data.` };
    }
    assertInsideActiveProject(args.projectPath);
    let tempPath = null;
    try {
        // `net.fetch` does not do `data:`, so it is decoded here. The shape
        // is deliberately the same from here down.
        const fromData = isData ? decodeDataUrl(parsed.href) : null;
        if (isData && fromData === null) {
            return { ok: false, error: 'Could not read that data: URL.' };
        }
        const response = fromData === null ? await net.fetch(parsed.href, { redirect: 'follow' }) : null;
        if (response !== null && !response.ok) {
            return { ok: false, error: `${response.status} from ${parsed.host}` };
        }
        const type = fromData?.type ??
            ((response?.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '');
        if (!FETCHABLE.test(type)) {
            return { ok: false, error: `${parsed.pathname} is ${type || 'an unknown type'}` };
        }
        const bytes = fromData?.bytes ?? Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
            return { ok: false, error: `${parsed.pathname} is ${Math.round(bytes.byteLength / 1e6)}MB` };
        }
        // `copyImage` reads from a path, so the bytes land in a temp file
        // first. Named from the URL so the asset keeps a recognisable name.
        const ext = type === 'image/svg+xml' ? '.svg' : `.${type.split('/')[1]?.replace('jpeg', 'jpg')}`;
        const base = (isData
            ? (args.assetName ?? 'icon')
            : (parsed.pathname.split('/').pop() ?? 'image'))
            .replace(/\.[^.]*$/, '')
            .replace(/[^\w-]+/g, '-') || 'image';
        tempPath = join(await fs.mkdtemp(join(tmpdir(), 'scamp-import-')), `${base}${ext}`);
        await fs.writeFile(tempPath, bytes);
        const format = await getProjectFormat(args.projectPath);
        const result = await copyImage({ sourcePath: tempPath, projectPath: args.projectPath }, format);
        if (!result.reused) {
            suppressNextChange(join(assetsDirFor(args.projectPath, format), result.fileName));
        }
        return { ok: true, relativePath: result.relativePath, fileName: result.fileName };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    finally {
        if (tempPath !== null) {
            await fs.rm(join(tempPath, '..'), { recursive: true, force: true }).catch(() => undefined);
        }
    }
};
/**
 * Ask Google Fonts which families it actually serves.
 *
 * The `css2` endpoint is its own oracle: it answers 200 with a
 * stylesheet for a family it has and 400 for one it does not, which is
 * more reliable than shipping a list that goes stale. One request per
 * family, in parallel, and a network failure reads as "not available"
 * rather than failing the import — a font we could not check is one the
 * user should be told to install either way.
 * see docs/plans/website-import-plan.md
 */
/**
 * Every family's variable axes, from Google's public metadata.
 *
 * One request for the whole catalogue rather than one per family, and a
 * failure degrades to "no axes known" — which yields the old
 * weights-only URL rather than failing the import.
 */
const googleFontAxes = async () => {
    try {
        const response = await net.fetch('https://fonts.google.com/metadata/fonts', {
            headers: { 'user-agent': 'Mozilla/5.0' },
        });
        if (!response.ok)
            return {};
        // The body carries an anti-JSON-hijacking prefix before the object.
        const parsed = JSON.parse((await response.text()).replace(/^[^{]*/, ''));
        const list = parsed.familyMetadataList;
        if (!Array.isArray(list))
            return {};
        const out = {};
        for (const entry of list) {
            const fam = entry;
            if (typeof fam.family !== 'string' || !Array.isArray(fam.axes))
                continue;
            const axes = [];
            for (const raw of fam.axes) {
                const a = raw;
                if (typeof a.tag !== 'string' || typeof a.min !== 'number' || typeof a.max !== 'number') {
                    continue;
                }
                axes.push({ tag: a.tag, min: a.min, max: a.max });
            }
            out[fam.family] = axes;
        }
        return out;
    }
    catch {
        return {};
    }
};
const resolveGoogleFonts = async (args) => {
    const out = {};
    const axes = await googleFontAxes();
    await Promise.all(args.families.slice(0, 24).map(async (family) => {
        const name = encodeURIComponent(family.trim()).replace(/%20/g, '+');
        try {
            const response = await net.fetch(`https://fonts.googleapis.com/css2?family=${name}`, 
            // Google serves different formats per UA; any modern one is fine,
            // and the status is all we read.
            { headers: { 'user-agent': 'Mozilla/5.0' } });
            out[family] = response.ok ? (axes[family.trim()] ?? []) : false;
        }
        catch {
            out[family] = false;
        }
    }));
    return out;
};
export const registerImageIpc = () => {
    ipcMain.handle(IPC.FileCopyImage, async (_e, args) => {
        // The copy destination is derived from `projectPath`; keep it inside
        // the active project. `sourcePath` is a user-chosen file (native
        // dialog) and may legitimately live anywhere, so it isn't contained.
        assertInsideActiveProject(args.projectPath);
        const format = await getProjectFormat(args.projectPath);
        const result = await copyImage(args, format);
        // Suppress the watcher event for our own asset write so importing an
        // SVG doesn't immediately fire a "changed externally" reload prompt.
        // Only when we actually wrote: a suppression with no write to match
        // stays armed and swallows the next REAL edit to that file instead.
        if (!result.reused) {
            suppressNextChange(join(assetsDirFor(args.projectPath, format), result.fileName));
        }
        return result;
    });
    ipcMain.handle(IPC.FileChooseImage, async (_e, args) => chooseImage(args));
    ipcMain.handle(IPC.ImportFetchImage, async (_e, args) => fetchImage(args));
    ipcMain.handle(IPC.ImportResolveFonts, async (_e, args) => resolveGoogleFonts(args));
    // Read a file's UTF-8 text. Used to inline an imported `.svg` (the path
    // comes from the native picker) and to reload an SVG whose asset file
    // changed on disk. Only `.svg` files are readable through this channel —
    // it isn't a general filesystem escape hatch.
    ipcMain.handle(IPC.FileReadText, async (_e, filePath) => {
        if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.svg')) {
            throw new Error('FileReadText: only .svg files may be read');
        }
        return fs.readFile(filePath, 'utf-8');
    });
};

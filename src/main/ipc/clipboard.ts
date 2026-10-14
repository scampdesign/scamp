import { clipboard, ipcMain, nativeImage } from 'electron';
import { IPC } from '@shared/ipcChannels';
import type {
  ClipboardReadResult,
  ClipboardWriteArgs,
  ClipboardSaveImageArgs,
  CopyImageResult,
} from '@shared/types';
import { saveImageBuffer } from './imageOps';
import { getProjectFormat } from './projectFormatCache';
import { assertInsideActiveProject } from './pathContainment';

/** Cheap structural check mirroring lib/svg.isSvgMarkup (the renderer
 *  helper is DOM-side and can't be imported here). */
const looksLikeSvg = (text: string): boolean =>
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s/>]/i.test(text);

/**
 * Pull a raster image off the clipboard as a PNG data URL, or null when
 * the clipboard holds no image this process can decode. Non-PNG payloads
 * go through NativeImage, which is what the removed `clipboard.readImage`
 * did implicitly. see docs/notes/clipboard-image-paste.md
 */
const readClipboardImage = async (): Promise<string | null> => {
  const items = await clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type === undefined) continue;
    const payload = await item.getType(type);
    if (!(payload instanceof Blob)) continue;
    const buffer = Buffer.from(await payload.arrayBuffer());
    if (buffer.length === 0) continue;
    if (type === 'image/png') {
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }
    const image = nativeImage.createFromBuffer(buffer);
    if (!image.isEmpty()) return image.toDataURL();
  }
  return null;
};

/**
 * Read the OS clipboard for a canvas paste: SVG markup (text) wins, then
 * a raster image (returned as a PNG data URL), else empty. Sanitization /
 * normalization of svg happens in the renderer (lib/svg) before insert.
 * see docs/archive/2026-06-30-svg-improvements-plan.md
 */
export const registerClipboardIpc = (): void => {
  // Goes through the main process rather than `navigator.clipboard`: the
  // renderer loads from `file://` in the packaged app, which is not a
  // secure context, so the web API isn't reliably available there.
  ipcMain.handle(IPC.ClipboardWrite, async (_e, args: ClipboardWriteArgs) => {
    await clipboard.writeText(args.text);
  });

  ipcMain.handle(IPC.ClipboardRead, async (): Promise<ClipboardReadResult> => {
    const text = await clipboard.readText();
    if (text.length > 0 && looksLikeSvg(text)) {
      return { kind: 'svg', svg: text };
    }
    const dataUrl = await readClipboardImage();
    if (dataUrl !== null) {
      return { kind: 'image', dataUrl };
    }
    return { kind: 'empty' };
  });

  ipcMain.handle(
    IPC.ClipboardSaveImage,
    async (_e, args: ClipboardSaveImageArgs): Promise<CopyImageResult> => {
      assertInsideActiveProject(args.projectPath);
      const format = await getProjectFormat(args.projectPath);
      const m = /^data:image\/png;base64,(.+)$/.exec(args.dataUrl);
      if (!m) throw new Error('clipboard image is not a PNG data URL');
      const data = Buffer.from(m[1]!, 'base64');
      return saveImageBuffer(args.projectPath, data, 'pasted-image', '.png', format);
    }
  );
};
